import { useState, useCallback, useRef } from 'react';

const VOICE_ID_KEY = 'resonance_stepfun_voice_id';
const PROMPT_TEXT_KEY = 'resonance_stepfun_prompt_text';

interface UseStepfunTTSReturn {
  speak: (text: string) => Promise<void>;
  stop: () => void;
  isSpeaking: boolean;
  /** Upload reference audio to Stepfun for cloning; stores the returned voice_id */
  setPromptAudio: (blob: Blob, promptText?: string) => void;
  /** Forget the cloned voice */
  clearPromptAudio: () => void;
  /** Whether a cloned voice_id is stored */
  hasPromptAudio: boolean;
  error: string | null;
}

export function useStepfunTTS(): UseStepfunTTSReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPromptAudio, setHasPromptAudio] = useState(() => {
    try { return !!localStorage.getItem(VOICE_ID_KEY); } catch { return false; }
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const apiBase = import.meta.env.VITE_WORKER_API_URL || '';

  const clearPromptAudio = useCallback(() => {
    try {
      localStorage.removeItem(VOICE_ID_KEY);
      localStorage.removeItem(PROMPT_TEXT_KEY);
    } catch { /* ignore */ }
    setHasPromptAudio(false);
  }, []);

  const setPromptAudio = useCallback((blob: Blob, promptText?: string) => {
    void (async () => {
      try {
        setError(null);
        const form = new FormData();
        // Stepfun accepts wav/mp3/flac/ogg/webm — pass through original blob
        const filename = blob.type.includes('mp3') ? 'prompt.mp3'
          : blob.type.includes('wav') ? 'prompt.wav'
          : blob.type.includes('ogg') ? 'prompt.ogg'
          : blob.type.includes('webm') ? 'prompt.webm'
          : 'prompt.wav';
        form.append('prompt_wav', blob, filename);
        if (promptText) form.append('prompt_text', promptText);

        const res = await fetch(`${apiBase}/api/stepfun-tts`, { method: 'POST', body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok === false || !data?.voice_id) {
          throw new Error(data?.error || `音色克隆失败 (${res.status})`);
        }
        try {
          localStorage.setItem(VOICE_ID_KEY, data.voice_id);
          if (promptText) localStorage.setItem(PROMPT_TEXT_KEY, promptText);
        } catch { /* ignore */ }
        setHasPromptAudio(true);
      } catch (err) {
        clearPromptAudio();
        setError(err instanceof Error ? err.message : '音色克隆失败');
      }
    })();
  }, [apiBase, clearPromptAudio]);

  const speak = useCallback(async (text: string) => {
    setError(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    // Create + prime Audio synchronously inside the user gesture (iOS/WeChat)
    const audio = new Audio();
    audioRef.current = audio;
    try {
      audio.muted = true;
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch(() => undefined);
      audio.pause();
      audio.muted = false;
      audio.currentTime = 0;
    } catch { /* ignore */ }

    try {
      setIsSpeaking(true);

      const voiceId = (() => {
        try { return localStorage.getItem(VOICE_ID_KEY) || ''; } catch { return ''; }
      })();
      if (!voiceId) {
        throw new Error('请先「存为音色」克隆后再朗读');
      }

      const res = await fetch(`${apiBase}/api/stepfun-tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice_id: voiceId }),
      });

      const ctype = res.headers.get('content-type') || '';
      if (ctype.includes('application/json')) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error || `TTS 请求失败 (${res.status})`);
      }
      if (!res.ok) throw new Error(`TTS 请求失败 (${res.status})`);

      const audioBlob = await res.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      audio.src = audioUrl;
      audio.onended = () => { setIsSpeaking(false); URL.revokeObjectURL(audioUrl); };
      audio.onerror = () => { setIsSpeaking(false); URL.revokeObjectURL(audioUrl); };

      try {
        await audio.play();
      } catch (playErr) {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        const msg = playErr instanceof Error ? playErr.message : '';
        if (msg.includes('user gesture') || msg.includes('not allowed') || msg.includes('NotAllowed')) {
          throw new Error('请在页面上轻触一下后再点朗读（浏览器要求用户手势）');
        }
        throw playErr;
      }
    } catch (err) {
      setIsSpeaking(false);
      setError(err instanceof Error ? err.message : 'TTS 播放失败');
    }
  }, [apiBase]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsSpeaking(false);
    setError(null);
  }, []);

  return { speak, stop, isSpeaking, setPromptAudio, clearPromptAudio, hasPromptAudio, error };
}