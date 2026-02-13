import { AppSettings, ASRSettings, DEFAULT_SETTINGS } from '@/types';
import { useTTS } from '@/hooks/useTTS';
import AccessibilitySettings from '@/components/AccessibilitySettings';
import AccessibleStepper from '@/components/AccessibleStepper';
import ASRSettingsPanel from '@/components/ASRSettingsPanel';

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
    <section className="max-w-lg mx-auto space-y-5" aria-labelledby="settings-heading">
      <div>
        <h2 id="settings-heading" className="text-xl md:text-2xl font-bold text-foreground">设置</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">调整识别、语音与辅助功能参数</p>
      </div>

      {/* Accessibility Settings — prominent placement like Apple */}
      <AccessibilitySettings />

      {/* ASR Settings */}
      <ASRSettingsPanel
        settings={settings.asr}
        onUpdate={(asr: ASRSettings) => onUpdate({ ...settings, asr })}
      />

      {/* Recognition Settings — now uses AccessibleStepper instead of sliders */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-5">
        <h3 className="font-semibold text-foreground">识别参数</h3>

        <AccessibleStepper
          label="Top-K 候选数"
          value={settings.topK}
          min={1}
          max={5}
          step={1}
          onChange={(v) => update('topK', v)}
          id="topK"
        />

        <AccessibleStepper
          label="置信度阈值"
          value={settings.absThreshold}
          min={0.1}
          max={0.95}
          step={0.05}
          onChange={(v) => update('absThreshold', v)}
          format={(v) => v.toFixed(2)}
          id="absThreshold"
        />

        <AccessibleStepper
          label="每条最大模板数"
          value={settings.maxTemplatesPerPhrase}
          min={2}
          max={20}
          step={1}
          onChange={(v) => update('maxTemplatesPerPhrase', v)}
          id="maxTemplates"
        />
      </div>

      {/* TTS Settings — now uses AccessibleStepper */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-5">
        <h3 className="font-semibold text-foreground">语音合成 (TTS)</h3>

        {!hasChineseVoice && (
          <div className="rounded-lg bg-warning/15 p-3 text-sm text-warning-foreground" role="alert">
            ⚠️ 未检测到中文语音包，TTS 可能无法正常工作。请在系统设置中安装中文语音。
          </div>
        )}

        <AccessibleStepper
          label="语速"
          value={settings.ttsRate}
          min={0.5}
          max={2}
          step={0.1}
          onChange={(v) => update('ttsRate', v)}
          format={(v) => `${v.toFixed(1)}x`}
          id="ttsRate"
        />

        <AccessibleStepper
          label="音量"
          value={settings.ttsVolume}
          min={0}
          max={1}
          step={0.1}
          onChange={(v) => update('ttsVolume', v)}
          format={(v) => `${Math.round(v * 100)}%`}
          id="ttsVolume"
        />

        <AccessibleStepper
          label="音高"
          value={settings.ttsPitch}
          min={0.5}
          max={2}
          step={0.1}
          onChange={(v) => update('ttsPitch', v)}
          format={(v) => v.toFixed(1)}
          id="ttsPitch"
        />

        {voices.length > 0 && (
          <div>
            <label htmlFor="ttsVoice" className="text-sm font-medium text-foreground block mb-1.5">语音</label>
            <select
              id="ttsVoice"
              value={settings.ttsVoice}
              onChange={(e) => update('ttsVoice', e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring a11y-target"
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
    </section>
  );
}
