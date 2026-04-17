/**
 * CosyVoice TTS handler — Gradio API adapter via VPC binding.
 */

import type { Env } from './index';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

function errorResponse(error: string, fallback = false) {
  return new Response(JSON.stringify({ ok: false, error, fallback }), { status: 200, headers: jsonHeaders });
}

const INTERNAL = 'http://127.0.0.1';

async function uploadToGradio(vpc: Fetcher, file: File): Promise<Record<string, unknown>> {
  const form = new FormData();
  form.append('files', file, file.name || 'prompt.wav');

  const res = await vpc.fetch(`${INTERNAL}/gradio_api/upload`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Gradio upload failed: ${res.status} ${await res.text()}`);

  const paths: string[] = await res.json();
  return { path: paths[0], meta: { _type: 'gradio.FileData' } };
}

async function pollGradioResult(vpc: Fetcher, eventId: string): Promise<string | null> {
  const res = await vpc.fetch(`${INTERNAL}/gradio_api/call/generate_audio/${eventId}`);
  if (!res.ok) { console.error('[cosyvoice-tts] SSE fetch failed:', res.status); return null; }

  const text = await res.text();
  console.log('[cosyvoice-tts] SSE response:', text.substring(0, 1000));

  const lines = text.split('\n');
  let generatingUrl: string | null = null;
  let completeUrl: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('data: ') && i > 0) {
      const eventLine = lines[i - 1];
      try {
        const data = JSON.parse(line.substring(6));
        if (Array.isArray(data) && data[0]?.url) {
          if (eventLine.includes('complete')) completeUrl = data[0].url;
          else if (eventLine.includes('generating')) generatingUrl = data[0].url;
        }
      } catch { /* continue */ }
    }
  }
  return completeUrl || generatingUrl || null;
}

async function fetchAudio(vpc: Fetcher, audioUrl: string): Promise<Uint8Array | null> {
  if (audioUrl.includes('playlist.m3u8')) return fetchHLSAudio(vpc, audioUrl);
  const internal = toInternal(audioUrl);
  const res = await vpc.fetch(internal);
  if (!res.ok) {
    console.error('[cosyvoice-tts] audio fetch failed:', res.status, internal);
    return null;
  }
  return new Uint8Array(await res.arrayBuffer());
}

/** Rewrite a public Gradio URL to the internal VPC host so requests go through the binding */
function toInternal(url: string): string {
  try {
    const u = new URL(url);
    return `${INTERNAL}${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

async function fetchHLSAudio(vpc: Fetcher, playlistUrl: string): Promise<Uint8Array | null> {
  const internalPlaylist = toInternal(playlistUrl);
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await vpc.fetch(internalPlaylist);
    if (!res.ok) { console.error('[cosyvoice-tts] m3u8 fetch failed:', res.status); return null; }

    const m3u8 = await res.text();
    const ended = m3u8.includes('#EXT-X-ENDLIST');
    const baseUrl = internalPlaylist.substring(0, internalPlaylist.lastIndexOf('/') + 1);
    const segments: string[] = [];
    for (const line of m3u8.split('\n')) {
      const t = line.trim();
      if (t && !t.startsWith('#')) segments.push(t);
    }
    console.log('[cosyvoice-tts] m3u8 attempt', attempt + 1, 'segments:', segments.length, 'ended:', ended);

    if (segments.length === 0) {
      if (ended) return null; // ended with no segments → real failure
      await new Promise(r => setTimeout(r, 1500));
      continue;
    }

    const chunks: Uint8Array[] = [];
    for (const seg of segments) {
      const segUrl = seg.startsWith('http') ? toInternal(seg) : `${baseUrl}${seg}`;
      const segRes = await vpc.fetch(segUrl);
      if (segRes.ok) chunks.push(new Uint8Array(await segRes.arrayBuffer()));
    }

    const totalLen = chunks.reduce((s, c) => s + c.length, 0);
    // If playlist hasn't ended and we have very little audio, wait for more segments
    if (!ended && totalLen < 2000) {
      await new Promise(r => setTimeout(r, 1500));
      continue;
    }

    if (totalLen === 0) return null;

    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const c of chunks) { result.set(c, offset); offset += c.length; }
    return result;
  }
  return null;
}

export async function handleCosyVoiceTTS(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: jsonHeaders });
  }

  if (!env.COSYVOICE_VPC) {
    return errorResponse('语音合成服务未配置 VPC 绑定', true);
  }

  const vpc = env.COSYVOICE_VPC;

  try {
    const contentType = request.headers.get('content-type') || '';
    let ttsText: string;
    let promptText = '';
    let promptFileRef: Record<string, unknown> | null = null;
    const mode = '3s极速复刻';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      ttsText = formData.get('tts_text') as string;
      promptText = (formData.get('prompt_text') as string) || '';
      const promptWav = formData.get('prompt_wav') as File | null;
      if (!ttsText) return errorResponse("Missing 'tts_text'");
      if (promptWav) promptFileRef = await uploadToGradio(vpc, promptWav);
    } else {
      const body = await request.json() as any;
      ttsText = body.text;
      if (!ttsText) return errorResponse("Missing 'text'");
      return errorResponse('请先「存为音色」后再朗读，当前服务需要参考音频', true);
    }

    const gradioData = [ttsText, mode, '', promptText, promptFileRef, null, '', 0, false, 1.0];

    const submitRes = await vpc.fetch(`${INTERNAL}/gradio_api/call/generate_audio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: gradioData }),
    });

    if (!submitRes.ok) return errorResponse('语音合成任务提交失败', true);
    const { event_id } = await submitRes.json() as any;

    const audioUrl = await pollGradioResult(vpc, event_id);
    if (!audioUrl) return errorResponse('语音合成失败，模型未返回音频', true);

    const audioData = await fetchAudio(audioUrl);
    if (!audioData || audioData.length === 0) return errorResponse('语音合成完成但音频下载失败，请重试', true);

    const isHLS = audioUrl.includes('playlist.m3u8');
    return new Response(audioData, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': isHLS ? 'audio/aac' : 'audio/wav', 'Cache-Control': 'no-cache' },
    });
  } catch (err) {
    console.error('[cosyvoice-tts] Error:', err);
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(`语音合成出错: ${msg}`, true);
  }
}
