import { AppSettings, DEFAULT_SETTINGS } from '@/types';
import { useTTS } from '@/hooks/useTTS';
import AccessibilitySettings from '@/components/AccessibilitySettings';

interface SettingsPageProps {
  settings: AppSettings;
  onUpdate: (settings: AppSettings) => void;
}

export default function SettingsPage({ settings, onUpdate }: SettingsPageProps) {
  const { voices, hasChineseVoice } = useTTS();

  const update = (key: keyof AppSettings, value: number | string) => {
    onUpdate({ ...settings, [key]: value });
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">设置</h2>
        <p className="mt-1 text-muted-foreground">调整识别、语音与辅助功能参数</p>
      </div>

      {/* Accessibility Settings — prominent placement like Apple */}
      <AccessibilitySettings />

      {/* Recognition Settings */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-5">
        <h3 className="font-semibold text-foreground">识别参数</h3>

        <div>
          <div className="flex justify-between mb-1.5">
            <label htmlFor="topK" className="text-sm text-foreground">Top-K 候选数</label>
            <span className="text-sm text-muted-foreground" aria-live="polite">{settings.topK}</span>
          </div>
          <input
            id="topK"
            type="range"
            min={1}
            max={5}
            value={settings.topK}
            onChange={(e) => update('topK', Number(e.target.value))}
            className="w-full accent-primary"
            aria-label={`Top-K 候选数: ${settings.topK}`}
          />
        </div>

        <div>
          <div className="flex justify-between mb-1.5">
            <label htmlFor="absThreshold" className="text-sm text-foreground">置信度阈值</label>
            <span className="text-sm text-muted-foreground" aria-live="polite">{settings.absThreshold.toFixed(2)}</span>
          </div>
          <input
            id="absThreshold"
            type="range"
            min={0.1}
            max={0.95}
            step={0.05}
            value={settings.absThreshold}
            onChange={(e) => update('absThreshold', Number(e.target.value))}
            className="w-full accent-primary"
            aria-label={`置信度阈值: ${settings.absThreshold.toFixed(2)}`}
          />
        </div>

        <div>
          <div className="flex justify-between mb-1.5">
            <label htmlFor="maxTemplates" className="text-sm text-foreground">每条最大模板数</label>
            <span className="text-sm text-muted-foreground" aria-live="polite">{settings.maxTemplatesPerPhrase}</span>
          </div>
          <input
            id="maxTemplates"
            type="range"
            min={2}
            max={20}
            value={settings.maxTemplatesPerPhrase}
            onChange={(e) => update('maxTemplatesPerPhrase', Number(e.target.value))}
            className="w-full accent-primary"
            aria-label={`每条最大模板数: ${settings.maxTemplatesPerPhrase}`}
          />
        </div>
      </div>

      {/* TTS Settings */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-5">
        <h3 className="font-semibold text-foreground">语音合成 (TTS)</h3>

        {!hasChineseVoice && (
          <div className="rounded-lg bg-warning/15 p-3 text-sm text-warning-foreground" role="alert">
            ⚠️ 未检测到中文语音包，TTS 可能无法正常工作。请在系统设置中安装中文语音。
          </div>
        )}

        <div>
          <div className="flex justify-between mb-1.5">
            <label htmlFor="ttsRate" className="text-sm text-foreground">语速</label>
            <span className="text-sm text-muted-foreground" aria-live="polite">{settings.ttsRate.toFixed(1)}x</span>
          </div>
          <input
            id="ttsRate"
            type="range"
            min={0.5}
            max={2}
            step={0.1}
            value={settings.ttsRate}
            onChange={(e) => update('ttsRate', Number(e.target.value))}
            className="w-full accent-primary"
            aria-label={`语速: ${settings.ttsRate.toFixed(1)}倍`}
          />
        </div>

        <div>
          <div className="flex justify-between mb-1.5">
            <label htmlFor="ttsVolume" className="text-sm text-foreground">音量</label>
            <span className="text-sm text-muted-foreground" aria-live="polite">{Math.round(settings.ttsVolume * 100)}%</span>
          </div>
          <input
            id="ttsVolume"
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={settings.ttsVolume}
            onChange={(e) => update('ttsVolume', Number(e.target.value))}
            className="w-full accent-primary"
            aria-label={`音量: ${Math.round(settings.ttsVolume * 100)}%`}
          />
        </div>

        <div>
          <div className="flex justify-between mb-1.5">
            <label htmlFor="ttsPitch" className="text-sm text-foreground">音高</label>
            <span className="text-sm text-muted-foreground" aria-live="polite">{settings.ttsPitch.toFixed(1)}</span>
          </div>
          <input
            id="ttsPitch"
            type="range"
            min={0.5}
            max={2}
            step={0.1}
            value={settings.ttsPitch}
            onChange={(e) => update('ttsPitch', Number(e.target.value))}
            className="w-full accent-primary"
            aria-label={`音高: ${settings.ttsPitch.toFixed(1)}`}
          />
        </div>

        {voices.length > 0 && (
          <div>
            <label htmlFor="ttsVoice" className="text-sm text-foreground block mb-1.5">语音</label>
            <select
              id="ttsVoice"
              value={settings.ttsVoice}
              onChange={(e) => update('ttsVoice', e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="选择语音"
            >
              <option value="">自动选择</option>
              {voices
                .filter((v) => v.lang.startsWith('zh'))
                .map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))}
            </select>
          </div>
        )}
      </div>

      {/* Reset */}
      <button
        onClick={() => onUpdate(DEFAULT_SETTINGS)}
        className="w-full rounded-xl border border-border bg-card py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors a11y-target"
        aria-label="恢复默认设置"
      >
        恢复默认设置
      </button>
    </div>
  );
}
