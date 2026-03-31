/*
  Developer Action Plan Step 2 — Profile stats on `user_learning_profiles`.
  Apply after `setup_user_learning_profile.sql`.

  last_active_date: UTC calendar day of last activity (streak / daily rollup in later steps).
*/

ALTER TABLE public.user_learning_profiles
  ADD COLUMN IF NOT EXISTS last_active_date date,
  ADD COLUMN IF NOT EXISTS current_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_days_active integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_cards_unlocked integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.user_learning_profiles.last_active_date IS 'UTC date YYYY-MM-DD of last active day';
COMMENT ON COLUMN public.user_learning_profiles.current_streak IS 'Consecutive active days (see streak logic)';
COMMENT ON COLUMN public.user_learning_profiles.total_days_active IS 'Count of distinct active days';
COMMENT ON COLUMN public.user_learning_profiles.bonus_cards_unlocked IS 'Referral / promo bonus swipe budget';
