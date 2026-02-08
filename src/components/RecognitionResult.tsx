import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, HelpCircle } from 'lucide-react';
import TTSButton from './TTSButton';

interface RecognitionResultProps {
  results: Array<{ phraseId: string; text: string; confidence: number }>;
  isUnknown: boolean;
  onSelect: (phraseId: string) => void;
  onSpeak: (text: string) => void;
  onStop: () => void;
  isSpeaking: boolean;
  onCopy: (text: string) => void;
}

export default function RecognitionResult({
  results,
  isUnknown,
  onSelect,
  onSpeak,
  onStop,
  isSpeaking,
  onCopy,
}: RecognitionResultProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (isUnknown || results.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-border bg-card p-6 text-center"
      >
        <HelpCircle className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
        <h3 className="text-lg font-semibold text-foreground">没听懂</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          请再说一次，或尝试补录更多训练样本
        </p>
      </motion.div>
    );
  }

  if (selectedId) {
    const selected = results.find((r) => r.phraseId === selectedId);
    if (selected) {
      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-xl border-2 border-success bg-card p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-success">
              <Check className="h-4 w-4 text-success-foreground" />
            </div>
            <span className="text-sm font-medium text-success">已确认</span>
          </div>
          <p className="text-3xl font-bold text-foreground mb-6">{selected.text}</p>
          <div className="flex gap-3">
            <TTSButton
              text={selected.text}
              onSpeak={onSpeak}
              onStop={onStop}
              isSpeaking={isSpeaking}
            />
            <button
              onClick={() => onCopy(selected.text)}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              复制文本
            </button>
          </div>
        </motion.div>
      );
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">
        识别结果 — 请选择正确的短语：
      </h3>
      {results.map((result, index) => (
        <motion.button
          key={result.phraseId}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.1 }}
          onClick={() => {
            setSelectedId(result.phraseId);
            onSelect(result.phraseId);
          }}
          className="flex w-full items-center justify-between rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary hover:shadow-sm"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
              {index + 1}
            </span>
            <span className="text-lg font-medium text-foreground">{result.text}</span>
          </div>
          <span className="text-sm text-muted-foreground">
            {Math.round(result.confidence * 100)}%
          </span>
        </motion.button>
      ))}
    </div>
  );
}
