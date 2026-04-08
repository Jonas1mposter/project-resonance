/**
 * CosyVoice TTS Edge Function (Gradio API adapter)
 *
 * Proxies requests to a CosyVoice Gradio web UI.
 * Gradio protocol:
 *   1. POST /gradio_api/call/generate_audio  →  { event_id }
 *   2. GET  /gradio_api/call/generate_audio/{event_id}  →  SSE with audio URL
 *   3. Fetch HLS playlist → download audio segments → return concatenated audio
 *
 * Supports:
 *   - Zero-shot cloning: uploads prompt_wav first, then references it
 *   - Returns structured JSON errors (never raw 500) so frontend can handle gracefully
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Headers to bypass ngrok's browser interception page */
const ngrokHeaders = { "ngrok-skip-browser-warning": "true" };

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

/** Return a structured error as HTTP 200 so the client can read it */
function errorResponse(error: string, fallback = false) {
  return new Response(
    JSON.stringify({ ok: false, error, fallback }),
    { status: 200, headers: jsonHeaders }
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: jsonHeaders,
    });
  }

  const baseUrl = Deno.env.get("COSYVOICE_API_URL");
  if (!baseUrl) {
    return errorResponse("语音合成服务未配置，请联系管理员", true);
  }

  const api = baseUrl.replace(/\/$/, "");

  try {
    const contentType = req.headers.get("content-type") || "";
    let ttsText: string;
    let promptText = "";
    let promptFileRef: Record<string, unknown> | null = null;
    const mode = "3s极速复刻";

    if (contentType.includes("multipart/form-data")) {
      // Zero-shot with prompt audio
      const formData = await req.formData();
      ttsText = formData.get("tts_text") as string;
      promptText = (formData.get("prompt_text") as string) || "";
      const promptWav = formData.get("prompt_wav") as File | null;

      if (!ttsText) {
        return errorResponse("Missing 'tts_text'");
      }

      if (promptWav) {
        promptFileRef = await uploadToGradio(api, promptWav);
        console.log("[cosyvoice-tts] Uploaded prompt audio, ref:", JSON.stringify(promptFileRef));
      }
    } else {
      // JSON body — no prompt audio
      const body = await req.json();
      ttsText = body.text;
      if (!ttsText) {
        return errorResponse("Missing 'text'");
      }
      // No SFT speakers available, prompt audio is required
      return errorResponse("请先「存为音色」后再朗读，当前服务需要参考音频", true);
    }

    console.log("[cosyvoice-tts] Mode:", mode, "text length:", ttsText.length);

    // Step 1: Submit job to Gradio
    const gradioData = [
      ttsText,          // tts_text
      mode,             // mode_checkbox_group
      "",               // sft_dropdown
      promptText,       // prompt_text
      promptFileRef,    // prompt_wav_upload
      null,             // prompt_wav_record
      "",               // instruct_text
      0,                // seed
      false,            // stream
      1.0,              // speed
    ];

    const submitRes = await fetch(`${api}/gradio_api/call/generate_audio`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ngrokHeaders },
      body: JSON.stringify({ data: gradioData }),
    });

    if (!submitRes.ok) {
      const errText = await submitRes.text();
      console.error("[cosyvoice-tts] Submit error:", submitRes.status, errText);
      const isOffline = errText.includes("ngrok") || errText.includes("ERR_NGROK");
      return errorResponse(
        isOffline ? "语音合成服务离线，请稍后重试" : "语音合成任务提交失败",
        true
      );
    }

    const { event_id } = await submitRes.json();
    console.log("[cosyvoice-tts] Job submitted, event_id:", event_id);

    // Step 2: Poll SSE for result
    const audioUrl = await pollGradioResult(api, event_id);
    if (!audioUrl) {
      return errorResponse("语音合成失败，模型未返回音频", true);
    }

    console.log("[cosyvoice-tts] Audio URL:", audioUrl);

    // Step 3: Fetch audio
    const audioData = await fetchAudio(api, audioUrl);
    if (!audioData || audioData.length === 0) {
      return errorResponse("语音合成完成但音频下载失败，请重试", true);
    }

    console.log("[cosyvoice-tts] Success, audio bytes:", audioData.length);

    const isHLS = audioUrl.includes("playlist.m3u8");
    const contentTypeOut = isHLS ? "audio/aac" : "audio/wav";

    return new Response(audioData, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": contentTypeOut,
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    console.error("[cosyvoice-tts] Error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    const isOffline = msg.includes("ngrok") || msg.includes("ERR_NGROK");
    return errorResponse(
      isOffline ? "语音合成服务离线，请稍后重试" : `语音合成出错: ${msg}`,
      true
    );
  }
});

