import { Volume2, VolumeX } from 'lucide-react';
import { motion } from 'framer-motion';

interface TTSButtonProps {
  text: string;
  onSpeak: (text: string) => void;
  onStop: () => void;
  isSpeaking: boolean;
  className?: string;
}

export default function TTSButton({ text, onSpeak, onStop, isSpeaking, className = '' }: TTSButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={() => (isSpeaking ? onStop() : onSpeak(text))}
      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
        isSpeaking
          ? 'bg-accent text-accent-foreground'
          : 'bg-primary text-primary-foreground hover:opacity-90'
      } ${className}`}
    >
      {isSpeaking ? (
        <>
          <VolumeX className="h-4 w-4" />
          停止
        </>
      ) : (
        <>
          <Volume2 className="h-4 w-4" />
          复述
        </>
      )}
    </motion.button>
  );
}
