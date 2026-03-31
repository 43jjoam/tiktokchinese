/*
  Run in Supabase SQL Editor to verify `referral_code` exists and is populated.

  Prerequisites: `setup_user_profile_referral_columns.sql` applied (adds `referral_code`,
  `referred_by`, `referral_count` on `public.user_learning_profiles`).

  Also run `referral_bonus_trigger_and_backfill.sql` for `referral_bonus_applied`, server trigger,
  and one-time NULL backfill. Run `user_id_for_referral_code.sql` so `?ref=` can resolve to referrer user_id.

  App: merge no longer wipes a locally generated code when the server row still has NULL; upserts
  omit null referral columns so PostgREST does not overwrite with NULL.
*/

SELECT
  COUNT(*) FILTER (
    WHERE referral_code IS NOT NULL AND btrim(referral_code) <> ''
  ) AS profiles_with_referral_code,
  COUNT(*) AS total_profiles
FROM public.user_learning_profiles;

SELECT user_id, referral_code, referral_count, updated_at
FROM public.user_learning_profiles
WHERE referral_code IS NOT NULL AND btrim(referral_code) <> ''
ORDER BY updated_at DESC
LIMIT 25;
