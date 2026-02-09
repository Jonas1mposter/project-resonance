import { useState } from 'react';
import { Eye, EyeOff, Globe, Key, Settings, Zap } from 'lucide-react';
import { ASRSettings, DEFAULT_ASR_SETTINGS } from '@/types';
import { Input } from '@/components/ui/input';

interface ASRSettingsPanelProps {
  settings: ASRSettings;
  onUpdate: (settings: ASRSettings) => void;
}

export default function ASRSettingsPanel({ settings, onUpdate }: ASRSettingsPanelProps) {
  const [showKeys, setShowKeys] = useState(false);

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

      {/* API Configuration - only show when not in mock mode */}
      {!settings.mockMode && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <Key className="h-3.5 w-3.5" aria-hidden="true" />
              API 凭证
            </span>
            <button
              onClick={() => setShowKeys(!showKeys)}
              className="a11y-target inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showKeys ? '隐藏密钥' : '显示密钥'}
            >
              {showKeys ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showKeys ? '隐藏' : '显示'}
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor="asr-app-key" className="text-xs font-medium text-muted-foreground block mb-1">
                App Key (X-Api-App-Key)
              </label>
              <Input
                id="asr-app-key"
                type={showKeys ? 'text' : 'password'}
                value={settings.appKey}
                onChange={(e) => update('appKey', e.target.value)}
                placeholder="控制台获取的 APP ID"
                className="a11y-target"
              />
            </div>

            <div>
              <label htmlFor="asr-access-key" className="text-xs font-medium text-muted-foreground block mb-1">
                Access Key (X-Api-Access-Key)
              </label>
              <Input
                id="asr-access-key"
                type={showKeys ? 'text' : 'password'}
                value={settings.accessKey}
                onChange={(e) => update('accessKey', e.target.value)}
                placeholder="控制台获取的 Access Key"
                className="a11y-target"
              />
            </div>

            <div>
              <label htmlFor="asr-resource-id" className="text-xs font-medium text-muted-foreground block mb-1">
                Resource ID (X-Api-Resource-Id)
              </label>
              <Input
                id="asr-resource-id"
                type="text"
                value={settings.resourceId}
                onChange={(e) => update('resourceId', e.target.value)}
                placeholder="volc.bigasr.sauc.duration"
                className="a11y-target"
              />
            </div>
          </div>

          <div>
            <label htmlFor="asr-proxy-url" className="text-xs font-medium text-muted-foreground block mb-1 flex items-center gap-1">
              <Globe className="h-3 w-3" aria-hidden="true" />
              代理地址（可选）
            </label>
            <Input
              id="asr-proxy-url"
              type="text"
              value={settings.proxyUrl}
              onChange={(e) => update('proxyUrl', e.target.value)}
              placeholder="wss://your-proxy.example.com/asr"
              className="a11y-target"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              浏览器无法直接设置 WebSocket 自定义头，需通过代理服务转发鉴权请求
            </p>
          </div>
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
