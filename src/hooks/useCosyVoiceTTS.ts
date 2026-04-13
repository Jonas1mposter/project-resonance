import { useState, useCallback, useRef } from 'react';

const PROMPT_AUDIO_KEY = 'resonance_prompt_audio';
const PROMPT_TEXT_KEY = 'resonance_prompt_text';

interface UseCosyVoiceTTSReturn {
  speak: (text: string) => Promise<void>;
  stop: () => void;
  isSpeaking: boolean;
  /** Store a reference audio for zero-shot cloning */
  setPromptAudio: (blob: Blob, promptText?: string) => void;
  /** Clear stored prompt audio */
  clearPromptAudio: () => void;
  /** Whether a prompt audio is stored */
  hasPromptAudio: boolean;
  error: string | null;
}

export function useCosyVoiceTTS(): UseCosyVoiceTTSReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPromptAudio, setHasPromptAudio] = useState(() => {
    try {
      return !!localStorage.getItem(PROMPT_AUDIO_KEY);
    } catch {
      return false;
    }
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const promptBlobRef = useRef<Blob | null>(null);

  const setPromptAudio = useCallback((blob: Blob, promptText?: string) => {
    promptBlobRef.current = blob;
    // Also persist as base64 for cross-session usage
    const reader = new FileReader();
    reader.onloadend = () => {
      try {
        localStorage.setItem(PROMPT_AUDIO_KEY, reader.result as string);
        if (promptText) {
          localStorage.setItem(PROMPT_TEXT_KEY, promptText);
        }
        setHasPromptAudio(true);
      } catch { /* storage full */ }
    };
    reader.readAsDataURL(blob);
  }, []);

  const clearPromptAudio = useCallback(() => {
    promptBlobRef.current = null;
    try {
      localStorage.removeItem(PROMPT_AUDIO_KEY);
      localStorage.removeItem(PROMPT_TEXT_KEY);
    } catch { /* ignore */ }
    setHasPromptAudio(false);
  }, []);

  /** Load prompt blob from localStorage if not in memory */
  const getPromptBlob = useCallback(async (): Promise<Blob | null> => {
    if (promptBlobRef.current) return promptBlobRef.current;
    try {
      const dataUrl = localStorage.getItem(PROMPT_AUDIO_KEY);
      if (!dataUrl) return null;
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      promptBlobRef.current = blob;
      return blob;
    } catch {
      return null;
    }
  }, []);

  const speak = useCallback(async (text: string) => {
    setError(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    try {
      setIsSpeaking(true);

      const promptBlob = await getPromptBlob();
      const promptText = localStorage.getItem(PROMPT_TEXT_KEY) || '';

      let response: Response;

      const cosyBase = 'https://cosyvoice-project-resonance.project-resonance.cn';

      if (promptBlob) {
        const formData = new FormData();
        formData.append('tts_text', text);
        formData.append('prompt_text', promptText);
        formData.append('prompt_wav', promptBlob, 'prompt.wav');

        response = await fetch(`${cosyBase}/api/cosyvoice-tts`, {
          method: 'POST',
          body: formData,
        });
      } else {
        response = await fetch(`${cosyBase}/api/cosyvoice-tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `TTS 请求失败 (${response.status})`);
      }

      // Check for structured error in 200 response
      const responseContentType = response.headers.get('content-type') || '';
      if (responseContentType.includes('application/json')) {
        const errData = await response.json();
        if (errData.ok === false) {
          throw new Error(errData.error || 'TTS 服务暂时不可用');
        }
        // Shouldn't reach here for valid audio, but just in case
        throw new Error(errData.error || '未知错误');
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
  }, [getPromptBlob]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsSpeaking(false);
    setError(null);
  }, []);

  return {
    speak,
    stop,
    isSpeaking,
    setPromptAudio,
    clearPromptAudio,
    hasPromptAudio,
    error,
  };
}
