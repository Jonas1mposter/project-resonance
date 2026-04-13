/**
 * Cloudflare Pages Function: Whisper ASR Proxy
 *
 * Forwards audio to a self-hosted Whisper-compatible API.
 * Set WHISPER_API_URL in Cloudflare Pages environment variables.
 */

interface Env {
  WHISPER_API_URL?: string;
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

  const whisperUrl = env.WHISPER_API_URL;
  if (!whisperUrl) {
    return new Response(
      JSON.stringify({ ok: false, error: "ASR 服务尚未部署（WHISPER_API_URL 未配置）", fallback: true }),
      { status: 200, headers: jsonHeaders }
    );
  }

  try {
    const contentType = request.headers.get("content-type") || "";

    // Handle ping/health checks
    if (contentType.includes("application/json")) {
      try {
        const body = await request.json() as any;
        if (body.ping) {
          try {
            const healthRes = await fetch(whisperUrl.replace(/\/+$/, "") + "/health");
            if (healthRes.ok) {
              return new Response(JSON.stringify({ ok: true, status: "connected" }), {
                status: 200, headers: jsonHeaders,
              });
            }
          } catch { /* fall through */ }
          return new Response(JSON.stringify({ ok: false, status: "unreachable" }), {
            status: 503, headers: jsonHeaders,
          });
        }
      } catch { /* not JSON, continue */ }
    }

    let formData: FormData;

    if (contentType.includes("multipart/form-data")) {
      const incomingForm = await request.formData();
      const file = incomingForm.get("file");

      formData = new FormData();
      if (file instanceof File) {
        const originalName = file.name || "recording";
        const validExtensions = [".flac", ".mp3", ".mp4", ".mpeg", ".mpga", ".m4a", ".ogg", ".wav", ".webm", ".aac", ".opus"];
        const hasValidExt = validExtensions.some(ext => originalName.toLowerCase().endsWith(ext));
        const fileName = hasValidExt ? originalName : "recording.wav";
        const blob = new Blob([await file.arrayBuffer()], { type: file.type || "audio/wav" });
        formData.append("file", blob, fileName);
      } else {
        const bytes = file ? new Blob([file as string], { type: "audio/wav" }) : null;
        if (bytes) formData.append("file", bytes, "recording.wav");
      }
    } else {
      const audioBytes = await request.arrayBuffer();
      const blob = new Blob([audioBytes], { type: "audio/webm" });
      formData = new FormData();
      formData.append("file", blob, "recording.webm");
    }

    // Forward to Whisper API (OpenAI-compatible endpoint)
    const endpoint = whisperUrl.replace(/\/+$/, "") + "/v1/audio/transcriptions";

    const response = await fetch(endpoint, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const result = await response.text();
      console.error("[whisper-asr] API error:", response.status, result);
      return new Response(
        JSON.stringify({
          ok: false,
          error: "语音识别服务暂时不可用，请稍后重试",
          detail: result,
          fallback: response.status >= 500,
        }),
        { status: 200, headers: jsonHeaders }
      );
    }

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (err) {
    console.error("[whisper-asr] Error:", err);
    return new Response(
      JSON.stringify({
        ok: false,
        error: "语音识别服务连接失败，请检查网络",
        fallback: true,
      }),
      { status: 200, headers: jsonHeaders }
    );
  }
};
