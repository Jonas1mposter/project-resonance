import { useState, useEffect } from 'react';
import { Settings, Zap, ShieldCheck, Loader2 } from 'lucide-react';
import { ASRSettings, DEFAULT_ASR_SETTINGS } from '@/types';

interface ASRSettingsPanelProps {
  settings: ASRSettings;
  onUpdate: (settings: ASRSettings) => void;
}

type ServiceStatus = 'checking' | 'online' | 'offline';

export default function ASRSettingsPanel({ settings, onUpdate }: ASRSettingsPanelProps) {
  const [status, setStatus] = useState<ServiceStatus>('checking');

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      setStatus('checking');
      try {
        const res = await fetch('/api/whisper-asr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ping: true }),
        });

        setStatus(res.ok ? 'online' : 'offline');
      } catch {
        if (!cancelled) setStatus('offline');
      }
    };
    check();
    return () => { cancelled = true; };
  }, []);

  const statusConfig = {
    checking: { label: '检测中…', icon: Loader2, className: 'text-muted-foreground bg-muted' },
    online:   { label: '已连接',  icon: Zap,     className: 'text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-900/30' },
    offline:  { label: '待部署',  icon: Zap,     className: 'text-yellow-700 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30' },
  }[status];

  const StatusIcon = statusConfig.icon;

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-primary" aria-hidden="true" />
          <h3 className="font-semibold text-foreground">语音识别配置</h3>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusConfig.className}`}>
          <StatusIcon className={`h-3 w-3 ${status === 'checking' ? 'animate-spin' : ''}`} aria-hidden="true" />
          本地 Whisper（{statusConfig.label}）
        </span>
      </div>

      <div className="flex items-center gap-2 rounded-lg bg-muted/40 p-3">
        <ShieldCheck className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
        <p className="text-xs text-muted-foreground">
          ASR 将使用本地部署的 Whisper 模型，通过后端函数代理转发请求
        </p>
      </div>

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
