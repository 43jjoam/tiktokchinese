/*
  Developer Action Plan Step 3 — Referral fields on `user_learning_profiles`.
  Apply after `setup_user_profile_stats_columns.sql`.

  referred_by: referrer's auth.users id (UUID). Resolve ?ref=CODE by looking up referral_code,
  then store that user_id — never store the raw code string in this column.
*/

ALTER TABLE public.user_learning_profiles
  ADD COLUMN IF NOT EXISTS referral_code text,
  ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_count integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS user_learning_profiles_referral_code_key
  ON public.user_learning_profiles (referral_code)
  WHERE referral_code IS NOT NULL;

COMMENT ON COLUMN public.user_learning_profiles.referral_code IS 'Shareable code; unique when set';
COMMENT ON COLUMN public.user_learning_profiles.referred_by IS 'Referrer auth.users id; lookup ?ref= code → referral_code row → this uuid';
COMMENT ON COLUMN public.user_learning_profiles.referral_count IS 'Successful referrals attributed to this user';
