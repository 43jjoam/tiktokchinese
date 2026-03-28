/*
  Phase 1b — engagement_events + words (PRD v2 subset: likes, saves, share taps; no threads/gifts).
  - Anon: SELECT only on engagement_events and words.
  - Writes: record-engagement Edge Function (service role) only.
  - like/save: at most one row per (type, word_id, device_hash) via partial UNIQUE index.
  - share_tap / share_success: multiple rows per user allowed (no unique on those types).
  - is_deleted: moderation soft-delete; anon SELECT only sees NOT is_deleted. New rows insert is_deleted=false via Edge.

  After apply: run `npm run words:seed-sql` and execute the generated INSERTs in SQL editor, or insert via dashboard.
*/

-- Master word ids for Edge validation (source of truth before app CSV ships)
CREATE TABLE IF NOT EXISTS public.words (
  id text PRIMARY KEY CHECK (char_length(id) <= 100),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS words_active_idx ON public.words (id) WHERE is_active = true;

ALTER TABLE public.words ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "words_select_anon" ON public.words;
CREATE POLICY "words_select_anon" ON public.words FOR SELECT TO anon USING (is_active = true);

-- Optional: authenticated read later
DROP POLICY IF EXISTS "words_select_authenticated" ON public.words;
CREATE POLICY "words_select_authenticated" ON public.words FOR SELECT TO authenticated USING (is_active = true);

CREATE TABLE IF NOT EXISTS public.engagement_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('like', 'save', 'share_tap', 'share_success')),
  word_id text NOT NULL CHECK (char_length(word_id) <= 100),
  clip_key text NOT NULL CHECK (char_length(clip_key) <= 200),
  device_hash text NOT NULL CHECK (char_length(device_hash) >= 8 AND char_length(device_hash) <= 128),
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.engagement_events
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS engagement_events_word_type_idx ON public.engagement_events (word_id, type);

DROP INDEX IF EXISTS engagement_like_save_unique;
CREATE UNIQUE INDEX engagement_like_save_unique
  ON public.engagement_events (type, word_id, device_hash)
  WHERE type IN ('like', 'save');

ALTER TABLE public.engagement_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "engagement_select_anon" ON public.engagement_events;
CREATE POLICY "engagement_select_anon" ON public.engagement_events FOR SELECT TO anon USING (NOT is_deleted);

DROP POLICY IF EXISTS "engagement_select_authenticated" ON public.engagement_events;
CREATE POLICY "engagement_select_authenticated" ON public.engagement_events FOR SELECT TO authenticated USING (NOT is_deleted);

-- Revoke direct writes from anon (defense in depth; RLS already blocks)
REVOKE INSERT, UPDATE, DELETE ON public.engagement_events FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.words FROM anon;
