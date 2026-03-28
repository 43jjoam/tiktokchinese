/*
  setup_storage_private_buckets_all.sql

  Private video buckets (Chinese Characters 1 + HSK_1) and RLS for signed URLs.
  Run the whole file in Supabase SQL Editor. Safe to re-run.

  createSignedUrl requires SELECT on storage.objects for roles anon and authenticated.
  Every site visitor uses the same anon key; policies are per bucket, not per purchaser.

  After: upload objects to match words.ts / hsk1Words.ts; set VITE_SUPABASE_* on deploy.

  If signed URL fails: check Storage policies for SELECT on anon; bucket id must match code.
*/

-- Chinese Characters 1 bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('chinese character 1 _videos', 'chinese character 1 _videos', false)
ON CONFLICT (id) DO NOTHING;

-- HSK_1 bucket (HSK 1 deck, success_ones/*)
INSERT INTO storage.buckets (id, name, public)
VALUES ('HSK_1', 'HSK_1', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: SELECT policies for createSignedUrl on private objects
DO $$
BEGIN
  -- Chinese Characters 1 — anon
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

  -- Chinese Characters 1 — authenticated (Supabase Auth users)
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

  -- HSK_1 — anon
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'hsk_1_anon_select_for_signed_urls'
  ) THEN
    CREATE POLICY "hsk_1_anon_select_for_signed_urls"
    ON storage.objects
    FOR SELECT
    TO anon
    USING (bucket_id = 'HSK_1');
  END IF;

  -- HSK_1 — authenticated
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'hsk_1_authenticated_select_for_signed_urls'
  ) THEN
    CREATE POLICY "hsk_1_authenticated_select_for_signed_urls"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (bucket_id = 'HSK_1');
  END IF;
END $$;
