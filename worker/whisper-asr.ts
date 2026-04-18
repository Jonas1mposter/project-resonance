/**
 * Whisper ASR handler — forwards audio to private Whisper server via VPC binding.
 * Falls back to Supabase `gemini-asr` edge function when Whisper is unavailable.
 */

import type { Env } from './index';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

// Supabase project for Gemini ASR fallback
const SUPABASE_PROJECT_REF = 'lwusdbovydwbltxmpctr';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3dXNkYm92eWR3Ymx0eG1wY3RyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MzE1MDYsImV4cCI6MjA4NjIwNzUwNn0.0NtvfE3tUFghE6HNDt9MV6r4xaEt_Nga9aQlHFtbokw';
const GEMINI_ASR_URL = `https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/gemini-asr`;

/**
 * Forward an audio FormData payload to the Gemini ASR fallback.
 * Returns a Response shaped the same as the Whisper success/error envelope so
 * the client can stay agnostic of which engine produced the transcript.
 */
async function callGeminiFallback(formData: FormData, reason: string): Promise<Response> {
  console.log('[whisper-asr] Falling back to Gemini ASR. Reason:', reason);
  try {
    const res = await fetch(GEMINI_ASR_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: formData,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      console.error('[whisper-asr] Gemini fallback failed:', res.status, data);
      return new Response(
        JSON.stringify({
          ok: false,
          error: data?.error || '语音识别服务暂时不可用，请稍后重试',
          source: 'gemini',
          fallback: true,
          reason,
        }),
        { status: 200, headers: jsonHeaders },
      );
    }

    // Gemini returns { ok: true, text, source: 'gemini' }.
    // Whisper clients typically read `text`, so this shape is compatible.
    return new Response(
      JSON.stringify({ ...data, source: data.source || 'gemini', fallback: true, reason }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (err) {
    console.error('[whisper-asr] Gemini fallback error:', err);
    return new Response(
      JSON.stringify({
        ok: false,
        error: '语音识别服务连接失败，请检查网络',
        source: 'gemini',
        fallback: true,
        reason,
      }),
      { status: 200, headers: jsonHeaders },
    );
  }
}

export async function handleWhisperASR(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: jsonHeaders });
  }

  try {
    const contentType = request.headers.get('content-type') || '';

    // Health check (JSON ping) — never falls back, only reports Whisper status
    if (contentType.includes('application/json')) {
      try {
        const body = (await request.clone().json()) as any;
        if (body.ping) {
          if (!env.WHISPER_VPC) {
            return new Response(JSON.stringify({ ok: false, status: 'unconfigured' }), { status: 503, headers: jsonHeaders });
          }
          try {
            const healthRes = await env.WHISPER_VPC.fetch('http://127.0.0.1/health');
            if (healthRes.ok) {
              return new Response(JSON.stringify({ ok: true, status: 'connected' }), { status: 200, headers: jsonHeaders });
            }
          } catch {
            /* fall through */
          }
          return new Response(JSON.stringify({ ok: false, status: 'unreachable' }), { status: 503, headers: jsonHeaders });
        }
      } catch {
        /* not a ping, continue */
      }
    }

    // Build a normalized FormData payload (used for both Whisper and the Gemini fallback)
    let formData: FormData;
    if (contentType.includes('multipart/form-data')) {
      const incomingForm = await request.formData();
      const file = incomingForm.get('file');

      formData = new FormData();
      if (file instanceof File) {
        const originalName = file.name || 'recording';
        const validExtensions = ['.flac', '.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.ogg', '.wav', '.webm', '.aac', '.opus'];
        const hasValidExt = validExtensions.some((ext) => originalName.toLowerCase().endsWith(ext));
        const fileName = hasValidExt ? originalName : 'recording.wav';
        const blob = new Blob([await file.arrayBuffer()], { type: file.type || 'audio/wav' });
        formData.append('file', blob, fileName);
      } else if (file) {
        const blob = new Blob([file as string], { type: 'audio/wav' });
        formData.append('file', blob, 'recording.wav');
      }
    } else {
      const audioBytes = await request.arrayBuffer();
      const blob = new Blob([audioBytes], { type: 'audio/webm' });
      formData = new FormData();
      formData.append('file', blob, 'recording.webm');
    }

    // No VPC binding configured → straight to Gemini
    if (!env.WHISPER_VPC) {
      return await callGeminiFallback(formData, 'whisper-vpc-missing');
    }

    // Try self-hosted Whisper first
    let response: Response;
    try {
      response = await env.WHISPER_VPC.fetch('http://127.0.0.1/v1/audio/transcriptions', {
        method: 'POST',
        body: formData,
      });
    } catch (err) {
      console.error('[whisper-asr] VPC fetch threw, falling back:', err);
      return await callGeminiFallback(formData, 'whisper-vpc-error');
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('[whisper-asr] Whisper API error:', response.status, detail);
      // Fall back on any non-2xx (covers GPU OOM, model errors, restarts, etc.)
      return await callGeminiFallback(formData, `whisper-http-${response.status}`);
    }

    const data = await response.json().catch(() => null);
    if (!data || (typeof data === 'object' && (data as any).ok === false)) {
      console.error('[whisper-asr] Whisper returned error envelope, falling back:', data);
      return await callGeminiFallback(formData, 'whisper-error-envelope');
    }

    return new Response(JSON.stringify({ ...data, source: 'whisper' }), { status: 200, headers: jsonHeaders });
  } catch (err) {
    console.error('[whisper-asr] Unhandled error:', err);
    return new Response(
      JSON.stringify({ ok: false, error: '语音识别服务连接失败，请检查网络', fallback: true }),
      { status: 200, headers: jsonHeaders },
    );
  }
}
