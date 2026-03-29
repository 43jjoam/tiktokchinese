/*
  Gift v0 + session summaries (ImplRef v1.1 subset).
  - word_metadata: server-side copy of display + storage fields for gift creation (seed from app data).
  - gift_tokens / gift_redemptions: opaque links; all reads/writes via Edge (service role).
  - session_summaries: anonymous telemetry rows inserted only via record-session-summary.

  Apply after setup_engagement_v1.sql (requires public.words).
  Then run: npm run words:metadata-seed-sql > /tmp/word_metadata.sql and execute in SQL editor.
*/

-- ---------------------------------------------------------------------------
-- word_metadata (Edge validation + denormalized copy into gift_tokens)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.word_metadata (
  word_id text PRIMARY KEY REFERENCES public.words (id) ON DELETE CASCADE,
  character text NOT NULL CHECK (char_length(character) <= 32),
  pinyin text NOT NULL CHECK (char_length(pinyin) <= 120),
  en_meaning text NOT NULL CHECK (char_length(en_meaning) <= 500),
  video_storage_path text NOT NULL CHECK (char_length(video_storage_path) <= 500),
  video_storage_bucket text CHECK (video_storage_bucket IS NULL OR char_length(video_storage_bucket) <= 200),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS word_metadata_updated_idx ON public.word_metadata (updated_at DESC);

ALTER TABLE public.word_metadata ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies: API access denied; service role bypasses RLS.

-- ---------------------------------------------------------------------------
-- gift_tokens
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gift_tokens (
  token text PRIMARY KEY CHECK (char_length(token) >= 16 AND char_length(token) <= 64),
  word_id text NOT NULL REFERENCES public.words (id),
  sender_device_hash text NOT NULL CHECK (char_length(sender_device_hash) >= 8 AND char_length(sender_device_hash) <= 128),
  character text NOT NULL CHECK (char_length(character) <= 32),
  pinyin text NOT NULL CHECK (char_length(pinyin) <= 120),
  en_meaning text NOT NULL CHECK (char_length(en_meaning) <= 500),
  storage_path text NOT NULL CHECK (char_length(storage_path) <= 500),
  storage_bucket text NOT NULL CHECK (char_length(storage_bucket) <= 200),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gift_tokens_word_id_idx ON public.gift_tokens (word_id);
CREATE INDEX IF NOT EXISTS gift_tokens_created_at_idx ON public.gift_tokens (created_at DESC);

ALTER TABLE public.gift_tokens ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- gift_redemptions (idempotent per device)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gift_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_token text NOT NULL REFERENCES public.gift_tokens (token) ON DELETE CASCADE,
  device_hash text NOT NULL CHECK (char_length(device_hash) >= 8 AND char_length(device_hash) <= 128),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gift_redemptions_token_device_unique UNIQUE (gift_token, device_hash)
);

CREATE INDEX IF NOT EXISTS gift_redemptions_token_idx ON public.gift_redemptions (gift_token);

ALTER TABLE public.gift_redemptions ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- session_summaries (JSON payload from client; no PII beyond device_hash)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.session_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_hash text NOT NULL CHECK (char_length(device_hash) >= 8 AND char_length(device_hash) <= 128),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS session_summaries_created_at_idx ON public.session_summaries (created_at DESC);
CREATE INDEX IF NOT EXISTS session_summaries_device_hash_idx ON public.session_summaries (device_hash);

ALTER TABLE public.session_summaries ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Revoke direct table access from anon / authenticated (defense in depth)
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.word_metadata FROM anon;
REVOKE ALL ON public.word_metadata FROM authenticated;
REVOKE ALL ON public.gift_tokens FROM anon;
REVOKE ALL ON public.gift_tokens FROM authenticated;
REVOKE ALL ON public.gift_redemptions FROM anon;
REVOKE ALL ON public.gift_redemptions FROM authenticated;
REVOKE ALL ON public.session_summaries FROM anon;
REVOKE ALL ON public.session_summaries FROM authenticated;
