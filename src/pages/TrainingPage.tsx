import { useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Search, Mic, Check, ChevronDown, ChevronUp, Play, Trash2 } from 'lucide-react';
import { Phrase } from '@/types';
import { CATEGORIES } from '@/types';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import AudioRecorderButton from '@/components/AudioRecorderButton';

interface TrainingPageProps {
  phrases: Phrase[];
  onAddRecording: (phraseId: string, blob: Blob, duration: number) => void;
  onDeleteRecording: (phraseId: string, recordingId: string) => void;
}

export default function TrainingPage({ phrases, onAddRecording, onDeleteRecording }: TrainingPageProps) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('全部');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [recordingPhraseId, setRecordingPhraseId] = useState<string | null>(null);
  const { isRecording, duration, startRecording, stopRecording, error, audioLevel } = useAudioRecorder();

  const filteredPhrases = useMemo(() => {
    return phrases.filter((p) => {
      if (!p.enabled) return false;
      if (selectedCategory !== '全部' && p.category !== selectedCategory) return false;
      if (search && !p.text.includes(search)) return false;
      return true;
    });
  }, [phrases, selectedCategory, search]);

  const stats = useMemo(() => {
    const enabled = phrases.filter((p) => p.enabled);
    const trained = enabled.filter((p) => p.recordingCount >= 2);
    return { total: enabled.length, trained: trained.length };
  }, [phrases]);

  const handleStartRecording = useCallback(async (phraseId: string) => {
    setRecordingPhraseId(phraseId);
    await startRecording();
  }, [startRecording]);

  const handleStopRecording = useCallback(async () => {
    const result = await stopRecording();
    if (result && recordingPhraseId) {
      onAddRecording(recordingPhraseId, result.blob, result.duration);
    }
    setRecordingPhraseId(null);
  }, [stopRecording, recordingPhraseId, onAddRecording]);

  const playRecording = useCallback((blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    audio.play();
  }, []);

  // Navigate phrases with arrow keys
  const currentIndex = expandedId ? filteredPhrases.findIndex((p) => p.id === expandedId) : -1;

  const shortcuts = useMemo(
    () => [
      {
        key: ' ',
        label: '录音',
        description: '开始/停止录音',
        handler: () => {
          if (isRecording) {
            handleStopRecording();
          } else if (expandedId) {
            handleStartRecording(expandedId);
          }
        },
        enabled: !!expandedId || isRecording,
      },
      {
        key: 'ArrowDown',
        label: '下一条',
        description: '展开下一条短语',
        handler: () => {
          if (isRecording) return;
          const nextIndex = currentIndex + 1;
          if (nextIndex < filteredPhrases.length) {
            setExpandedId(filteredPhrases[nextIndex].id);
          }
        },
      },
      {
        key: 'ArrowUp',
        label: '上一条',
        description: '展开上一条短语',
        handler: () => {
          if (isRecording) return;
          const prevIndex = currentIndex - 1;
          if (prevIndex >= 0) {
            setExpandedId(filteredPhrases[prevIndex].id);
          }
        },
      },
      {
        key: 'Escape',
        label: '收起',
        description: '收起当前短语',
        handler: () => {
          if (isRecording) return;
          setExpandedId(null);
        },
        enabled: !!expandedId,
      },
    ],
    [expandedId, isRecording, handleStopRecording, handleStartRecording, currentIndex, filteredPhrases]
  );

  useKeyboardShortcuts(shortcuts);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-foreground">训练录音</h2>
        <p className="mt-1 text-muted-foreground">
          为每条短语录制至少 2 遍语音样本 · 按
          <kbd className="kbd-hint mx-1">↑↓</kbd>
          切换短语
        </p>
      </div>

      {/* Progress */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-foreground">训练进度</span>
          <span className="text-sm text-muted-foreground">
            {stats.trained} / {stats.total} 条已达标
          </span>
        </div>
        <div className="h-3 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={stats.trained} aria-valuemax={stats.total}>
          <motion.div
            className="h-full rounded-full bg-success"
            initial={{ width: 0 }}
            animate={{ width: `${stats.total > 0 ? (stats.trained / stats.total) * 100 : 0}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索短语..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-input bg-card py-3 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="搜索短语"
          />
        </div>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="rounded-lg border border-input bg-card px-3 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="筛选分类"
        >
          <option value="全部">全部分类</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          {error}
        </div>
      )}

      {/* Phrase List */}
      <div className="space-y-2" role="list" aria-label="训练短语列表">
        {filteredPhrases.map((phrase, index) => {
          const isExpanded = expandedId === phrase.id;
          const isTrainedEnough = phrase.recordingCount >= 2;
          const isCurrentlyRecording = recordingPhraseId === phrase.id && isRecording;

          return (
            <motion.div
              key={phrase.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index * 0.02, 0.5) }}
              className={`rounded-xl border bg-card overflow-hidden transition-colors ${
                isCurrentlyRecording ? 'border-recording' : isExpanded ? 'border-primary/50' : 'border-border'
              }`}
              role="listitem"
            >
              <button
                onClick={() => setExpandedId(isExpanded ? null : phrase.id)}
                aria-expanded={isExpanded}
                className="a11y-target flex w-full items-center justify-between p-4 text-left"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold ${
                      isTrainedEnough
                        ? 'bg-success/15 text-success'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {isTrainedEnough ? <Check className="h-5 w-5" /> : phrase.recordingCount}
                  </div>
                  <div>
                    <span className="font-medium text-foreground text-base">{phrase.text}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">{phrase.category}</span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className={`text-xs ${isTrainedEnough ? 'text-success' : 'text-muted-foreground'}`}>
                        {phrase.recordingCount} 次录音
                      </span>
                    </div>
                  </div>
                </div>
                {isExpanded ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
              </button>

              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-t border-border px-4 py-4"
                >
                  {/* Record button */}
                  <div className="flex justify-center mb-4">
                    <AudioRecorderButton
                      isRecording={isCurrentlyRecording}
                      duration={duration}
                      audioLevel={audioLevel}
                      onStart={() => handleStartRecording(phrase.id)}
                      onStop={handleStopRecording}
                      size="sm"
                    />
                  </div>

                  {/* Recordings list */}
                  {phrase.recordings.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">已录制的样本：</p>
                      {phrase.recordings.map((rec, i) => (
                        <div
                          key={rec.id}
                          className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2"
                        >
                          <span className="text-sm text-foreground">
                            样本 {i + 1}
                            <span className="ml-2 text-xs text-muted-foreground">
                              {rec.duration.toFixed(1)}s
                            </span>
                          </span>
                          <div className="flex gap-1">
                            <button
                              onClick={() => playRecording(rec.blob)}
                              className="a11y-target rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                              aria-label={`播放样本 ${i + 1}`}
                            >
                              <Play className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => onDeleteRecording(phrase.id, rec.id)}
                              className="a11y-target rounded-md p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              aria-label={`删除样本 ${i + 1}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {!isTrainedEnough && (
                    <p className="mt-3 text-center text-xs text-muted-foreground">
                      还需录制 {2 - phrase.recordingCount} 次才能达标（建议 5 遍以上效果更佳）
                    </p>
                  )}
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </div>

      {filteredPhrases.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          <Mic className="mx-auto mb-3 h-10 w-10 opacity-40" />
          <p>没有找到匹配的短语</p>
        </div>
      )}
    </div>
  );
}
