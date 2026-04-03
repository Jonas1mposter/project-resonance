import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import ASRStreamingResult from '../../components/ASRStreamingResult';

vi.mock('@/hooks/useAccessibility', () => ({
  useAccessibility: () => ({ isMotionReduced: true }),
}));

vi.mock('framer-motion', () => {
  const forward = (tag: string) => {
    const Comp = ({ children, ...props }: any) => {
      const safe: Record<string, any> = {};
      for (const [k, v] of Object.entries(props)) {
        if (!['initial', 'animate', 'transition', 'whileTap', 'exit'].includes(k)) safe[k] = v;
      }
      const El = tag as any;
      return <El {...safe}>{children}</El>;
    };
    return Comp;
  };
  return { motion: { div: forward('div'), button: forward('button'), span: forward('span'), p: forward('p') } };
});

describe('ASRStreamingResult', () => {
  const base = {
    partialText: '',
    finalText: '你好世界',
    onSpeak: vi.fn().mockResolvedValue(undefined),
    onStop: vi.fn(),
    isSpeaking: false,
  };

  beforeEach(() => { vi.clearAllMocks(); });

  it('shows "朗读" and "存为音色" when no prompt audio', () => {
    const { getByText } = render(
      <ASRStreamingResult {...base} hasPromptAudio={false} onSaveVoice={vi.fn()} onClearVoice={vi.fn()} />
    );
    expect(getByText('朗读')).toBeInTheDocument();
    expect(getByText('存为音色')).toBeInTheDocument();
    expect(getByText('复制')).toBeInTheDocument();
  });

  it('hides "存为音色" when prompt audio exists', () => {
    const { queryByText, getByText } = render(
      <ASRStreamingResult {...base} hasPromptAudio={true} onSaveVoice={vi.fn()} onClearVoice={vi.fn()} />
    );
    expect(queryByText('存为音色')).not.toBeInTheDocument();
    expect(getByText('音色已保存 · 朗读将使用您的声音')).toBeInTheDocument();
    expect(getByText('朗读')).toBeInTheDocument();
  });

  it('calls onSpeak when "朗读" is clicked', async () => {
    const onSpeak = vi.fn();
    const { getByText } = render(
      <ASRStreamingResult {...base} onSpeak={onSpeak} hasPromptAudio={false} onSaveVoice={vi.fn()} onClearVoice={vi.fn()} />
    );
    await userEvent.click(getByText('朗读'));
    expect(onSpeak).toHaveBeenCalledWith('你好世界');
  });

  it('calls onStop when speaking and "停止" is clicked', async () => {
    const onStop = vi.fn();
    const { getByText } = render(
      <ASRStreamingResult {...base} isSpeaking={true} onStop={onStop} hasPromptAudio={false} onSaveVoice={vi.fn()} onClearVoice={vi.fn()} />
    );
    await userEvent.click(getByText('停止'));
    expect(onStop).toHaveBeenCalled();
  });

  it('calls onSaveVoice when "存为音色" is clicked', async () => {
    const onSave = vi.fn();
    const { getByText } = render(
      <ASRStreamingResult {...base} hasPromptAudio={false} onSaveVoice={onSave} onClearVoice={vi.fn()} />
    );
    await userEvent.click(getByText('存为音色'));
    expect(onSave).toHaveBeenCalled();
  });
});
