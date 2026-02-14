/**
 * StepFun Voice Clone Edge Function
 *
 * Two-step process:
 * 1. Upload reference audio → get file_id via StepFun Files API
 * 2. Clone voice from file_id → get voice_id via StepFun Voice Clone API
 *
 * POST /stepfun-voice-clone
 *   Body: multipart/form-data with "audio" field (5-10s reference audio)
 *   Optional: "text" field for reference text
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STEPFUN_UPLOAD_URL = "https://api.stepfun.com/v1/files";
const STEPFUN_VOICE_CLONE_URL = "https://api.stepfun.com/v1/audio/voices";

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
    const referenceText = formData.get("text") as string | null;

    if (!audioFile) {
      return new Response(
        JSON.stringify({ error: "Missing 'audio' field" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Step 1: Upload audio file to StepFun (purpose=storage for voice clone)
    const uploadForm = new FormData();
    uploadForm.append("file", audioFile, audioFile.name || "reference.wav");
    uploadForm.append("purpose", "storage");

    console.log("[voice-clone] Uploading reference audio to StepFun...");
    const uploadResp = await fetch(STEPFUN_UPLOAD_URL, {
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
    if (!fileId) {
      console.error("[voice-clone] No file id in upload response:", JSON.stringify(uploadResult));
      return new Response(
        JSON.stringify({ error: "No file_id in upload response", detail: JSON.stringify(uploadResult) }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    console.log("[voice-clone] File uploaded, id:", fileId);

    // Step 2: Clone voice using StepFun API
    const cloneBody: Record<string, unknown> = {
      file_id: fileId,
      model: "step-tts-mini",
    };
    if (referenceText) {
      cloneBody.text = referenceText;
    }

    console.log("[voice-clone] Creating voice clone...");
    const cloneResp = await fetch(STEPFUN_VOICE_CLONE_URL, {
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

    const voiceId = cloneResult.id;
    if (!voiceId) {
      console.error("[voice-clone] No voice id in clone response");
      return new Response(
        JSON.stringify({ error: "No voice_id in clone response", detail: JSON.stringify(cloneResult) }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        voice_id: voiceId,
        file_id: fileId,
        demo_audio: cloneResult.sample_audio || null,
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
