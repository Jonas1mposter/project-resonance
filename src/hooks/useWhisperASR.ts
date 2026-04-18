import { useState, useCallback } from 'react';
import { toast } from 'sonner';

interface UseWhisperASRReturn {
  finalText: string;
  isProcessing: boolean;
  error: string | null;
  transcribe: (audioBlob: Blob) => Promise<string | null>;
  reset: () => void;
}

/**
 * Try browser-native Web Speech API as fallback when Whisper is offline.
 * Returns the transcript or null if unsupported / failed.
 */
function browserSpeechFallback(): Promise<string | null> {
  return new Promise((resolve) => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      resolve(null);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    let settled = false;

    const finish = (text: string | null) => {
      if (settled) return;
      settled = true;
      resolve(text);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim() || '';
      finish(transcript || null);
    };

    recognition.onerror = () => finish(null);
    recognition.onnomatch = () => finish(null);
    recognition.onend = () => finish(null);

    // Timeout safety
    setTimeout(() => finish(null), 8000);

    recognition.start();
  });
}

/**
 * Call Gemini ASR edge function as fallback when Whisper is offline.
 */
async function geminiASRFallback(audioBlob: Blob): Promise<string | null> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) return null;

  const formData = new FormData();
  formData.append('file', audioBlob, 'recording.webm');

  const response = await fetch(`${supabaseUrl}/functions/v1/gemini-asr`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: formData,
  });

  const data = await response.json();
  if (data.ok && data.text?.trim()) {
    return data.text.trim();
  }
  return null;
}

export function useWhisperASR(): UseWhisperASRReturn {
  const [finalText, setFinalText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const transcribe = useCallback(async (audioBlob: Blob): Promise<string | null> => {
    setError(null);
    setIsProcessing(true);
    setFinalText('');

    /**
     * Three-tier ASR fallback chain:
     *   1. Worker → Whisper (self-hosted, primary)
     *   2. Gemini ASR edge function (cloud fallback)
     *   3. Browser Web Speech API (last-resort offline fallback)
     *
     * The Worker has its own internal Whisper→Gemini fallback, so the
     * client-side Gemini step covers the case where the Worker itself is
     * unreachable (404, network error, etc.).
     */
    const tryGeminiThenBrowser = async (notify = true): Promise<string | null> => {
      try {
        const geminiText = await geminiASRFallback(audioBlob);
        if (geminiText) {
          setFinalText(geminiText);
          setIsProcessing(false);
          if (notify) toast.success('已通过 Gemini 云端识别');
          return geminiText;
        }
      } catch (geminiErr) {
        console.warn('[ASR] Gemini fallback failed:', geminiErr);
      }

      const browserText = await browserSpeechFallback();
      if (browserText) {
        setFinalText(browserText);
        setIsProcessing(false);
        if (notify) toast.success('已通过浏览器内置引擎识别（精度可能较低）');
        return browserText;
      }

      const message = '所有语音识别服务均不可用，请稍后重试';
      setError(message);
      setIsProcessing(false);
      return null;
    };

    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.webm');

      const apiBase = import.meta.env.VITE_WORKER_API_URL || '';
      const response = await fetch(`${apiBase}/api/whisper-asr`, {
        method: 'POST',
        body: formData,
      });

      // Hard failure (404, 5xx, etc.) — Worker itself is down
      if (!response.ok) {
        console.warn('[ASR] Worker returned', response.status, '→ fallback');
        toast.info('主识别服务不可用，正在切换备用引擎...');
        return await tryGeminiThenBrowser();
      }

      const data = await response.json().catch(() => ({} as any));

      // Soft failure — Worker reached but ASR engine returned error envelope
      if (data.ok === false) {
        console.warn('[ASR] Worker returned ok:false →', data.error);
        toast.info('Whisper 离线，正在切换 Gemini 识别...');
        return await tryGeminiThenBrowser();
      }

      const text = (data.text || '').trim();
      if (text) {
        setFinalText(text);
        // Inform user when Worker already fell back to Gemini internally
        if (data.source === 'gemini' || data.fallback) {
          toast.info('已通过 Gemini 云端识别');
        }
        setIsProcessing(false);
        return text;
      }

      setError('未能识别到语音内容');
      setIsProcessing(false);
      return null;
    } catch (err) {
      // Network error / fetch threw → Worker unreachable
      console.warn('[ASR] Worker fetch threw, falling back:', err);
      toast.info('网络异常，正在切换备用识别引擎...');
      return await tryGeminiThenBrowser();
    }
  }, []);

  const reset = useCallback(() => {
    setFinalText('');
    setIsProcessing(false);
    setError(null);
  }, []);

  return { finalText, isProcessing, error, transcribe, reset };
}
