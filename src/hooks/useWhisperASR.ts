import { useState, useCallback } from 'react';

interface UseWhisperASRReturn {
  finalText: string;
  isProcessing: boolean;
  error: string | null;
  transcribe: (audioBlob: Blob) => Promise<string | null>;
  reset: () => void;
}

export function useWhisperASR(): UseWhisperASRReturn {
  const [finalText, setFinalText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const transcribe = useCallback(async (audioBlob: Blob): Promise<string | null> => {
    setError(null);
    setIsProcessing(true);
    setFinalText('');

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!supabaseUrl) {
        throw new Error('未配置后端地址');
      }

      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.webm');

      const response = await fetch(`${supabaseUrl}/functions/v1/whisper-asr`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: formData,
      });

      const data = await response.json().catch(() => ({}));

      // Handle structured error responses (returned as 200 with ok: false)
      if (data.ok === false) {
        throw new Error(data.error || '识别服务暂时不可用');
      }

      // Handle legacy non-200 responses
      if (!response.ok) {
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
