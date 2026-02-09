import { useAccessibility, DEFAULT_A11Y } from '@/hooks/useAccessibility';
import { Eye, Zap, Type, Hand, Focus, RotateCcw } from 'lucide-react';

const FONT_SCALE_OPTIONS = [
  { value: 0.875, label: '较小' },
  { value: 1, label: '默认' },
  { value: 1.15, label: '大' },
  { value: 1.3, label: '较大' },
  { value: 1.5, label: '最大' },
];

const MOTION_OPTIONS = [
  { value: 'system' as const, label: '跟随系统' },
  { value: 'off' as const, label: '开启动画' },
  { value: 'on' as const, label: '关闭动画' },
];

const CONTRAST_OPTIONS = [
  { value: 'system' as const, label: '跟随系统' },
  { value: 'off' as const, label: '标准对比度' },
  { value: 'on' as const, label: '增强对比度' },
];

export default function AccessibilitySettings() {
  const { settings, update, reset, isMotionReduced, isHighContrast } = useAccessibility();

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Eye className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">辅助功能</h3>
            <p className="text-xs text-muted-foreground">参照 Apple Accessibility 标准</p>
          </div>
        </div>
      </div>

      {/* Font Scale - Dynamic Type */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Type className="h-4 w-4 text-muted-foreground" />
          <label className="text-sm font-medium text-foreground">字体大小</label>
          <span className="text-xs text-muted-foreground ml-auto">
            {FONT_SCALE_OPTIONS.find((o) => o.value === settings.fontScale)?.label || `${Math.round(settings.fontScale * 100)}%`}
          </span>
        </div>
        <div className="flex gap-2">
          {FONT_SCALE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => update('fontScale', opt.value)}
              className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors a11y-target ${
                settings.fontScale === opt.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
              }`}
              aria-pressed={settings.fontScale === opt.value}
              aria-label={`字体大小: ${opt.label}`}
            >
              <span style={{ fontSize: `${opt.value * 0.85}rem` }}>文</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          类似 iOS「动态字体」功能，调整全局文字大小
        </p>
      </div>

      {/* Reduce Motion */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-muted-foreground" />
          <label className="text-sm font-medium text-foreground">减弱动态效果</label>
          <span className="text-xs text-muted-foreground ml-auto">
            {isMotionReduced ? '已开启' : '未开启'}
          </span>
        </div>
        <div className="flex gap-2">
          {MOTION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => update('reduceMotion', opt.value)}
              className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors a11y-target ${
                settings.reduceMotion === opt.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
              }`}
              aria-pressed={settings.reduceMotion === opt.value}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          类似 iOS「减弱动态效果」，减少页面切换和按钮动画
        </p>
      </div>

      {/* High Contrast */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-muted-foreground" />
          <label className="text-sm font-medium text-foreground">增强对比度</label>
          <span className="text-xs text-muted-foreground ml-auto">
            {isHighContrast ? '已开启' : '未开启'}
          </span>
        </div>
        <div className="flex gap-2">
          {CONTRAST_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => update('highContrast', opt.value)}
              className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors a11y-target ${
                settings.highContrast === opt.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
              }`}
              aria-pressed={settings.highContrast === opt.value}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          类似 iOS「增强对比度」，加深文字和边框颜色
        </p>
      </div>

      {/* Always Show Focus */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Focus className="h-4 w-4 text-muted-foreground" />
          <div>
            <label className="text-sm font-medium text-foreground">始终显示焦点</label>
            <p className="text-xs text-muted-foreground">点击时也显示焦点环</p>
          </div>
        </div>
        <button
          onClick={() => update('alwaysShowFocus', !settings.alwaysShowFocus)}
          className={`relative h-8 w-14 rounded-full transition-colors a11y-target ${
            settings.alwaysShowFocus ? 'bg-primary' : 'bg-muted'
          }`}
          role="switch"
          aria-checked={settings.alwaysShowFocus}
          aria-label="始终显示焦点"
        >
          <span
            className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${
              settings.alwaysShowFocus ? 'translate-x-7' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Large Touch Targets */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Hand className="h-4 w-4 text-muted-foreground" />
          <div>
            <label className="text-sm font-medium text-foreground">大号点击区域</label>
            <p className="text-xs text-muted-foreground">增大按钮和交互元素尺寸</p>
          </div>
        </div>
        <button
          onClick={() => update('largeTouchTargets', !settings.largeTouchTargets)}
          className={`relative h-8 w-14 rounded-full transition-colors a11y-target ${
            settings.largeTouchTargets ? 'bg-primary' : 'bg-muted'
          }`}
          role="switch"
          aria-checked={settings.largeTouchTargets}
          aria-label="大号点击区域"
        >
          <span
            className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${
              settings.largeTouchTargets ? 'translate-x-7' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Reset */}
      <button
        onClick={reset}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-border py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors a11y-target"
        aria-label="恢复辅助功能默认设置"
      >
        <RotateCcw className="h-4 w-4" />
        恢复辅助功能默认设置
      </button>
    </div>
  );
}
