import { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Mic, RotateCcw, Volume2, Check, Loader2 } from 'lucide-react';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { useStepfunASR } from '@/hooks/useStepfunASR';
import AudioRecorderButton from '@/components/AudioRecorderButton';
import ASRStreamingResult from '@/components/ASRStreamingResult';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useAccessibility } from '@/hooks/useAccessibility';
import { toast } from 'sonner';
import type { ASRSettings } from '@/types';

interface UsagePageProps {
  onSpeak: (text: string) => Promise<void>;
  onStop: () => void;
  isSpeaking: boolean;
  voiceId: string | null;
  isCloning: boolean;
  ttsError: string | null;
  onCloneVoice: (audioBlob: Blob, referenceText?: string) => Promise<string | null>;
  onClearVoice: () => void;
}

type FlowState = 'idle' | 'recording' | 'processing' | 'cloning' | 'speaking' | 'result';

export default function UsagePage({
  onSpeak,
  onStop,
  isSpeaking,
  voiceId,
  isCloning,
  ttsError,
  onCloneVoice,
  onClearVoice,
}: UsagePageProps) {
  const { isRecording, duration, startRecording, stopRecording, error: recError, audioLevel } = useAudioRecorder();
  const [flowState, setFlowState] = useState<FlowState>('idle');
  const [lastTranscript, setLastTranscript] = useState('');

  const {
    finalText,
    isProcessing,
    error: asrError,
    transcribe,
    reset: resetASR,
  } = useStepfunASR();

  const handleStart = useCallback(async () => {
    setFlowState('recording');
    setLastTranscript('');
    await startRecording();
  }, [startRecording]);

  const handleStop = useCallback(async () => {
    const result = await stopRecording();
    if (!result) {
      setFlowState('idle');
      return;
    }

    const { blob, duration: recDuration } = result;

    // Step 1: ASR transcription
    setFlowState('processing');
    const text = await transcribe(blob);

    if (!text) {
      setFlowState('result');
      return;
    }

    setLastTranscript(text);

    // Step 2: Clone voice if needed (duration >= 10s and no existing voiceId)
    if (!voiceId && recDuration >= 10) {
      setFlowState('cloning');
      const vid = await onCloneVoice(blob, text);
      if (vid) {
        toast.success('音色克隆成功');
      }
    }

    // Step 3: Auto-speak the transcribed text
    setFlowState('speaking');
    try {
      await onSpeak(text);
    } catch {
      // TTS error handled by parent
    }

    setFlowState('result');
  }, [stopRecording, transcribe, voiceId, onCloneVoice, onSpeak]);

  const handleReset = useCallback(() => {
    setFlowState('idle');
    setLastTranscript('');
    resetASR();
  }, [resetASR]);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success('已复制到剪贴板');
    });
  }, []);

  // Keyboard shortcuts
  const shortcuts = useMemo(
    () => [
      {
        key: ' ',
        label: '录音',
        description: '开始/停止录音',
        handler: () => {
          if (flowState === 'idle') handleStart();
          else if (flowState === 'recording') handleStop();
        },
        enabled: flowState === 'idle' || flowState === 'recording',
      },
      {
        key: 'r',
        label: '重置',
        description: '再说一次',
        handler: handleReset,
        enabled: flowState === 'result',
      },
      {
        key: 't',
        label: '复述',
        description: '语音复述',
        handler: () => {
          const text = finalText || lastTranscript;
          if (text) {
            isSpeaking ? onStop() : onSpeak(text);
          }
        },
        enabled: flowState === 'result' && !!(finalText || lastTranscript),
      },
      {
        key: 'c',
        label: '复制',
        description: '复制文本',
        handler: () => {
          const text = finalText || lastTranscript;
          if (text) handleCopy(text);
        },
        enabled: flowState === 'result' && !!(finalText || lastTranscript),
      },
      {
        key: 'Escape',
        label: '取消',
        description: '取消录音',
        handler: () => {
          if (flowState === 'recording') {
            stopRecording();
            resetASR();
            setFlowState('idle');
          }
        },
        enabled: flowState === 'recording',
      },
    ],
    [flowState, handleStart, handleStop, handleReset, handleCopy, finalText, lastTranscript, isSpeaking, onSpeak, onStop, stopRecording, resetASR]
  );

  useKeyboardShortcuts(shortcuts, 'high');
  const { isMotionReduced } = useAccessibility();

  const displayText = finalText || lastTranscript;

  return (
    <section className="max-w-lg mx-auto space-y-6" aria-labelledby="usage-heading">
      <div>
        <h2 id="usage-heading" className="text-2xl font-bold text-foreground">语音识别</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          录音 → 识别文字 → 克隆音色 → 朗读
          {voiceId && (
            <span className="inline-flex items-center gap-1 ml-2 rounded-full px-2 py-0.5 text-xs font-medium bg-success/15 text-success">
              <Check className="h-3 w-3" />
              音色已克隆
            </span>
          )}
        </p>
      </div>

      {/* Keyboard hint */}
      {flowState === 'idle' && (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <span>按</span>
          <kbd className="kbd-hint">空格</kbd>
          <span>开始录音</span>
          {!voiceId && <span className="text-muted-foreground/60">（录 10 秒以上可克隆音色）</span>}
        </div>
      )}

      {/* Recording Area */}
      {(flowState === 'idle' || flowState === 'recording') && (
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
            {isRecording && !voiceId && (
              <p className="mt-3 text-xs text-muted-foreground">
                {duration >= 10 ? (
                  <span className="text-success">✓ 已满 10 秒，可克隆音色</span>
                ) : (
                  <span>已录 {duration}s / 10s（克隆音色需 10 秒）</span>
                )}
              </p>
            )}
          </div>
        </motion.div>
      )}

      {/* Processing / Cloning / Speaking states */}
      {(flowState === 'processing' || flowState === 'cloning' || flowState === 'speaking') && (
        <motion.div
          initial={isMotionReduced ? {} : { opacity: 0 }}
          animate={isMotionReduced ? {} : { opacity: 1 }}
          className="rounded-2xl border border-border bg-card p-8 text-center space-y-3"
          role="status"
          aria-live="polite"
        >
          <div className="mx-auto h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin" aria-hidden="true" />
          <p className="text-foreground font-medium">
            {flowState === 'processing' && '正在识别语音...'}
            {flowState === 'cloning' && '正在克隆音色...'}
            {flowState === 'speaking' && '正在朗读...'}
          </p>
          {flowState !== 'processing' && displayText && (
            <p className="text-sm text-muted-foreground">「{displayText}」</p>
          )}
        </motion.div>
      )}

      {/* Results */}
      {flowState === 'result' && (
        <>
          {displayText ? (
            <ASRStreamingResult
              partialText=""
              finalText={displayText}
              onSpeak={onSpeak}
              onStop={onStop}
              isSpeaking={isSpeaking}
            />
          ) : (
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

      {(recError || asrError || ttsError) && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          {recError || asrError || ttsError}
        </div>
      )}
    </section>
  );
}
