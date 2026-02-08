import { Routes, Route } from 'react-router-dom';
import { useAppData } from '@/hooks/useAppData';
import { useTTS } from '@/hooks/useTTS';
import { useMemo } from 'react';
import UsagePage from './pages/UsagePage';
import TrainingPage from './pages/TrainingPage';
import PhrasesPage from './pages/PhrasesPage';
import SettingsPage from './pages/SettingsPage';
import DataPage from './pages/DataPage';
import NotFound from './pages/NotFound';

export default function AppRoutes() {
  const {
    phrases,
    settings,
    setSettings,
    addRecording,
    deleteRecording,
    updatePhrase,
    addPhrase,
    deletePhrase,
    clearAllData,
    clearTrainingData,
    exportData,
    importData,
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

  const totalRecordings = useMemo(
    () => phrases.reduce((sum, p) => sum + p.recordingCount, 0),
    [phrases]
  );

  return (
    <Routes>
      <Route
        path="/"
        element={
          <UsagePage
            recognize={recognize}
            onFeedback={addRecording}
            trainedCount={trainedCount}
            onSpeak={speak}
            onStop={stop}
            isSpeaking={isSpeaking}
          />
        }
      />
      <Route
        path="/training"
        element={
          <TrainingPage
            phrases={phrases}
            onAddRecording={addRecording}
            onDeleteRecording={deleteRecording}
          />
        }
      />
      <Route
        path="/phrases"
        element={
          <PhrasesPage
            phrases={phrases}
            onUpdate={updatePhrase}
            onAdd={addPhrase}
            onDelete={deletePhrase}
            onExport={exportData}
            onImport={importData}
          />
        }
      />
      <Route
        path="/settings"
        element={
          <SettingsPage settings={settings} onUpdate={setSettings} />
        }
      />
      <Route
        path="/data"
        element={
          <DataPage
            phraseCount={phrases.length}
            recordingCount={totalRecordings}
            onExport={exportData}
            onImport={importData}
            onClearTraining={clearTrainingData}
            onClearAll={clearAllData}
          />
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
