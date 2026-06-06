/**
 * Stepfun TTS handler.
 *
 * Two actions over a single POST endpoint, switched by Content-Type:
 *   1) multipart/form-data with prompt_wav  → voice clone
 *        forwards file + sample_text to POST https://api.stepfun.com/v1/audio/voices
 *        returns JSON { ok: true, voice_id }
 *   2) application/json with { text, voice_id }  → synth
 *        calls POST https://api.stepfun.com/v1/audio/speech with step-tts-mini
 *        returns audio/mpeg (mp3) bytes
 *
 * Always returns HTTP 200 with structured JSON on error (per resilience rule).
 */

import type { Env } from './index';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

const STEPFUN_BASE = 'https://api.stepfun.com/v1';
const TTS_MODEL = 'step-tts-mini';

function errorResponse(error: string, fallback = false) {
  return new Response(JSON.stringify({ ok: false, error, fallback }), { status: 200, headers: jsonHeaders });
}

export async function handleStepfunTTS(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: jsonHeaders });
  }

  const apiKey = env.STEPFUN_API_KEY;
  if (!apiKey) {
    return errorResponse('Stepfun TTS 未配置 STEPFUN_API_KEY', true);
  }

  const contentType = request.headers.get('content-type') || '';

  try {
    // --- Clone branch ---
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const promptWav = formData.get('prompt_wav') as File | null;
      const sampleText = (formData.get('prompt_text') as string) || '你好，这是我的声音。';
      if (!promptWav) return errorResponse('缺少参考音频 prompt_wav');

      const upstreamForm = new FormData();
      upstreamForm.append('file', promptWav, promptWav.name || 'prompt.wav');
      upstreamForm.append('model', TTS_MODEL);
      upstreamForm.append('text', sampleText);

      const res = await fetch(`${STEPFUN_BASE}/audio/voices`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: upstreamForm,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error('[stepfun-tts] clone failed:', res.status, errText.slice(0, 500));
        let detail = errText.slice(0, 300);
        try {
          const j = JSON.parse(errText);
          if (j?.error?.message) detail = j.error.message;
          else if (j?.message) detail = j.message;
        } catch { /* ignore */ }
        return errorResponse(`音色克隆失败 (${res.status}): ${detail}`, true);
      }

      const data = await res.json() as { id?: string; duplicated?: boolean };
      if (!data.id) return errorResponse('Stepfun 未返回 voice_id', true);
      return new Response(JSON.stringify({ ok: true, voice_id: data.id, duplicated: !!data.duplicated }), {
        status: 200,
        headers: jsonHeaders,
      });
    }

    // --- Synth branch ---
    const body = await request.json().catch(() => ({})) as { text?: string; voice_id?: string; speed?: number; volume?: number };
    const text = body.text?.trim();
    const voiceId = body.voice_id?.trim();
    if (!text) return errorResponse('Missing text');
    if (!voiceId) return errorResponse('请先「存为音色」克隆后再朗读', true);

    const res = await fetch(`${STEPFUN_BASE}/audio/speech`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: TTS_MODEL,
        input: text,
        voice: voiceId,
        response_format: 'mp3',
        speed: body.speed ?? 1.0,
        volume: body.volume ?? 1.0,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[stepfun-tts] synth failed:', res.status, errText.slice(0, 500));
      let detail = errText.slice(0, 300);
      try {
        const j = JSON.parse(errText);
        if (j?.error?.message) detail = j.error.message;
        else if (j?.message) detail = j.message;
      } catch { /* ignore */ }
      return errorResponse(`语音合成失败 (${res.status}): ${detail}`, true);
    }

    const audio = new Uint8Array(await res.arrayBuffer());
    if (audio.length === 0) return errorResponse('Stepfun 返回空音频', true);

    return new Response(audio, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    console.error('[stepfun-tts] Error:', err);
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(`Stepfun TTS 出错: ${msg}`, true);
  }
}