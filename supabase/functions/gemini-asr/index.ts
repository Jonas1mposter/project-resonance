/**
 * Gemini ASR Edge Function — Direct Google AI Studio integration.
 *
 * Portability: NO Lovable AI Gateway dependency. Calls Google's official
 * generativelanguage.googleapis.com endpoint directly. Runs unchanged on
 * any Deno-compatible host (Supabase, Deno Deploy, self-hosted).
 *
 * Required env: GEMINI_API_KEY (get from https://aistudio.google.com/apikey)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const PROMPT =
  "请转录以下音频中的语音内容。只输出转录的文字，不要加任何说明、标点符号修正或额外内容。如果听不清或没有语音，输出空字符串。音频可能是中文普通话，说话者可能有构音障碍（dysarthria），请尽力识别。";

function pickMime(raw: string): string {
  const m = (raw || "").toLowerCase();
  if (m.includes("wav")) return "audio/wav";
  if (m.includes("mp3") || m.includes("mpeg")) return "audio/mp3";
  if (m.includes("ogg")) return "audio/ogg";
  if (m.includes("flac")) return "audio/flac";
  if (m.includes("aac")) return "audio/aac";
  if (m.includes("m4a") || m.includes("mp4")) return "audio/mp4";
  // Gemini doesn't accept webm/opus directly; send as ogg which usually works for opus-in-ogg.
  if (m.includes("webm") || m.includes("opus")) return "audio/ogg";
  return "audio/wav";
}

// Chunked base64 encode to avoid stack overflow on large buffers.
function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)),
    );
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 200,
      headers: jsonHeaders,
    });
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        ok: false,
        error:
          "GEMINI_API_KEY 未配置。请在后端密钥管理中添加 GEMINI_API_KEY（从 https://aistudio.google.com/apikey 获取）",
      }),
      { status: 200, headers: jsonHeaders },
    );
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    let audioBytes: ArrayBuffer;
    let rawMime = "audio/webm";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!file || !(file instanceof File)) {
        return new Response(
          JSON.stringify({ ok: false, error: "缺少音频文件" }),
          { status: 200, headers: jsonHeaders },
        );
      }
      audioBytes = await file.arrayBuffer();
      rawMime = file.type || "audio/webm";
    } else {
      audioBytes = await req.arrayBuffer();
    }

    if (audioBytes.byteLength === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "音频为空" }),
        { status: 200, headers: jsonHeaders },
      );
    }

    const mimeType = pickMime(rawMime);
    const base64Audio = toBase64(audioBytes);

    const response = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: PROMPT },
              { inline_data: { mime_type: mimeType, data: base64Audio } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 500,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[gemini-asr] API error:", response.status, errText);
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Gemini ASR 请求失败 (${response.status})`,
          detail: errText.slice(0, 200),
        }),
        { status: 200, headers: jsonHeaders },
      );
    }

    const result = await response.json();
    const text =
      result?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text || "")
        .join("")
        .trim() || "";

    return new Response(
      JSON.stringify({ ok: true, text, source: "gemini" }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (err) {
    console.error("[gemini-asr] Error:", err);
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Gemini ASR 处理失败",
        detail: String(err),
      }),
      { status: 200, headers: jsonHeaders },
    );
  }
});
