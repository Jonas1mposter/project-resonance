import { useMemo } from 'react';
import { useAppData } from '@/hooks/useAppData';
import { useStepfunTTS } from '@/hooks/useStepfunTTS';
import UsagePage from './UsagePage';

const Index = () => {
  const {
    phrases,
    settings,
    addRecording,
    recognize,
  } = useAppData();

  const {
    speak,
    stop,
    isSpeaking,
    cloneVoice,
    isCloning,
    voiceId,
    setVoiceId,
    error: ttsError,
  } = useStepfunTTS();

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
      asrSettings={settings.asr}
      voiceId={voiceId}
      isCloning={isCloning}
      ttsError={ttsError}
      onCloneVoice={cloneVoice}
      onClearVoice={() => setVoiceId(null)}
    />
  );
};

export default Index;