/** Upload a file to Gradio and return the file reference object */
async function uploadToGradio(api: string, file: File): Promise<Record<string, unknown>> {
  const uploadForm = new FormData();
  uploadForm.append("files", file, file.name || "prompt.wav");

  const res = await fetch(`${api}/gradio_api/upload`, {
    method: "POST",
    headers: { ...ngrokHeaders },
    body: uploadForm,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gradio upload failed: ${res.status} ${errText}`);
  }

  const paths: string[] = await res.json();
  return {
    path: paths[0],
    meta: { _type: "gradio.FileData" },
  };
}

/** Poll Gradio SSE endpoint for the audio URL - prefers "complete" over "generating" */
async function pollGradioResult(api: string, eventId: string): Promise<string | null> {
  const sseUrl = `${api}/gradio_api/call/generate_audio/${eventId}`;
  const res = await fetch(sseUrl, { headers: ngrokHeaders });

  if (!res.ok || !res.body) {
    console.error("[cosyvoice-tts] SSE fetch failed:", res.status);
    return null;
  }

  const text = await res.text();
  console.log("[cosyvoice-tts] SSE response:", text.substring(0, 1000));

  const lines = text.split("\n");
  let generatingUrl: string | null = null;
  let completeUrl: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("data: ") && i > 0) {
      const eventLine = lines[i - 1];
      try {
        const data = JSON.parse(line.substring(6));
        if (Array.isArray(data) && data[0]?.url) {
          if (eventLine.includes("complete")) {
            completeUrl = data[0].url;
          } else if (eventLine.includes("generating")) {
            generatingUrl = data[0].url;
          }
        }
      } catch { /* continue */ }
    }
  }

  const audioUrl = completeUrl || generatingUrl;
  if (!audioUrl) {
    console.error("[cosyvoice-tts] No audio URL found in SSE response:", text.substring(0, 500));
  }
  return audioUrl;
}

/** Fetch audio from URL - handles both direct files and HLS playlists */
async function fetchAudio(_api: string, audioUrl: string): Promise<Uint8Array | null> {
  if (audioUrl.includes("playlist.m3u8")) {
    return await fetchHLSAudio(audioUrl);
  }

  const res = await fetch(audioUrl, { headers: ngrokHeaders });
  if (!res.ok) return null;
  return new Uint8Array(await res.arrayBuffer());
}

/** Download HLS playlist and concatenate all audio segments, with retry */
async function fetchHLSAudio(playlistUrl: string): Promise<Uint8Array | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(playlistUrl, { headers: ngrokHeaders });
    if (!res.ok) return null;

    const m3u8 = await res.text();
    console.log("[cosyvoice-tts] HLS playlist (attempt", attempt + 1, "):", m3u8.substring(0, 300));
    const baseUrl = playlistUrl.substring(0, playlistUrl.lastIndexOf("/") + 1);

    const segments: string[] = [];
    for (const line of m3u8.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        segments.push(trimmed);
      }
    }

    if (segments.length === 0) {
      console.log("[cosyvoice-tts] No segments yet, retrying in 2s...");
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }

    const chunks: Uint8Array[] = [];
    for (const seg of segments) {
      const segUrl = seg.startsWith("http") ? seg : `${baseUrl}${seg}`;
      const segRes = await fetch(segUrl, { headers: ngrokHeaders });
      if (segRes.ok) {
        chunks.push(new Uint8Array(await segRes.arrayBuffer()));
      }
    }

    const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
    if (totalLen < 500) {
      console.log("[cosyvoice-tts] Audio too small (", totalLen, "bytes), retrying...");
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }

    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  console.error("[cosyvoice-tts] HLS fetch exhausted retries");
  return null;
}
