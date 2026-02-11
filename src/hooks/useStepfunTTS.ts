import { useState, useCallback, useRef } from 'react';

interface UseStepfunTTSReturn {
  /** Speak text using StepFun TTS with optional cloned voice */
  speak: (text: string) => Promise<void>;
  /** Stop current playback */
  stop: () => void;
  /** Whether audio is currently playing */
  isSpeaking: boolean;
  /** Clone a voice from reference audio blob (5-10s) */
  cloneVoice: (audioBlob: Blob, referenceText?: string) => Promise<string | null>;
  /** Whether voice cloning is in progress */
  isCloning: boolean;
  /** Current cloned voice ID */
  voiceId: string | null;
  /** Set voice ID manually (e.g. from localStorage) */
  setVoiceId: (id: string | null) => void;
  /** Error message */
  error: string | null;
}

const VOICE_ID_KEY = 'resonance_cloned_voice_id';

export function useStepfunTTS(): UseStepfunTTSReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isCloning, setIsCloning] = useState(false);
  const [voiceId, setVoiceIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(VOICE_ID_KEY);
    } catch {
      return null;
    }
  });
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const setVoiceId = useCallback((id: string | null) => {
    setVoiceIdState(id);
    try {
      if (id) {
        localStorage.setItem(VOICE_ID_KEY, id);
      } else {
        localStorage.removeItem(VOICE_ID_KEY);
      }
    } catch { /* ignore */ }
  }, []);

  const speak = useCallback(async (text: string) => {
    setError(null);
    stop();

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!supabaseUrl) throw new Error('未配置后端地址');

      setIsSpeaking(true);

      const response = await fetch(`${supabaseUrl}/functions/v1/stepfun-tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          text,
          voice: voiceId || 'male-qn-qingse',
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `TTS 请求失败 (${response.status})`);
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
      };
      audio.onerror = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
      };

      await audio.play();
    } catch (err) {
      setIsSpeaking(false);
      const message = err instanceof Error ? err.message : 'TTS 播放失败';
      setError(message);
    }
  }, [voiceId]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  const cloneVoice = useCallback(async (audioBlob: Blob, referenceText?: string): Promise<string | null> => {
    setError(null);
    setIsCloning(true);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!supabaseUrl) throw new Error('未配置后端地址');

      const formData = new FormData();
      formData.append('audio', audioBlob, 'reference.wav');
      formData.append('model', 'speech-2.8-hd');
      if (referenceText) {
        formData.append('text', referenceText);
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/stepfun-voice-clone`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `音色复刻失败 (${response.status})`);
      }

      const data = await response.json();
      const newVoiceId = data.voice_id;

      if (newVoiceId) {
        setVoiceId(newVoiceId);
        setIsCloning(false);
        return newVoiceId;
      } else {
        throw new Error('未获取到音色 ID');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '音色复刻失败';
      setError(message);
      setIsCloning(false);
      return null;
    }
  }, [setVoiceId]);

  return {
    speak,
    stop,
    isSpeaking,
    cloneVoice,
    isCloning,
    voiceId,
    setVoiceId,
    error,
  };
}
