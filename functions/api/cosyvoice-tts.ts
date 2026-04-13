/**
 * Cloudflare Pages Function: CosyVoice TTS Proxy (Gradio API adapter)
 * Uses VPC Service binding to reach private CosyVoice server via Cloudflare Tunnel.
 */

interface Env {
  COSYVOICE_VPC: Fetcher;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function errorResponse(error: string, fallback = false) {
  return new Response(
    JSON.stringify({ ok: false, error, fallback }),
    { status: 200, headers: jsonHeaders }
  );
}

const INTERNAL_HOST = "http://cosyvoice-service";

/** Upload a file to Gradio via VPC and return the file reference object */
async function uploadToGradio(vpc: Fetcher, file: File): Promise<Record<string, unknown>> {
  const uploadForm = new FormData();
  uploadForm.append("files", file, file.name || "prompt.wav");

  const res = await vpc.fetch(`${INTERNAL_HOST}/gradio_api/upload`, {
    method: "POST",
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

/** Poll Gradio SSE endpoint for the audio URL */
async function pollGradioResult(vpc: Fetcher, eventId: string): Promise<string | null> {
  const sseUrl = `${INTERNAL_HOST}/gradio_api/call/generate_audio/${eventId}`;
  const res = await vpc.fetch(sseUrl);

  if (!res.ok) {
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

  return completeUrl || generatingUrl || null;
}

/** Fetch audio - handles both direct files and HLS playlists */
async function fetchAudio(vpc: Fetcher, audioUrl: string): Promise<Uint8Array | null> {
  // Audio URLs from Gradio are absolute public URLs, fetch directly
  if (audioUrl.includes("playlist.m3u8")) {
    return await fetchHLSAudio(audioUrl);
  }
  const res = await fetch(audioUrl);
  if (!res.ok) return null;
  return new Uint8Array(await res.arrayBuffer());
}

/** Download HLS playlist and concatenate all audio segments */
async function fetchHLSAudio(playlistUrl: string): Promise<Uint8Array | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(playlistUrl);
    if (!res.ok) return null;

    const m3u8 = await res.text();
    const baseUrl = playlistUrl.substring(0, playlistUrl.lastIndexOf("/") + 1);

    const segments: string[] = [];
    for (const line of m3u8.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        segments.push(trimmed);
      }
    }

    if (segments.length === 0) {
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }

    const chunks: Uint8Array[] = [];
    for (const seg of segments) {
      const segUrl = seg.startsWith("http") ? seg : `${baseUrl}${seg}`;
      const segRes = await fetch(segUrl);
      if (segRes.ok) {
        chunks.push(new Uint8Array(await segRes.arrayBuffer()));
      }
    }

    const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
    if (totalLen < 500) {
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
  return null;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: jsonHeaders,
    });
  }

  if (!env.COSYVOICE_VPC) {
    return errorResponse("语音合成服务未配置 VPC 绑定", true);
  }

  const vpc = env.COSYVOICE_VPC;

  try {
    const contentType = request.headers.get("content-type") || "";
    let ttsText: string;
    let promptText = "";
    let promptFileRef: Record<string, unknown> | null = null;
    const mode = "3s极速复刻";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      ttsText = formData.get("tts_text") as string;
      promptText = (formData.get("prompt_text") as string) || "";
      const promptWav = formData.get("prompt_wav") as File | null;

      if (!ttsText) {
        return errorResponse("Missing 'tts_text'");
      }

      if (promptWav) {
        promptFileRef = await uploadToGradio(vpc, promptWav);
      }
    } else {
      const body = await request.json() as any;
      ttsText = body.text;
      if (!ttsText) {
        return errorResponse("Missing 'text'");
      }
      return errorResponse("请先「存为音色」后再朗读，当前服务需要参考音频", true);
    }

    // Step 1: Submit job to Gradio via VPC
    const gradioData = [
      ttsText, mode, "", promptText, promptFileRef, null, "", 0, false, 1.0,
    ];

    const submitRes = await vpc.fetch(`${INTERNAL_HOST}/gradio_api/call/generate_audio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: gradioData }),
    });

    if (!submitRes.ok) {
      return errorResponse("语音合成任务提交失败", true);
    }

    const { event_id } = await submitRes.json() as any;

    // Step 2: Poll SSE for result via VPC
    const audioUrl = await pollGradioResult(vpc, event_id);
    if (!audioUrl) {
      return errorResponse("语音合成失败，模型未返回音频", true);
    }

    // Step 3: Fetch audio (Gradio returns public URLs, use direct fetch)
    const audioData = await fetchAudio(vpc, audioUrl);
    if (!audioData || audioData.length === 0) {
      return errorResponse("语音合成完成但音频下载失败，请重试", true);
    }

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
    return errorResponse(`语音合成出错: ${msg}`, true);
  }
};
