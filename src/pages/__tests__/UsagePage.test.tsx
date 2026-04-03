import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import UsagePage from '../UsagePage';

// Mock hooks
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

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...filterProps(props)}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...filterProps(props)}>{children}</button>,
    span: ({ children, ...props }: any) => <span {...filterProps(props)}>{children}</span>,
    p: ({ children, ...props }: any) => <p {...filterProps(props)}>{children}</p>,
  },
}));

function filterProps(props: Record<string, any>) {
  const filtered: Record<string, any> = {};
  for (const [k, v] of Object.entries(props)) {
    if (!['initial', 'animate', 'transition', 'whileTap', 'exit'].includes(k)) {
      filtered[k] = v;
    }
  }
  return filtered;
}

describe('UsagePage', () => {
  const defaultProps = {
    onSpeak: vi.fn().mockResolvedValue(undefined),
    onStop: vi.fn(),
    isSpeaking: false,
    hasPromptAudio: false,
    ttsError: null,
    onSetPromptAudio: vi.fn(),
    onClearPromptAudio: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders idle state with record button', () => {
    render(<UsagePage {...defaultProps} />);
    expect(screen.getByText('语音识别')).toBeInTheDocument();
    expect(screen.getByText('开始录音')).toBeInTheDocument();
  });

  it('shows flow steps including "存音色" when no prompt audio', () => {
    render(<UsagePage {...defaultProps} />);
    expect(screen.getByText('存音色')).toBeInTheDocument();
    expect(screen.getByText('朗读')).toBeInTheDocument();
  });

  it('shows "✓ 音色" when prompt audio exists', () => {
    render(<UsagePage {...defaultProps} hasPromptAudio={true} />);
    expect(screen.getByText('✓ 音色')).toBeInTheDocument();
  });

  it('does NOT auto-speak (no speaking state on mount)', () => {
    render(<UsagePage {...defaultProps} />);
    expect(defaultProps.onSpeak).not.toHaveBeenCalled();
  });
});
