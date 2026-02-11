/**
 * Minimax Voice Clone Edge Function
 *
 * Two-step process:
 * 1. Upload reference audio → get file_id via Minimax Files API
 * 2. Clone voice from file_id → get voice_id via Minimax Voice Clone API
 *
 * POST /stepfun-voice-clone
 *   Body: multipart/form-data with "audio" field (10s-5min reference audio)
 *   Optional: "text" field for reference text
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MINIMAX_UPLOAD_URL = "https://api.minimax.chat/v1/files/upload";
const MINIMAX_VOICE_CLONE_URL = "https://api.minimax.chat/v1/voice_clone";

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
  return fetch(url, options);
}

function generateVoiceId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "cloned_";
  for (let i = 0; i < 12; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
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

  const apiKey = Deno.env.get("MINIMAX_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "MINIMAX_API_KEY not configured" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    const contentType = req.headers.get("content-type") || "";

    if (!contentType.includes("multipart/form-data")) {
      return new Response(
        JSON.stringify({ error: "Expected multipart/form-data" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;

    if (!audioFile) {
      return new Response(
        JSON.stringify({ error: "Missing 'audio' field" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Step 1: Upload audio file to Minimax
    const uploadForm = new FormData();
    uploadForm.append("file", audioFile, audioFile.name || "reference.wav");
    uploadForm.append("purpose", "voice_clone");

    console.log("[voice-clone] Uploading reference audio to Minimax...");
    const uploadResp = await fetchWithRetry(MINIMAX_UPLOAD_URL, {
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
    const fileId = uploadResult.file?.file_id || uploadResult.file_id;
    if (!fileId) {
      console.error("[voice-clone] No file_id in upload response:", JSON.stringify(uploadResult));
      return new Response(
        JSON.stringify({ error: "No file_id in upload response", detail: JSON.stringify(uploadResult) }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    console.log("[voice-clone] File uploaded, id:", fileId);

    // Step 2: Clone voice
    const customVoiceId = generateVoiceId();
    const cloneBody: Record<string, unknown> = {
      file_id: fileId,
      voice_id: customVoiceId,
    };

    console.log("[voice-clone] Creating voice clone, voice_id:", customVoiceId);
    const cloneResp = await fetchWithRetry(MINIMAX_VOICE_CLONE_URL, {
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
    console.log("[voice-clone] Clone result:", JSON.stringify(cloneResult));

    // Check for API-level error
    if (cloneResult.base_resp && cloneResult.base_resp.status_code !== 0) {
      console.error("[voice-clone] Clone API error:", cloneResult.base_resp);
      return new Response(
        JSON.stringify({ error: "Voice clone failed", detail: cloneResult.base_resp.status_msg }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        voice_id: customVoiceId,
        file_id: fileId,
        demo_audio: cloneResult.demo_audio || null,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
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
