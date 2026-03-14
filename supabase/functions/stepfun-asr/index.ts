/**
 * StepFun ASR Edge Function
 *
 * Receives audio (as multipart form data or raw binary) from the client,
 * forwards it to the StepFun transcription API, and streams the result back.
 *
 * POST /stepfun-asr
 *   Body: multipart/form-data with "file" field (audio blob)
 *   Optional query param: model (default: step-asr)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STEPFUN_API_URL = "https://api.stepfun.com/v1/audio/transcriptions";

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

    let formData: FormData;

    if (contentType.includes("multipart/form-data")) {
      const incomingForm = await req.formData();
      const file = incomingForm.get("file");
      
      // Ensure the file has a valid extension that StepFun accepts
      // WeChat uploads may lack proper filename/extension
      formData = new FormData();
      if (file instanceof File) {
        const originalName = file.name || "recording";
        // If no valid audio extension, default to .mp3 (WeChat records in mp3)
        const validExtensions = [".flac", ".mp3", ".mp4", ".mpeg", ".mpga", ".m4a", ".ogg", ".wav", ".webm", ".aac", ".opus"];
        const hasValidExt = validExtensions.some(ext => originalName.toLowerCase().endsWith(ext));
        const fileName = hasValidExt ? originalName : "recording.mp3";
        const blob = new Blob([await file.arrayBuffer()], { type: file.type || "audio/mpeg" });
        formData.append("file", blob, fileName);
      } else {
        // Fallback: treat as raw bytes
        const bytes = file ? new Blob([file as string], { type: "audio/mpeg" }) : null;
        if (bytes) formData.append("file", bytes, "recording.mp3");
      }
      
      // Copy other form fields
      const incomingModel = incomingForm.get("model");
      if (incomingModel) formData.append("model", incomingModel as string);
    } else {
      const audioBytes = await req.arrayBuffer();
      const blob = new Blob([audioBytes], { type: "audio/webm" });
      formData = new FormData();
      formData.append("file", blob, "recording.webm");
    }

    if (!formData.has("model")) {
      formData.append("model", "step-asr");
    }

    // Forward to StepFun API and stream response directly
    const response = await fetch(STEPFUN_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const result = await response.text();
      console.error("[stepfun-asr] API error:", response.status, result);
      return new Response(
        JSON.stringify({
          error: "StepFun API error",
          status: response.status,
          detail: result,
        }),
        {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Stream JSON response directly without buffering
    return new Response(response.body, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[stepfun-asr] Error:", err);
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
