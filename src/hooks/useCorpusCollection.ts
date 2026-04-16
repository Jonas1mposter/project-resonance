import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Silently collects speech corpus (audio + transcript) to the database
 * after each successful ASR recognition.
 */
export function useCorpusCollection() {
  const collect = useCallback(async (audioBlob: Blob, transcript: string, durationSec: number) => {
    try {
      const ts = Date.now();
      const ext = audioBlob.type.includes('webm') ? 'webm' : audioBlob.type.includes('mp3') ? 'mp3' : 'wav';
      const fileName = `corpus_${ts}.${ext}`;
      const storagePath = `corpus/${fileName}`;

      // Upload audio to storage
      const { error: uploadError } = await supabase.storage
        .from('dysarthria-audio')
        .upload(storagePath, audioBlob, {
          contentType: audioBlob.type || 'audio/webm',
          upsert: false,
        });

      if (uploadError) {
        console.warn('[Corpus] Upload failed:', uploadError.message);
        return;
      }

      // Insert metadata record
      const { error: insertError } = await supabase
        .from('dysarthria_recordings')
        .insert({
          file_name: fileName,
          storage_path: storagePath,
          label: transcript,
          category: 'usage-collected',
          duration_ms: Math.round(durationSec * 1000),
          metadata: {
            source: 'auto-collect',
            user_agent: navigator.userAgent,
            collected_at: new Date().toISOString(),
          },
        });

      if (insertError) {
        console.warn('[Corpus] Insert failed:', insertError.message);
        return;
      }

      console.log('[Corpus] Collected:', fileName, transcript.slice(0, 30));
    } catch (err) {
      console.warn('[Corpus] Collection error:', err);
    }
  }, []);

  return { collect };
}
