import { Mic, Square } from 'lucide-react';
import { motion } from 'framer-motion';

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
  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const buttonSize = size === 'lg' ? 'h-20 w-20' : 'h-14 w-14';
  const iconSize = size === 'lg' ? 'h-8 w-8' : 'h-5 w-5';

  return (
    <div className="flex flex-col items-center gap-3">
      <motion.button
        onClick={isRecording ? onStop : onStart}
        whileTap={{ scale: 0.92 }}
        className={`relative flex items-center justify-center rounded-full transition-all ${buttonSize} ${
          isRecording
            ? 'bg-recording text-recording-foreground recording-pulse'
            : 'bg-primary text-primary-foreground hover:opacity-90'
        }`}
      >
        {isRecording && (
          <motion.div
            className="absolute inset-0 rounded-full bg-recording/30"
            animate={{ scale: [1, 1 + audioLevel * 0.4, 1] }}
            transition={{ duration: 0.3, repeat: Infinity }}
          />
        )}
        {isRecording ? (
          <Square className={iconSize} fill="currentColor" />
        ) : (
          <Mic className={iconSize} />
        )}
      </motion.button>

      {isRecording ? (
        <div className="flex items-center gap-2 text-sm font-medium text-recording">
          <span className="h-2 w-2 rounded-full bg-recording animate-pulse" />
          录音中 {formatDuration(duration)}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {size === 'lg' ? '点击开始录音' : '录音'}
        </p>
      )}
    </div>
  );
}
