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
 *   - Default mode (no prompt audio): uses "3s极速复刻" with empty prompt
 *   - Zero-shot cloning: uploads prompt_wav first, then references it
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Headers to bypass ngrok's browser interception page */
const ngrokHeaders = { "ngrok-skip-browser-warning": "true" };

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
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const api = baseUrl.replace(/\/$/, "");

  try {
    const contentType = req.headers.get("content-type") || "";
    let ttsText: string;
    let promptText = "";
    let promptFileRef: Record<string, unknown> | null = null;
    let mode = "3s极速复刻";

    if (contentType.includes("multipart/form-data")) {
      // Zero-shot with prompt audio
      const formData = await req.formData();
      ttsText = formData.get("tts_text") as string;
      promptText = (formData.get("prompt_text") as string) || "";
      const promptWav = formData.get("prompt_wav") as File | null;

      if (!ttsText) {
        return new Response(JSON.stringify({ error: "Missing 'tts_text'" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (promptWav) {
        // Upload the prompt audio to Gradio
        promptFileRef = await uploadToGradio(api, promptWav);
        mode = "3s极速复刻"; // switch to zero-shot mode when prompt audio is provided
        console.log("[cosyvoice-tts] Uploaded prompt audio, ref:", JSON.stringify(promptFileRef));
      }
    } else {
      // JSON body — no prompt audio
      const body = await req.json();
      ttsText = body.text;
      if (!ttsText) {
        return new Response(JSON.stringify({ error: "Missing 'text'" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // No SFT speakers available, prompt audio is required
      return new Response(
        JSON.stringify({ error: "请先「存为音色」后再朗读，当前服务需要参考音频" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[cosyvoice-tts] Mode:", mode, "text length:", ttsText.length);

    // Step 1: Submit job to Gradio
    // Parameters: tts_text, mode_checkbox_group, sft_dropdown, prompt_text,
    //             prompt_wav_upload, prompt_wav_record, instruct_text, seed, stream, speed
    const sftSpeaker = mode === "预训练音色" ? "中文女" : "";
    const gradioData = [
      ttsText,          // tts_text
      mode,             // mode_checkbox_group
      sftSpeaker,       // sft_dropdown
      promptText,       // prompt_text
      promptFileRef,    // prompt_wav_upload (null or file ref)
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
      return new Response(
        JSON.stringify({ error: "Failed to submit TTS job", detail: errText }),
        { status: submitRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { event_id } = await submitRes.json();
    console.log("[cosyvoice-tts] Job submitted, event_id:", event_id);

    // Step 2: Poll SSE for result
    const audioUrl = await pollGradioResult(api, event_id);
    if (!audioUrl) {
      return new Response(
        JSON.stringify({ error: "TTS generation failed - no audio URL returned" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[cosyvoice-tts] Audio URL:", audioUrl);

    // Step 3: Fetch audio - could be HLS playlist or direct file
    const audioData = await fetchAudio(api, audioUrl);
    if (!audioData || audioData.length === 0) {
      return new Response(
        JSON.stringify({ error: "Failed to download audio" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[cosyvoice-tts] Success, audio bytes:", audioData.length);

    // HLS streams from Gradio are AAC; direct files could be WAV
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
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
  // Return Gradio FileData format
  return {
    path: paths[0],
    meta: { _type: "gradio.FileData" },
  };
}

/** Poll Gradio SSE endpoint for the audio URL */
async function pollGradioResult(api: string, eventId: string): Promise<string | null> {
  const sseUrl = `${api}/gradio_api/call/generate_audio/${eventId}`;
  const res = await fetch(sseUrl, { headers: ngrokHeaders });

  if (!res.ok || !res.body) {
    console.error("[cosyvoice-tts] SSE fetch failed:", res.status);
    return null;
  }

  const text = await res.text();
  // Parse SSE events
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("data: ") && i > 0) {
      const eventLine = lines[i - 1];
      if (eventLine.includes("generating") || eventLine.includes("complete")) {
        try {
          const data = JSON.parse(line.substring(6));
          if (Array.isArray(data) && data[0]?.url) {
            return data[0].url;
          }
        } catch { /* continue */ }
      }
    }
  }

  console.error("[cosyvoice-tts] No audio URL found in SSE response:", text.substring(0, 500));
  return null;
}

/** Fetch audio from URL - handles both direct files and HLS playlists */
async function fetchAudio(api: string, audioUrl: string): Promise<Uint8Array | null> {
  // If it's an HLS playlist, download segments
  if (audioUrl.includes("playlist.m3u8")) {
    return await fetchHLSAudio(audioUrl);
  }

  // Direct file download
  const res = await fetch(audioUrl, { headers: ngrokHeaders });
  if (!res.ok) return null;
  return new Uint8Array(await res.arrayBuffer());
}

/** Download HLS playlist and concatenate all audio segments */
async function fetchHLSAudio(playlistUrl: string): Promise<Uint8Array | null> {
  const res = await fetch(playlistUrl, { headers: ngrokHeaders });
  if (!res.ok) return null;

  const m3u8 = await res.text();
  const baseUrl = playlistUrl.substring(0, playlistUrl.lastIndexOf("/") + 1);

  // Extract segment filenames
  const segments: string[] = [];
  for (const line of m3u8.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      segments.push(trimmed);
    }
  }

  if (segments.length === 0) return null;

  // Download all segments
  const chunks: Uint8Array[] = [];
  for (const seg of segments) {
    const segUrl = seg.startsWith("http") ? seg : `${baseUrl}${seg}`;
    const segRes = await fetch(segUrl, { headers: ngrokHeaders });
    if (segRes.ok) {
      chunks.push(new Uint8Array(await segRes.arrayBuffer()));
    }
  }

  // Concatenate
  const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}
