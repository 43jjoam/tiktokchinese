/*
  Referral / product analytics — fire-and-forget inserts from the client (authenticated only).

  Apply in Supabase SQL Editor after auth.users exists.
*/

CREATE TABLE IF NOT EXISTS public.app_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS app_events_created_at_idx ON public.app_events (created_at DESC);
CREATE INDEX IF NOT EXISTS app_events_name_idx ON public.app_events (name);

COMMENT ON TABLE public.app_events IS 'Client-logged product events (no PII in payload by convention).';

ALTER TABLE public.app_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_events_insert_own" ON public.app_events;
CREATE POLICY "app_events_insert_own"
  ON public.app_events
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON public.app_events FROM anon;
GRANT INSERT ON public.app_events TO authenticated;
