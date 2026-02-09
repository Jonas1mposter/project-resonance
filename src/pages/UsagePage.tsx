import { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Mic, RotateCcw } from 'lucide-react';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { useVolcengineASR } from '@/hooks/useVolcengineASR';
import AudioRecorderButton from '@/components/AudioRecorderButton';
import ASRStreamingResult from '@/components/ASRStreamingResult';
import RecognitionResult from '@/components/RecognitionResult';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useAccessibility } from '@/hooks/useAccessibility';
import { toast } from 'sonner';
import type { ASRSettings } from '@/types';

interface UsagePageProps {
  recognize: () => {
    results: Array<{ phraseId: string; text: string; confidence: number }>;
    isUnknown: boolean;
  };
  onFeedback: (phraseId: string, blob: Blob, duration: number) => void;
  trainedCount: number;
  onSpeak: (text: string) => void;
  onStop: () => void;
  isSpeaking: boolean;
  asrSettings: ASRSettings;
}

export default function UsagePage({
  recognize,
  onFeedback,
  trainedCount,
  onSpeak,
  onStop,
  isSpeaking,
  asrSettings,
}: UsagePageProps) {
  const { isRecording, duration, startRecording, stopRecording, error: recError, audioLevel } = useAudioRecorder();
  const [recognitionState, setRecognitionState] = useState<
    'idle' | 'recording' | 'processing' | 'result'
  >('idle');
  const [results, setResults] = useState<
    Array<{ phraseId: string; text: string; confidence: number }>
  >([]);
  const [isUnknown, setIsUnknown] = useState(false);
  const [lastBlob, setLastBlob] = useState<Blob | null>(null);
  const [lastDuration, setLastDuration] = useState(0);
  const [selectedText, setSelectedText] = useState<string | null>(null);

  // ASR hook
  // Build proxy URL automatically using the Edge Function
  const proxyWsUrl = useMemo(() => {
    if (asrSettings.proxyUrl) return asrSettings.proxyUrl;
    // Auto-construct from Supabase project URL
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (supabaseUrl) {
      const wsUrl = supabaseUrl.replace('https://', 'wss://').replace('http://', 'ws://');
      const resourceId = asrSettings.resourceId || 'volc.bigasr.sauc.duration';
      return `${wsUrl}/functions/v1/asr-proxy?resource_id=${encodeURIComponent(resourceId)}`;
    }
    return undefined;
  }, [asrSettings.proxyUrl, asrSettings.resourceId]);

  const asrConfig = useMemo(() => ({
    appKey: asrSettings.appKey,
    accessKey: asrSettings.accessKey,
    resourceId: asrSettings.resourceId,
    proxyUrl: proxyWsUrl,
  }), [asrSettings.appKey, asrSettings.accessKey, asrSettings.resourceId, proxyWsUrl]);

  const {
    state: asrState,
    partialText,
    finalText,
    error: asrError,
    startSession,
    stopSession,
    reset: resetASR,
    isRecognizing,
  } = useVolcengineASR({
    config: asrConfig,
    mockMode: asrSettings.mockMode,
  });

  // Determine which mode to use: ASR mode (when ASR settings available) or legacy mode
  const useASRMode = true; // Always use ASR mode now

  const handleStart = useCallback(async () => {
    if (useASRMode) {
      setRecognitionState('recording');
      await startRecording();
      await startSession();
    } else {
      setRecognitionState('recording');
      await startRecording();
    }
  }, [useASRMode, startRecording, startSession]);

  const handleStop = useCallback(async () => {
    if (useASRMode) {
      const result = await stopRecording();
      if (result) {
        setLastBlob(result.blob);
        setLastDuration(result.duration);
      }
      stopSession();
      setRecognitionState('result');
    } else {
      const result = await stopRecording();
      if (result) {
        setLastBlob(result.blob);
        setLastDuration(result.duration);
        setRecognitionState('processing');

        setTimeout(() => {
          const recognition = recognize();
          setResults(recognition.results);
          setIsUnknown(recognition.isUnknown);
          setRecognitionState('result');
        }, 600);
      } else {
        setRecognitionState('idle');
      }
    }
  }, [useASRMode, stopRecording, stopSession, recognize]);

  const handleSelect = useCallback(
    (phraseId: string) => {
      if (lastBlob) {
        onFeedback(phraseId, lastBlob, lastDuration);
        const phrase = results.find((r) => r.phraseId === phraseId);
        if (phrase) setSelectedText(phrase.text);
        toast.success('已回灌至训练数据，下次识别更准确');
      }
    },
    [lastBlob, lastDuration, onFeedback, results]
  );

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success('已复制到剪贴板');
    });
  }, []);

  const handleReset = useCallback(() => {
    setRecognitionState('idle');
    setResults([]);
    setIsUnknown(false);
    setLastBlob(null);
    setSelectedText(null);
    resetASR();
  }, [resetASR]);

  // Keyboard shortcuts
  const shortcuts = useMemo(
    () => [
      {
        key: ' ',
        label: '录音',
        description: '开始/停止录音',
        handler: () => {
          if (recognitionState === 'idle') handleStart();
          else if (recognitionState === 'recording') handleStop();
        },
        enabled: recognitionState === 'idle' || recognitionState === 'recording',
      },
      {
        key: 'r',
        label: '重置',
        description: '再说一次',
        handler: handleReset,
        enabled: recognitionState === 'result',
      },
      {
        key: 't',
        label: '复述',
        description: '语音复述',
        handler: () => {
          const text = useASRMode ? finalText : selectedText;
          if (text) {
            isSpeaking ? onStop() : onSpeak(text);
          }
        },
        enabled: recognitionState === 'result' && !!(useASRMode ? finalText : selectedText),
      },
      {
        key: 'c',
        label: '复制',
        description: '复制文本',
        handler: () => {
          const text = useASRMode ? finalText : selectedText;
          if (text) handleCopy(text);
        },
        enabled: recognitionState === 'result' && !!(useASRMode ? finalText : selectedText),
      },
      {
        key: 'Escape',
        label: '取消',
        description: '取消录音',
        handler: () => {
          if (recognitionState === 'recording') {
            stopRecording();
            if (useASRMode) resetASR();
            setRecognitionState('idle');
          }
        },
        enabled: recognitionState === 'recording',
      },
      // Number keys 1-3 to select results (legacy mode only)
      ...(!useASRMode
        ? ([1, 2, 3] as const).map((num) => ({
            key: String(num),
            label: `选择 ${num}`,
            description: `选择第 ${num} 个候选`,
            handler: () => {
              if (results[num - 1]) {
                handleSelect(results[num - 1].phraseId);
              }
            },
            enabled: recognitionState === 'result' && !isUnknown && results.length >= num && !selectedText,
          }))
        : []),
    ],
    [
      recognitionState,
      handleStart,
      handleStop,
      handleReset,
      handleSelect,
      handleCopy,
      selectedText,
      finalText,
      isSpeaking,
      onSpeak,
      onStop,
      stopRecording,
      resetASR,
      results,
      isUnknown,
      useASRMode,
    ]
  );

  useKeyboardShortcuts(shortcuts, 'high');
  const { isMotionReduced } = useAccessibility();

  if (trainedCount === 0 && !useASRMode) {
    return (
      <section className="max-w-lg mx-auto py-16 text-center" aria-labelledby="usage-empty-heading">
        <motion.div
          initial={isMotionReduced ? {} : { opacity: 0, y: 20 }}
          animate={isMotionReduced ? {} : { opacity: 1, y: 0 }}
          className="rounded-2xl border border-border bg-card p-8"
        >
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted" aria-hidden="true">
            <Mic className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 id="usage-empty-heading" className="text-xl font-bold text-foreground">还没有训练数据</h2>
          <p className="mt-2 text-muted-foreground">
            请先前往「训练」页面，为词表中的短语录制语音样本（每条至少 2 遍）
          </p>
        </motion.div>
      </section>
    );
  }

  return (
    <section className="max-w-lg mx-auto space-y-6" aria-labelledby="usage-heading">
      <div>
        <h2 id="usage-heading" className="text-2xl font-bold text-foreground">语音识别</h2>
        <p className="mt-1 text-muted-foreground">
          {useASRMode ? (
            <>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium mr-2 ${
                asrSettings.mockMode 
                  ? 'bg-warning/15 text-warning-foreground' 
                  : 'bg-success/15 text-success'
              }`}>
                {asrSettings.mockMode ? '模拟' : 'ASR'}
              </span>
              豆包大模型语音识别
            </>
          ) : (
            <>已有 {trainedCount} 条短语可识别</>
          )}
        </p>
      </div>

      {/* Keyboard hint */}
      {recognitionState === 'idle' && (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <span>按</span>
          <kbd className="kbd-hint">空格</kbd>
          <span>开始录音</span>
        </div>
      )}

      {/* Recording Area */}
      {(recognitionState === 'idle' || recognitionState === 'recording') && (
        <motion.div
          initial={isMotionReduced ? {} : { opacity: 0 }}
          animate={isMotionReduced ? {} : { opacity: 1 }}
          className="rounded-2xl border border-border bg-card p-8"
        >
          <div className="flex flex-col items-center">
            <AudioRecorderButton
              isRecording={isRecording}
              duration={duration}
              audioLevel={audioLevel}
              onStart={handleStart}
              onStop={handleStop}
              size="lg"
            />
          </div>

          {/* Show streaming partial text while recording */}
          {useASRMode && isRecognizing && partialText && (
            <div className="mt-6 pt-4 border-t border-border">
              <ASRStreamingResult
                partialText={partialText}
                finalText=""
                onSpeak={onSpeak}
                onStop={onStop}
                isSpeaking={isSpeaking}
              />
            </div>
          )}
        </motion.div>
      )}

      {/* Processing (legacy mode) */}
      {recognitionState === 'processing' && !useASRMode && (
        <motion.div
          initial={isMotionReduced ? {} : { opacity: 0 }}
          animate={isMotionReduced ? {} : { opacity: 1 }}
          className="rounded-2xl border border-border bg-card p-8 text-center"
          role="status"
          aria-live="polite"
        >
          <div className="mx-auto mb-4 h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin" aria-hidden="true" />
          <p className="text-foreground font-medium">正在识别...</p>
        </motion.div>
      )}

      {/* Results */}
      {recognitionState === 'result' && (
        <>
          {useASRMode ? (
            <ASRStreamingResult
              partialText={partialText}
              finalText={finalText}
              onSpeak={onSpeak}
              onStop={onStop}
              isSpeaking={isSpeaking}
            />
          ) : (
            <RecognitionResult
              results={results}
              isUnknown={isUnknown}
              onSelect={handleSelect}
              onSpeak={onSpeak}
              onStop={onStop}
              isSpeaking={isSpeaking}
              onCopy={handleCopy}
            />
          )}
          <button
            onClick={handleReset}
            className="a11y-target flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            再说一次
            <kbd className="kbd-hint ml-2" aria-hidden="true">R</kbd>
          </button>
        </>
      )}

      {/* No result from ASR */}
      {recognitionState === 'result' && useASRMode && !finalText && !partialText && !isRecognizing && (
        <motion.div
          initial={isMotionReduced ? {} : { opacity: 0 }}
          animate={isMotionReduced ? {} : { opacity: 1 }}
          className="rounded-xl border border-border bg-card p-6 text-center"
          role="alert"
        >
          <Mic className="mx-auto mb-3 h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">未能识别到语音内容，请重试</p>
        </motion.div>
      )}

      {(recError || asrError) && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          {recError || asrError}
        </div>
      )}
    </section>
  );
}
