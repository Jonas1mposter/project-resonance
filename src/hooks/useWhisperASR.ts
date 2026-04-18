import { useState, useCallback } from 'react';
import { toast } from 'sonner';

export type ASREngine = 'whisper' | 'gemini' | 'browser';
export type ASREngineStage =
  | 'idle'
  | 'whisper-trying'
  | 'gemini-trying'
  | 'browser-trying'
  | 'success'
  | 'failed';

interface UseWhisperASRReturn {
  finalText: string;
  isProcessing: boolean;
  error: string | null;
  transcribe: (audioBlob: Blob) => Promise<string | null>;
  reset: () => void;
  /** Which engine produced the final transcript (or is being tried) */
  engine: ASREngine | null;
  /** Fine-grained stage for showing progress UI to the user */
  engineStage: ASREngineStage;
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
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
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
  const [engine, setEngine] = useState<ASREngine | null>(null);
  const [engineStage, setEngineStage] = useState<ASREngineStage>('idle');

  const transcribe = useCallback(async (audioBlob: Blob): Promise<string | null> => {
    setError(null);
    setIsProcessing(true);
    setFinalText('');
    setEngine(null);
    setEngineStage('whisper-trying');

    /**
     * Three-tier ASR fallback chain with full UI feedback:
     *   1. Worker → Whisper (self-hosted, primary)
     *   2. Gemini ASR edge function (cloud fallback)
     *   3. Browser Web Speech API (last-resort offline fallback)
     */
    const tryGeminiThenBrowser = async (): Promise<string | null> => {
      // Stage 2: Gemini
      setEngineStage('gemini-trying');
      try {
        const geminiText = await geminiASRFallback(audioBlob);
        if (geminiText) {
          setEngine('gemini');
          setEngineStage('success');
          setFinalText(geminiText);
          setIsProcessing(false);
          return geminiText;
        }
      } catch (geminiErr) {
        console.warn('[ASR] Gemini fallback failed:', geminiErr);
      }

      // Stage 3: Browser native
      setEngineStage('browser-trying');
      const browserText = await browserSpeechFallback();
      if (browserText) {
        setEngine('browser');
        setEngineStage('success');
        setFinalText(browserText);
        setIsProcessing(false);
        return browserText;
      }

      setEngineStage('failed');
      setError('所有语音识别服务均不可用，请稍后重试');
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

      // Hard failure (404, 5xx) — Worker itself down
      if (!response.ok) {
        console.warn('[ASR] Worker returned', response.status, '→ fallback');
        return await tryGeminiThenBrowser();
      }

      const data = await response.json().catch(() => ({} as any));

      // Soft failure — Worker reached but ASR engine returned error envelope
      if (data.ok === false) {
        console.warn('[ASR] Worker returned ok:false →', data.error);
        return await tryGeminiThenBrowser();
      }

      const text = (data.text || '').trim();
      if (text) {
        // Worker may have already fallen back internally — respect its `source`
        const reportedEngine: ASREngine =
          data.source === 'gemini' ? 'gemini' : 'whisper';
        setEngine(reportedEngine);
        setEngineStage('success');
        setFinalText(text);
        setIsProcessing(false);
        return text;
      }

      setEngineStage('failed');
      setError('未能识别到语音内容');
      setIsProcessing(false);
      return null;
    } catch (err) {
      console.warn('[ASR] Worker fetch threw, falling back:', err);
      return await tryGeminiThenBrowser();
    }
  }, []);

  const reset = useCallback(() => {
    setFinalText('');
    setIsProcessing(false);
    setError(null);
    setEngine(null);
    setEngineStage('idle');
  }, []);

  return { finalText, isProcessing, error, transcribe, reset, engine, engineStage };
}
