-- =============================================================================
-- HSK 1 Digital Flashcards — Storage bucket + RLS for signed URLs (run once)
-- Objects: success_ones/HSK1-*.mp4 (must match src/data/hsk1Words.ts)
--
-- Prefer: setup_storage_private_buckets_all.sql (HSK_1 + Chinese Characters 1 together).
-- SELECT for `anon` + `authenticated` keeps createSignedUrl stable for all buyers/devices.
--
-- Deck row in `public.decks` should use a name that matches the Library catalog, e.g.
--   name = 'HSK 1 Digital Flashcards'
-- and id matching Shopify / activation_codes (see supabase/functions/shopify-webhook SKU_TO_DECK.hsk1).
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('HSK_1', 'HSK_1', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
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
