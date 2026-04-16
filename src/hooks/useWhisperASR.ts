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

export function useWhisperASR(): UseWhisperASRReturn {
  const [finalText, setFinalText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const transcribe = useCallback(async (audioBlob: Blob): Promise<string | null> => {
    setError(null);
    setIsProcessing(true);
    setFinalText('');

    let whisperFailed = false;

    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.webm');

      const apiBase = import.meta.env.VITE_WORKER_API_URL || '';
      const response = await fetch(`${apiBase}/api/whisper-asr`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json().catch(() => ({}));

      if (data.ok === false) {
        whisperFailed = true;
        throw new Error(data.error || '识别服务暂时不可用');
      }

      if (!response.ok) {
        whisperFailed = true;
        throw new Error(data.error || `请求失败 (${response.status})`);
      }

      const text = data.text?.trim() || '';

      if (text) {
        setFinalText(text);
      } else {
        setError('未能识别到语音内容');
      }

      setIsProcessing(false);
      return text || null;
    } catch (err) {
      // If Whisper is offline, try Gemini ASR fallback
      if (whisperFailed) {
        toast.info('Whisper 离线，正在切换 Gemini 识别...');

        try {
          const geminiText = await geminiASRFallback(audioBlob);
          if (geminiText) {
            setFinalText(geminiText);
            setIsProcessing(false);
            toast.success('已通过 Gemini 云端识别');
            return geminiText;
          }
        } catch (geminiErr) {
          console.warn('[ASR] Gemini fallback failed:', geminiErr);
        }

        // Gemini failed, try browser Speech API as last resort
        const browserText = await browserSpeechFallback();
        if (browserText) {
          setFinalText(browserText);
          setIsProcessing(false);
          toast.success('已通过浏览器内置引擎识别（精度可能较低）');
          return browserText;
        }

        const message = '所有语音识别服务均不可用，请稍后重试。';
        setError(message);
        setIsProcessing(false);
        return null;
      }

      const message = err instanceof Error ? err.message : '识别失败';
      setError(message);
      setIsProcessing(false);
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setFinalText('');
    setIsProcessing(false);
    setError(null);
  }, []);

  return { finalText, isProcessing, error, transcribe, reset };
}
