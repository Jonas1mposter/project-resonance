/**
 * StepFun ASR Edge Function
 *
 * Receives audio (as multipart form data or raw binary) from the client,
 * forwards it to the StepFun transcription API, and returns the result.
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
      // Client sent multipart — forward as-is
      formData = await req.formData();
    } else {
      // Client sent raw audio binary — wrap in FormData
      const audioBytes = await req.arrayBuffer();
      const blob = new Blob([audioBytes], { type: "audio/webm" });
      formData = new FormData();
      formData.append("file", blob, "recording.webm");
    }

    // Ensure model is set
    if (!formData.has("model")) {
      formData.append("model", "step-asr");
    }

    // Forward to StepFun API
    const response = await fetch(STEPFUN_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    const result = await response.text();

    if (!response.ok) {
      console.error(
        "[stepfun-asr] API error:",
        response.status,
        result
      );
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

    return new Response(result, {
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
