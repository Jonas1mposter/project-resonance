/**
 * StepFun TTS Edge Function
 *
 * Generates speech audio using StepFun TTS API (step-tts-mini model).
 *
 * POST /stepfun-tts
 *   Body JSON: { "text": "...", "voice": "voice-id", "speed": 1.0, "volume": 1.0 }
 *   Returns: audio/mpeg binary
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STEPFUN_TTS_URL = "https://api.stepfun.com/v1/audio/speech";

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
    const body = await req.json();
    const { text, voice, speed, volume } = body;

    if (!text) {
      return new Response(JSON.stringify({ error: "Missing 'text' field" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ttsBody: Record<string, unknown> = {
      model: "step-tts-mini",
      input: text,
      voice: voice || "cixingnansheng",
    };

    if (speed) ttsBody.speed = speed;
    if (volume) ttsBody.volume = volume;

    console.log("[stepfun-tts] Generating speech, voice:", ttsBody.voice, "text length:", text.length);

    const response = await fetch(STEPFUN_TTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(ttsBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[stepfun-tts] API error:", response.status, errText);
      return new Response(
        JSON.stringify({ error: "TTS generation failed", detail: errText }),
        {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // StepFun returns audio binary directly
    const audioBytes = new Uint8Array(await response.arrayBuffer());
    console.log("[stepfun-tts] Generated audio, size:", audioBytes.byteLength);

    return new Response(audioBytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audioBytes.byteLength),
      },
    });
  } catch (err) {
    console.error("[stepfun-tts] Error:", err);
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
