/**
 * Minimax TTS Edge Function
 *
 * Generates speech audio using Minimax T2A v2 API (speech-2.8-hd model).
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

const MINIMAX_TTS_URL = "https://api.minimax.chat/v1/t2a_v2";

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
    console.log(`[minimax-tts] 503 received, retry ${attempt}/${retries} in ${RETRY_DELAY_MS}ms...`);
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  }
  return fetch(url, options);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
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
    const body = await req.json();
    const { text, voice, speed, volume } = body;

    if (!text) {
      return new Response(JSON.stringify({ error: "Missing 'text' field" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ttsBody = {
      model: "speech-2.8-hd",
      text: text,
      stream: false,
      voice_setting: {
        voice_id: voice || "male-qn-qingse",
        speed: speed || 1.0,
        vol: volume || 1.0,
        pitch: 0,
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: "mp3",
      },
    };

    console.log("[minimax-tts] Generating speech, voice:", ttsBody.voice_setting.voice_id, "text length:", text.length);

    const response = await fetchWithRetry(MINIMAX_TTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(ttsBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[minimax-tts] API error:", response.status, errText);
      return new Response(
        JSON.stringify({ error: "TTS generation failed", detail: errText }),
        {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const result = await response.json();

    if (result.base_resp && result.base_resp.status_code !== 0) {
      console.error("[minimax-tts] API logic error:", result.base_resp);
      return new Response(
        JSON.stringify({ error: "TTS failed", detail: result.base_resp.status_msg }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const audioHex = result.data?.audio;
    if (!audioHex) {
      console.error("[minimax-tts] No audio in response");
      return new Response(
        JSON.stringify({ error: "No audio data in response" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const audioBytes = hexToBytes(audioHex);
    console.log("[minimax-tts] Generated audio, size:", audioBytes.byteLength);

    return new Response(audioBytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audioBytes.byteLength),
      },
    });
  } catch (err) {
    console.error("[minimax-tts] Error:", err);
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
