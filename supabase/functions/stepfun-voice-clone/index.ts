/**
 * StepFun Voice Clone Edge Function
 *
 * Two operations:
 * 1. Upload reference audio → get file_id
 * 2. Create voice clone from file_id → get voice_id
 *
 * POST /stepfun-voice-clone
 *   Body: multipart/form-data with "audio" field (5-10s reference audio)
 *   OR JSON: { "file_id": "...", "model": "step-tts-mini", "text": "..." }
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STEPFUN_FILES_URL = "https://api.stepfun.com/v1/files";
const STEPFUN_VOICES_URL = "https://api.stepfun.com/v1/audio/voices";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const resp = await fetch(url, options);
    if (resp.status !== 503 || attempt === retries) return resp;
    console.log(`[voice-clone] 503 received, retry ${attempt}/${retries} in ${RETRY_DELAY_MS}ms...`);
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  }
  // unreachable but satisfies TS
  return fetch(url, options);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("STEPFUN_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "STEPFUN_API_KEY not configured" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      // Step 1: Upload audio file to StepFun, then clone voice
      const formData = await req.formData();
      const audioFile = formData.get("audio") as File | null;
      const referenceText = formData.get("text") as string | null;
      const model = (formData.get("model") as string) || "step-tts-mini";

      if (!audioFile) {
        return new Response(
          JSON.stringify({ error: "Missing 'audio' field" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Upload file to StepFun
      const uploadForm = new FormData();
      uploadForm.append("file", audioFile, audioFile.name || "reference.wav");
      uploadForm.append("purpose", "storage");

      console.log("[voice-clone] Uploading reference audio...");
      const uploadResp = await fetchWithRetry(STEPFUN_FILES_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: uploadForm,
      });

      if (!uploadResp.ok) {
        const errText = await uploadResp.text();
        console.error("[voice-clone] Upload failed:", uploadResp.status, errText);
        return new Response(
          JSON.stringify({ error: "Failed to upload audio", detail: errText }),
          {
            status: uploadResp.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const uploadResult = await uploadResp.json();
      const fileId = uploadResult.id;
      console.log("[voice-clone] File uploaded, id:", fileId);

      // Create voice clone
      const cloneBody: Record<string, string> = {
        file_id: fileId,
        model: model,
      };
      if (referenceText && referenceText.length >= 10) {
        // Only send text for CER validation if it's long enough to be a real transcript
        cloneBody.text = referenceText;
      }

      console.log("[voice-clone] Creating voice clone...");
      const cloneResp = await fetchWithRetry(STEPFUN_VOICES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(cloneBody),
      });

      if (!cloneResp.ok) {
        const errText = await cloneResp.text();
        console.error("[voice-clone] Clone failed:", cloneResp.status, errText);
        return new Response(
          JSON.stringify({ error: "Failed to clone voice", detail: errText }),
          {
            status: cloneResp.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const cloneResult = await cloneResp.json();
      console.log("[voice-clone] Voice cloned, id:", cloneResult.id);

      return new Response(
        JSON.stringify({
          voice_id: cloneResult.id,
          file_id: fileId,
          duplicated: cloneResult.duplicated || false,
          sample_audio: cloneResult.sample_audio || null,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } else {
      // JSON request - clone from existing file_id
      const body = await req.json();
      const { file_id, model, text, sample_text } = body;

      if (!file_id) {
        return new Response(
          JSON.stringify({ error: "Missing file_id" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const cloneBody: Record<string, string> = {
        file_id,
        model: model || "step-tts-mini",
      };
      if (text) cloneBody.text = text;
      if (sample_text) cloneBody.sample_text = sample_text;

      const cloneResp = await fetchWithRetry(STEPFUN_VOICES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(cloneBody),
      });

      const result = await cloneResp.text();
      return new Response(result, {
        status: cloneResp.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    console.error("[voice-clone] Error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
