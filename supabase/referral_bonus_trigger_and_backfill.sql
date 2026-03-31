/*
  Apply after setup_user_profile_referral_columns.sql.

  1. referral_bonus_applied — one-time reward flag (client can sync later).
  2. random_referral_code() — same alphabet as client `generateReferralCodeCandidate`.
  3. BEFORE INSERT OR UPDATE trigger — if referral_code is null/blank, assign a unique code
     (safety net when PostgREST omits the column).
  4. One-time backfill for rows that still have NULL referral_code.

  referred_by remains uuid: store the referrer's auth user id after resolving ?ref=CODE → user_learning_profiles.referral_code → user_id.
*/

ALTER TABLE public.user_learning_profiles
  ADD COLUMN IF NOT EXISTS referral_bonus_applied boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_learning_profiles.referral_bonus_applied IS
  'True once a one-time referral reward was granted (e.g. bonus swipes).';

CREATE OR REPLACE FUNCTION public.random_referral_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  s text := '';
  i int;
  pos int;
BEGIN
  FOR i IN 1..8 LOOP
    pos := 1 + floor(random() * length(alphabet))::int;
    s := s || substr(alphabet, pos, 1);
  END LOOP;
  RETURN s;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_learning_profiles_ensure_referral_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  attempt int;
  candidate text;
BEGIN
  IF NEW.referral_code IS NOT NULL AND btrim(NEW.referral_code) <> '' THEN
    RETURN NEW;
  END IF;
  FOR attempt IN 1..40 LOOP
    candidate := public.random_referral_code();
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.user_learning_profiles u
      WHERE u.referral_code = candidate
        AND u.user_id IS DISTINCT FROM NEW.user_id
    );
  END LOOP;
  NEW.referral_code := candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_learning_profiles_biu_ensure_referral_code ON public.user_learning_profiles;

CREATE TRIGGER user_learning_profiles_biu_ensure_referral_code
  BEFORE INSERT OR UPDATE
  ON public.user_learning_profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.user_learning_profiles_ensure_referral_code();

-- One-time backfill (idempotent for already-filled rows)
DO $$
DECLARE
  r RECORD;
  attempt int;
  candidate text;
BEGIN
  FOR r IN
    SELECT user_id
    FROM public.user_learning_profiles
    WHERE referral_code IS NULL OR btrim(referral_code) = ''
  LOOP
    FOR attempt IN 1..40 LOOP
      candidate := public.random_referral_code();
      EXIT WHEN NOT EXISTS (
        SELECT 1
        FROM public.user_learning_profiles u
        WHERE u.referral_code = candidate
          AND u.user_id <> r.user_id
      );
    END LOOP;
    UPDATE public.user_learning_profiles
    SET referral_code = candidate
    WHERE user_id = r.user_id;
  END LOOP;
END $$;
