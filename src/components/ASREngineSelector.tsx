import { Sparkles, Cpu, Cloud, Globe } from 'lucide-react';
import type { ASREnginePreference } from '@/hooks/useASREnginePreference';

interface ASREngineSelectorProps {
  value: ASREnginePreference;
  onChange: (next: ASREnginePreference) => void;
  className?: string;
}

const OPTIONS: Array<{
  key: ASREnginePreference;
  label: string;
  hint: string;
  Icon: typeof Sparkles;
}> = [
  { key: 'auto', label: '智能', hint: '三层自动回退（推荐）', Icon: Sparkles },
  { key: 'whisper', label: 'Whisper', hint: '只用自建主路', Icon: Cpu },
  { key: 'gemini', label: 'Gemini', hint: '只用云端模型', Icon: Cloud },
  { key: 'browser', label: '浏览器', hint: '只用本机引擎', Icon: Globe },
];

/**
 * Compact 4-way segmented control letting the user pick which ASR engine
 * to use. 'auto' runs the full fallback chain, the others force a single
 * engine and never fall back (helpful for debugging / network preference).
 */
export default function ASREngineSelector({
  value,
  onChange,
  className = '',
}: ASREngineSelectorProps) {
  return (
    <div
      className={`flex items-center gap-1 rounded-xl border border-border/60 bg-muted/30 p-1 ${className}`}
      role="radiogroup"
      aria-label="选择语音识别引擎"
    >
      {OPTIONS.map((opt) => {
        const Icon = opt.Icon;
        const active = value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.key)}
            title={opt.hint}
            className={`a11y-target flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-all ${
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="whitespace-nowrap">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
