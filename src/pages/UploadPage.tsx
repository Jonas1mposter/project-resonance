import { useState, useRef, useCallback } from 'react';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, X, FileAudio, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CATEGORIES } from '@/types';

interface FileEntry {
  file: File;
  label: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}

export default function UploadPage() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [speakerId, setSpeakerId] = useState('');
  const [category, setCategory] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFilesSelected = useCallback((selected: FileList | null) => {
    if (!selected) return;
    const newEntries: FileEntry[] = Array.from(selected)
      .filter((f) => f.type.startsWith('audio/') || f.name.match(/\.(wav|mp3|webm|ogg|m4a|flac|aac)$/i))
      .map((f) => ({
        file: f,
        label: f.name.replace(/\.[^.]+$/, ''),
        status: 'pending' as const,
      }));

    if (newEntries.length === 0) {
      toast.error('请选择音频文件（WAV、MP3、WebM 等）');
      return;
    }
    setFiles((prev) => [...prev, ...newEntries]);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      handleFilesSelected(e.dataTransfer.files);
    },
    [handleFilesSelected]
  );

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const updateLabel = (index: number, label: string) => {
    setFiles((prev) => prev.map((f, i) => (i === index ? { ...f, label } : f)));
  };

  const uploadAll = async () => {
    if (files.length === 0) return;
    setIsUploading(true);

    for (let i = 0; i < files.length; i++) {
      if (files[i].status === 'done') continue;

      setFiles((prev) =>
        prev.map((f, idx) => (idx === i ? { ...f, status: 'uploading' } : f))
      );

      try {
        const file = files[i].file;
        const ext = file.name.split('.').pop() || 'wav';
        const storagePath = `${speakerId || 'unknown'}/${Date.now()}_${i}.${ext}`;

        const { error: storageError } = await supabase.storage
          .from('dysarthria-audio')
          .upload(storagePath, file);

        if (storageError) throw storageError;

        const { error: dbError } = await supabase.from('dysarthria_recordings').insert({
          file_name: file.name,
          storage_path: storagePath,
          label: files[i].label || null,
          category: category || null,
          speaker_id: speakerId || null,
        });

        if (dbError) throw dbError;

        setFiles((prev) =>
          prev.map((f, idx) => (idx === i ? { ...f, status: 'done' } : f))
        );
      } catch (err: any) {
        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === i ? { ...f, status: 'error', error: err.message || '上传失败' } : f
          )
        );
      }
    }

    setIsUploading(false);
    const doneCount = files.filter((f) => f.status !== 'error').length;
    if (doneCount > 0) toast.success(`成功上传 ${doneCount} 个文件`);
  };

  const doneCount = files.filter((f) => f.status === 'done').length;
  const progress = files.length > 0 ? (doneCount / files.length) * 100 : 0;

  return (
    <Layout>
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-foreground">构音数据上传</h2>
          <p className="text-sm text-muted-foreground mt-1">
            上传构音障碍语音录音，用于后续模型训练与特征匹配
          </p>
        </div>

        {/* Metadata */}
        <Card className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="speaker">说话人 ID</Label>
              <Input
                id="speaker"
                placeholder="如：patient_01"
                value={speakerId}
                onChange={(e) => setSpeakerId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">分类</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="category">
                  <SelectValue placeholder="选择分类" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/30 p-10 transition-colors hover:border-primary/50 hover:bg-muted/50"
          role="button"
          aria-label="点击或拖拽上传音频文件"
        >
          <Upload className="h-8 w-8 text-muted-foreground" />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">点击选择或拖拽音频文件</p>
            <p className="text-xs text-muted-foreground mt-1">支持 WAV、MP3、WebM、OGG、M4A、FLAC</p>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="audio/*,.wav,.mp3,.webm,.ogg,.m4a,.flac,.aac"
            className="hidden"
            onChange={(e) => handleFilesSelected(e.target.files)}
          />
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">
                已选择 {files.length} 个文件
                {doneCount > 0 && (
                  <span className="text-muted-foreground ml-2">（已上传 {doneCount}）</span>
                )}
              </p>
              {!isUploading && (
                <Button variant="ghost" size="sm" onClick={() => setFiles([])}>
                  清空
                </Button>
              )}
            </div>

            {isUploading && <Progress value={progress} className="h-2" />}

            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {files.map((entry, i) => (
                <Card key={i} className="flex items-center gap-3 p-3">
                  <div className="shrink-0">
                    {entry.status === 'done' ? (
                      <CheckCircle2 className="h-5 w-5 text-[hsl(var(--success))]" />
                    ) : entry.status === 'error' ? (
                      <AlertCircle className="h-5 w-5 text-destructive" />
                    ) : entry.status === 'uploading' ? (
                      <Loader2 className="h-5 w-5 text-primary animate-spin" />
                    ) : (
                      <FileAudio className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate text-foreground">{entry.file.name}</p>
                    {entry.status === 'pending' && (
                      <Input
                        value={entry.label}
                        onChange={(e) => updateLabel(i, e.target.value)}
                        placeholder="文字标注（可选）"
                        className="mt-1 h-7 text-xs"
                      />
                    )}
                    {entry.error && (
                      <p className="text-xs text-destructive mt-1">{entry.error}</p>
                    )}
                  </div>
                  {entry.status === 'pending' && !isUploading && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 h-8 w-8"
                      onClick={() => removeFile(i)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </Card>
              ))}
            </div>

            <Button
              onClick={uploadAll}
              disabled={isUploading || files.every((f) => f.status === 'done')}
              className="w-full"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  上传中...
                </>
              ) : (
                `上传全部（${files.filter((f) => f.status === 'pending').length} 个待上传）`
              )}
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
