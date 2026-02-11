
-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Auth users can upload audio" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can read audio" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can delete audio" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can insert recordings" ON public.dysarthria_recordings;

-- Allow anyone to upload to dysarthria-audio bucket
CREATE POLICY "Anyone can upload audio" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'dysarthria-audio');

-- Allow anyone to read from dysarthria-audio bucket
CREATE POLICY "Anyone can read audio" ON storage.objects
  FOR SELECT USING (bucket_id = 'dysarthria-audio');

-- Allow anyone to delete from dysarthria-audio bucket
CREATE POLICY "Anyone can delete audio" ON storage.objects
  FOR DELETE USING (bucket_id = 'dysarthria-audio');

-- Allow anyone to insert recording metadata
CREATE POLICY "Anyone can insert recordings" ON public.dysarthria_recordings
  FOR INSERT WITH CHECK (true);
