
-- Create storage bucket for dysarthria audio files
INSERT INTO storage.buckets (id, name, public) VALUES ('dysarthria-audio', 'dysarthria-audio', false);

-- Allow authenticated users to upload
CREATE POLICY "Auth users can upload audio" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'dysarthria-audio' AND auth.role() = 'authenticated');

-- Allow authenticated users to read
CREATE POLICY "Auth users can read audio" ON storage.objects
  FOR SELECT USING (bucket_id = 'dysarthria-audio' AND auth.role() = 'authenticated');

-- Allow authenticated users to delete their uploads
CREATE POLICY "Auth users can delete audio" ON storage.objects
  FOR DELETE USING (bucket_id = 'dysarthria-audio' AND auth.role() = 'authenticated');

-- Metadata table to track uploaded audio files
CREATE TABLE public.dysarthria_recordings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  label TEXT,              -- 对应的文字标注（可后续补充）
  category TEXT,           -- 分类（如短语类别）
  duration_ms INTEGER,     -- 音频时长
  speaker_id TEXT,         -- 说话人标识
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dysarthria_recordings ENABLE ROW LEVEL SECURITY;

-- Public read for now (no auth required) since this is a shared dataset
CREATE POLICY "Anyone can read recordings metadata" ON public.dysarthria_recordings
  FOR SELECT USING (true);

-- Only authenticated users can insert
CREATE POLICY "Auth users can insert recordings" ON public.dysarthria_recordings
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
