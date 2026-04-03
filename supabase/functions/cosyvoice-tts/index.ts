/**
 * CosyVoice TTS Edge Function
 * 
 * Proxies requests to a locally deployed CosyVoice FastAPI server.
 * Supports two modes:
 *   1. Default TTS: uses a preset voice (no prompt audio needed)
 *   2. Zero-shot cloning: sends prompt_wav + prompt_text with each request
 * 
 * CosyVoice returns raw 22050Hz int16 PCM. This function injects a WAV
 * header so browsers can play the audio directly.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Build a WAV header for 22050 Hz, mono, 16-bit PCM */
function makeWavHeader(dataSize: number): Uint8Array {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  const sampleRate = 22050;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true); // file size - 8
  writeString(view, 8, "WAVE");

  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  return new Uint8Array(header);
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
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

  const baseUrl = Deno.env.get("COSYVOICE_API_URL");
  if (!baseUrl) {
    return new Response(
      JSON.stringify({ error: "COSYVOICE_API_URL not configured" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    const contentType = req.headers.get("content-type") || "";

    let apiUrl: string;
    let fetchOptions: RequestInit;

    if (contentType.includes("multipart/form-data")) {
      // Zero-shot mode: forward the multipart form as-is
      // Expected fields: tts_text, prompt_text, prompt_wav (file)
      const formData = await req.formData();
      const ttsText = formData.get("tts_text");
      if (!ttsText) {
        return new Response(JSON.stringify({ error: "Missing 'tts_text'" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      apiUrl = `${baseUrl.replace(/\/$/, "")}/inference_zero_shot`;
      fetchOptions = {
        method: "POST",
        body: formData,
      };

      console.log("[cosyvoice-tts] Zero-shot mode, text length:", String(ttsText).length);
    } else {
      // Default mode: JSON body with just text
      const body = await req.json();
      const { text, speaker } = body;

      if (!text) {
        return new Response(JSON.stringify({ error: "Missing 'text'" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Use cosyvoice default speaker endpoint
      apiUrl = `${baseUrl.replace(/\/$/, "")}/inference_sft`;
      const params = new URLSearchParams({
        tts_text: text,
        spk_id: speaker || "中文女",
      });
      apiUrl = `${apiUrl}?${params.toString()}`;
      fetchOptions = { method: "GET" };

      console.log("[cosyvoice-tts] SFT mode, speaker:", speaker || "中文女", "text length:", text.length);
    }

    const response = await fetch(apiUrl, fetchOptions);

    if (!response.ok) {
      const errText = await response.text();
      console.error("[cosyvoice-tts] Upstream error:", response.status, errText);
      return new Response(
        JSON.stringify({ error: "TTS generation failed", detail: errText }),
        {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // CosyVoice returns raw PCM — collect it and prepend WAV header
    // We buffer because we need to know the data size for the WAV header
    const pcmData = new Uint8Array(await response.arrayBuffer());
    const wavHeader = makeWavHeader(pcmData.length);

    const wavBuffer = new Uint8Array(wavHeader.length + pcmData.length);
    wavBuffer.set(wavHeader, 0);
    wavBuffer.set(pcmData, wavHeader.length);

    console.log("[cosyvoice-tts] Success, PCM bytes:", pcmData.length, "WAV bytes:", wavBuffer.length);

    return new Response(wavBuffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/wav",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    console.error("[cosyvoice-tts] Error:", err);
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
