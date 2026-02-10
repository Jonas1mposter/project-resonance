import { Settings, Zap, ShieldCheck } from 'lucide-react';
import { ASRSettings, DEFAULT_ASR_SETTINGS } from '@/types';

interface ASRSettingsPanelProps {
  settings: ASRSettings;
  onUpdate: (settings: ASRSettings) => void;
}

export default function ASRSettingsPanel({ settings, onUpdate }: ASRSettingsPanelProps) {
  const update = (key: keyof ASRSettings, value: string | boolean) => {
    onUpdate({ ...settings, [key]: value });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-primary" aria-hidden="true" />
          <h3 className="font-semibold text-foreground">豆包 ASR 配置</h3>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
          settings.mockMode 
            ? 'bg-warning/15 text-warning-foreground' 
            : 'bg-success/15 text-success'
        }`}>
          <Zap className="h-3 w-3" aria-hidden="true" />
          {settings.mockMode ? '模拟模式' : '已连接'}
        </span>
      </div>

      {/* Mock Mode Toggle */}
      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <div>
          <p className="text-sm font-medium text-foreground">模拟模式</p>
          <p className="text-xs text-muted-foreground">
            {settings.mockMode ? '使用模拟数据，无需 API Key' : '使用真实 API 进行语音识别'}
          </p>
        </div>
        <button
          role="switch"
          aria-checked={settings.mockMode}
          onClick={() => update('mockMode', !settings.mockMode)}
          className={`a11y-target relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${
            settings.mockMode ? 'bg-primary' : 'bg-muted'
          }`}
          aria-label={`模拟模式 ${settings.mockMode ? '开启' : '关闭'}`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform ${
              settings.mockMode ? 'translate-x-5' : 'translate-x-0.5'
            }`}
            aria-hidden="true"
          />
        </button>
      </div>

      {/* API Status - show when not in mock mode */}
      {!settings.mockMode && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3">
          <ShieldCheck className="h-4 w-4 text-success shrink-0" aria-hidden="true" />
          <p className="text-xs text-muted-foreground">
            API 密钥已在后端安全配置，无需手动输入
          </p>
        </div>
      )}

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
