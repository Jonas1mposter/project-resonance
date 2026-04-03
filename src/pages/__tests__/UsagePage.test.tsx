import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import UsagePage from '../UsagePage';

vi.mock('@/hooks/useAudioRecorder', () => ({
  useAudioRecorder: () => ({
    isRecording: false,
    duration: 0,
    startRecording: vi.fn(),
    stopRecording: vi.fn().mockResolvedValue(null),
    error: null,
    audioLevel: 0,
  }),
}));

vi.mock('@/hooks/useWhisperASR', () => ({
  useWhisperASR: () => ({
    finalText: '',
    isProcessing: false,
    error: null,
    transcribe: vi.fn().mockResolvedValue(null),
    reset: vi.fn(),
  }),
}));

vi.mock('@/hooks/useWechatBridge', () => ({
  useWechatBridge: () => ({
    isWechat: false,
    startNativeRecording: vi.fn(),
    transcript: '',
    clearTranscript: vi.fn(),
  }),
  getWechatDebugInfo: () => ({}),
}));

vi.mock('@/hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: vi.fn(),
}));

vi.mock('@/hooks/useAccessibility', () => ({
  useAccessibility: () => ({ isMotionReduced: true }),
}));

vi.mock('framer-motion', () => {
  const forward = (tag: string) => {
    const Comp = ({ children, ...props }: any) => {
      const safe: Record<string, any> = {};
      for (const [k, v] of Object.entries(props)) {
        if (!['initial', 'animate', 'transition', 'whileTap', 'exit'].includes(k)) {
          safe[k] = v;
        }
      }
      const El = tag as any;
      return <El {...safe}>{children}</El>;
    };
    return Comp;
  };
  return {
    motion: { div: forward('div'), button: forward('button'), span: forward('span'), p: forward('p') },
  };
});

describe('UsagePage', () => {
  const defaultProps = {
    onSpeak: vi.fn().mockResolvedValue(undefined),
    onStop: vi.fn(),
    isSpeaking: false,
    hasPromptAudio: false,
    ttsError: null as string | null,
    onSetPromptAudio: vi.fn(),
    onClearPromptAudio: vi.fn(),
  };

  beforeEach(() => { vi.clearAllMocks(); });

  it('renders idle state with record button', () => {
    const { getByText } = render(<UsagePage {...defaultProps} />);
    expect(getByText('语音识别')).toBeInTheDocument();
    expect(getByText('开始录音')).toBeInTheDocument();
  });

  it('shows "存音色" step when no prompt audio', () => {
    const { getByText } = render(<UsagePage {...defaultProps} />);
    expect(getByText('存音色')).toBeInTheDocument();
    expect(getByText('朗读')).toBeInTheDocument();
  });

  it('shows "✓ 音色" when prompt audio exists', () => {
    const { getByText } = render(<UsagePage {...defaultProps} hasPromptAudio={true} />);
    expect(getByText('✓ 音色')).toBeInTheDocument();
  });

  it('does NOT auto-speak on mount', () => {
    render(<UsagePage {...defaultProps} />);
    expect(defaultProps.onSpeak).not.toHaveBeenCalled();
  });

  it('shows error when ttsError is set', () => {
    const { getByText } = render(<UsagePage {...defaultProps} ttsError="TTS 播放失败" />);
    expect(getByText('TTS 播放失败')).toBeInTheDocument();
  });
});
