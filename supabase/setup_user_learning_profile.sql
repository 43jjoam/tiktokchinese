/*
  PRD §11 — Save progress after ~20 videos: sync LocalStorage memory profile to Supabase.

  Prerequisites: Supabase Auth → Email enabled (magic link) in Dashboard.
  After apply: authenticated users can upsert/read one row keyed by auth.uid().

  Client stores JSON: { v: 1, persisted: PersistedState, currentWordId: string | null }
*/

CREATE TABLE IF NOT EXISTS public.user_learning_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_learning_profiles_updated_at_idx
  ON public.user_learning_profiles (updated_at DESC);

ALTER TABLE public.user_learning_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_learning_profiles_select_own" ON public.user_learning_profiles;
CREATE POLICY "user_learning_profiles_select_own"
  ON public.user_learning_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_learning_profiles_insert_own" ON public.user_learning_profiles;
CREATE POLICY "user_learning_profiles_insert_own"
  ON public.user_learning_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_learning_profiles_update_own" ON public.user_learning_profiles;
CREATE POLICY "user_learning_profiles_update_own"
  ON public.user_learning_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON public.user_learning_profiles FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.user_learning_profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.touch_user_learning_profiles_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_learning_profiles_set_updated_at ON public.user_learning_profiles;
CREATE TRIGGER user_learning_profiles_set_updated_at
  BEFORE UPDATE ON public.user_learning_profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.touch_user_learning_profiles_updated_at();
