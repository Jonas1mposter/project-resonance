import { Settings, Zap, ShieldCheck } from 'lucide-react';
import { ASRSettings, DEFAULT_ASR_SETTINGS } from '@/types';

interface ASRSettingsPanelProps {
  settings: ASRSettings;
  onUpdate: (settings: ASRSettings) => void;
}

export default function ASRSettingsPanel({ settings, onUpdate }: ASRSettingsPanelProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-primary" aria-hidden="true" />
          <h3 className="font-semibold text-foreground">语音识别配置</h3>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
          <Zap className="h-3 w-3" aria-hidden="true" />
          本地 Whisper（待部署）
        </span>
      </div>

      {/* API Status */}
      <div className="flex items-center gap-2 rounded-lg bg-muted/40 p-3">
        <ShieldCheck className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
        <p className="text-xs text-muted-foreground">
          ASR 将使用本地部署的 Whisper 模型，通过后端函数代理转发请求
        </p>
      </div>

      {/* Reset */}
      <button
        onClick={() => onUpdate(DEFAULT_ASR_SETTINGS)}
        className="w-full rounded-lg border border-border py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors a11y-target"
        aria-label="重置 ASR 设置为默认值"
      >
        重置 ASR 设置
      </button>
    </div>
  );
}
