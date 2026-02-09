import { Mic, Square } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAccessibility } from '@/hooks/useAccessibility';

interface AudioRecorderButtonProps {
  isRecording: boolean;
  duration: number;
  audioLevel: number;
  onStart: () => void;
  onStop: () => void;
  size?: 'sm' | 'lg';
}

export default function AudioRecorderButton({
  isRecording,
  duration,
  audioLevel,
  onStart,
  onStop,
  size = 'lg',
}: AudioRecorderButtonProps) {
  const { isMotionReduced } = useAccessibility();

  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Larger targets for a11y: lg=96px, sm=64px
  const buttonSize = size === 'lg' ? 'h-24 w-24' : 'h-16 w-16';
  const iconSize = size === 'lg' ? 'h-10 w-10' : 'h-6 w-6';

  return (
    <div className="flex flex-col items-center gap-3">
      <motion.button
        onClick={isRecording ? onStop : onStart}
        whileTap={isMotionReduced ? undefined : { scale: 0.92 }}
        aria-label={isRecording ? `停止录音，已录制 ${formatDuration(duration)}` : '开始录音'}
        aria-pressed={isRecording}
        role="button"
        className={`relative flex items-center justify-center rounded-full transition-all ${buttonSize} ${
          isRecording
            ? 'bg-recording text-recording-foreground recording-pulse'
            : 'bg-primary text-primary-foreground hover:opacity-90'
        }`}
      >
        {isRecording && !isMotionReduced && (
          <motion.div
            className="absolute inset-0 rounded-full bg-recording/30"
            animate={{ scale: [1, 1 + audioLevel * 0.4, 1] }}
            transition={{ duration: 0.3, repeat: Infinity }}
            aria-hidden="true"
          />
        )}
        {isRecording && isMotionReduced && (
          <div
            className="absolute inset-0 rounded-full border-4 border-recording-foreground/30"
            aria-hidden="true"
          />
        )}
        {isRecording ? (
          <Square className={iconSize} fill="currentColor" aria-hidden="true" />
        ) : (
          <Mic className={iconSize} aria-hidden="true" />
        )}
      </motion.button>

      {isRecording ? (
        <div className="flex items-center gap-2 text-sm font-medium text-recording" role="status" aria-live="polite">
          <span className="h-2 w-2 rounded-full bg-recording animate-pulse" aria-hidden="true" />
          录音中 {formatDuration(duration)}
          <kbd className="kbd-hint ml-1" aria-hidden="true">空格</kbd>
          <span className="text-xs text-muted-foreground">停止</span>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {size === 'lg' ? (
            <span className="flex items-center gap-2">
              点击或按
              <kbd className="kbd-hint" aria-hidden="true">空格</kbd>
              开始录音
            </span>
          ) : (
            '录音'
          )}
        </p>
      )}
    </div>
  );
}
