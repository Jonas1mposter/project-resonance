/**
 * Gemini ASR Edge Function
 *
 * Uses Lovable AI Gateway (Gemini) for speech-to-text as a fallback
 * when self-hosted Whisper is unavailable.
 * Accepts audio via multipart/form-data, sends to Gemini with audio understanding.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ ok: false, error: "LOVABLE_API_KEY 未配置" }),
      { status: 200, headers: jsonHeaders }
    );
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    let audioBytes: ArrayBuffer;
    let mimeType = "audio/webm";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!file || !(file instanceof File)) {
        return new Response(
          JSON.stringify({ ok: false, error: "缺少音频文件" }),
          { status: 200, headers: jsonHeaders }
        );
      }
      audioBytes = await file.arrayBuffer();
      mimeType = file.type || "audio/webm";
    } else {
      audioBytes = await req.arrayBuffer();
    }

    if (audioBytes.byteLength === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "音频为空" }),
        { status: 200, headers: jsonHeaders }
      );
    }

    // Convert to base64 for Gemini multimodal input
    const base64Audio = btoa(
      String.fromCharCode(...new Uint8Array(audioBytes))
    );

    // Call Gemini via Lovable AI Gateway with audio input
    const response = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "请转录以下音频中的语音内容。只输出转录的文字，不要加任何说明、标点符号修正或额外内容。如果听不清或没有语音，输出空字符串。音频可能是中文普通话，说话者可能有构音障碍（dysarthria），请尽力识别。",
              },
              {
                type: "input_audio",
                input_audio: {
                  data: base64Audio,
                  format: mimeType.includes("wav") ? "wav" : mimeType.includes("mp3") ? "mp3" : "webm",
                },
              },
            ],
          },
        ],
        max_tokens: 500,
        temperature: 0,
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
        { status: 200, headers: jsonHeaders }
      );
    }

    const result = await response.json();
    const text = result.choices?.[0]?.message?.content?.trim() || "";

    return new Response(
      JSON.stringify({ ok: true, text, source: "gemini" }),
      { status: 200, headers: jsonHeaders }
    );
  } catch (err) {
    console.error("[gemini-asr] Error:", err);
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Gemini ASR 处理失败",
        detail: String(err),
      }),
      { status: 200, headers: jsonHeaders }
    );
  }
});
