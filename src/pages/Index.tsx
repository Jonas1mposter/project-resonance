import { useMemo } from 'react';
import { useAppData } from '@/hooks/useAppData';
import { useTTS } from '@/hooks/useTTS';
import UsagePage from './UsagePage';

const Index = () => {
  const {
    phrases,
    settings,
    addRecording,
    recognize,
  } = useAppData();

  const { speak, stop, isSpeaking } = useTTS(
    settings.ttsRate,
    settings.ttsVolume,
    settings.ttsPitch,
    settings.ttsVoice
  );

  const trainedCount = useMemo(
    () => phrases.filter((p) => p.enabled && p.recordingCount >= 2).length,
    [phrases]
  );

  return (
    <UsagePage
      recognize={recognize}
      onFeedback={addRecording}
      trainedCount={trainedCount}
      onSpeak={speak}
      onStop={stop}
      isSpeaking={isSpeaking}
    />
  );
};

export default Index;
