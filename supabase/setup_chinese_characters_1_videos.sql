-- =============================================================================
-- Chinese Characters 1 — Storage bucket + RLS for signed URLs (run once)
-- Paste into Supabase → SQL Editor → Run.
--
-- After this:
-- 1. Upload MP4s to the bucket with object keys EXACTLY matching video_storage_path
--    in src/data/words.ts (e.g. M-dad-01.mp4 at bucket root, no extra folders).
-- 2. Set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in .env.local and in your host’s
--    build env, then rebuild / redeploy.
-- =============================================================================

-- Private bucket (id must match code default or VITE_CHINESE_CHARACTERS_1_VIDEO_BUCKET)
INSERT INTO storage.buckets (id, name, public)
VALUES ('chinese character 1 _videos', 'chinese character 1 _videos', false)
ON CONFLICT (id) DO NOTHING;

-- createSignedUrl requires SELECT on storage.objects. JWT role is "anon" when signed out
-- and "authenticated" when signed in — both need a policy or logged-in users can fail.
-- (No DROP POLICY — avoids Supabase “destructive query” warnings; safe to re-run.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'chinese_characters_1_videos_anon_select_for_signed_urls'
  ) THEN
    CREATE POLICY "chinese_characters_1_videos_anon_select_for_signed_urls"
    ON storage.objects
    FOR SELECT
    TO anon
    USING (bucket_id = 'chinese character 1 _videos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'chinese_characters_1_videos_authenticated_select_for_signed_urls'
  ) THEN
    CREATE POLICY "chinese_characters_1_videos_authenticated_select_for_signed_urls"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (bucket_id = 'chinese character 1 _videos');
  END IF;
END $$;
