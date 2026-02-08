import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Mic, RotateCcw } from 'lucide-react';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import AudioRecorderButton from '@/components/AudioRecorderButton';
import RecognitionResult from '@/components/RecognitionResult';
import { toast } from 'sonner';

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
}

export default function UsagePage({
  recognize,
  onFeedback,
  trainedCount,
  onSpeak,
  onStop,
  isSpeaking,
}: UsagePageProps) {
  const { isRecording, duration, startRecording, stopRecording, error, audioLevel } = useAudioRecorder();
  const [recognitionState, setRecognitionState] = useState<
    'idle' | 'recording' | 'processing' | 'result'
  >('idle');
  const [results, setResults] = useState<
    Array<{ phraseId: string; text: string; confidence: number }>
  >([]);
  const [isUnknown, setIsUnknown] = useState(false);
  const [lastBlob, setLastBlob] = useState<Blob | null>(null);
  const [lastDuration, setLastDuration] = useState(0);

  const handleStart = useCallback(async () => {
    setRecognitionState('recording');
    await startRecording();
  }, [startRecording]);

  const handleStop = useCallback(async () => {
    const result = await stopRecording();
    if (result) {
      setLastBlob(result.blob);
      setLastDuration(result.duration);
      setRecognitionState('processing');

      // Simulate processing delay
      setTimeout(() => {
        const recognition = recognize();
        setResults(recognition.results);
        setIsUnknown(recognition.isUnknown);
        setRecognitionState('result');
      }, 600);
    } else {
      setRecognitionState('idle');
    }
  }, [stopRecording, recognize]);

  const handleSelect = useCallback(
    (phraseId: string) => {
      if (lastBlob) {
        onFeedback(phraseId, lastBlob, lastDuration);
        toast.success('已回灌至训练数据，下次识别更准确');
      }
    },
    [lastBlob, lastDuration, onFeedback]
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
  }, []);

  if (trainedCount === 0) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-border bg-card p-8"
        >
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Mic className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-bold text-foreground">还没有训练数据</h2>
          <p className="mt-2 text-muted-foreground">
            请先前往「训练」页面，为词表中的短语录制语音样本（每条至少 2 遍）
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">语音识别</h2>
        <p className="mt-1 text-muted-foreground">
          已有 {trainedCount} 条短语可识别
        </p>
      </div>

      {/* Recording Area */}
      {(recognitionState === 'idle' || recognitionState === 'recording') && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
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
        </motion.div>
      )}

      {/* Processing */}
      {recognitionState === 'processing' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-2xl border border-border bg-card p-8 text-center"
        >
          <div className="mx-auto mb-4 h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
          <p className="text-foreground font-medium">正在识别...</p>
        </motion.div>
      )}

      {/* Results */}
      {recognitionState === 'result' && (
        <>
          <RecognitionResult
            results={results}
            isUnknown={isUnknown}
            onSelect={handleSelect}
            onSpeak={onSpeak}
            onStop={onStop}
            isSpeaking={isSpeaking}
            onCopy={handleCopy}
          />
          <button
            onClick={handleReset}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            再说一次
          </button>
        </>
      )}

      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}
