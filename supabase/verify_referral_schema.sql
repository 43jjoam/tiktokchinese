/*
  Run in Supabase → SQL Editor (read-only checks).

  Confirms referral-related columns on user_learning_profiles, the bonus trigger,
  and the RPC used by ?ref= / Library invite code.

  If any row is missing, apply the matching file from supabase/ in order:
    1. setup_user_profile_stats_columns.sql     → bonus_cards_unlocked, streak stats, …
    2. setup_user_profile_referral_columns.sql  → referral_code, referred_by, referral_count
    3. referral_bonus_trigger_and_backfill.sql  → referral_bonus_applied + ensure_referral_code trigger
    4. apply_referral_bonus_trigger.sql         → on_referral_attribution + apply_referral_bonus()
    5. user_id_for_referral_code.sql            → RPC for code → referrer user_id
*/

-- 1) Expected columns (all should appear; types should match)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'user_learning_profiles'
  AND column_name IN (
    'referral_code',
    'referred_by',
    'referral_count',
    'referral_bonus_applied',
    'bonus_cards_unlocked'
  )
ORDER BY column_name;

-- 2) Bonus trigger on referred_by (BEFORE INSERT OR UPDATE OF referred_by)
SELECT t.tgname AS trigger_name,
       pg_get_triggerdef(t.oid) AS trigger_def
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'user_learning_profiles'
  AND NOT t.tgisinternal
  AND t.tgname = 'on_referral_attribution';

-- 3) RPC for invite link / manual code lookup
SELECT p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'user_id_for_referral_code';

-- 4) Sample: recent rows with referred_by set (should be non-empty after successful referrals)
SELECT user_id, referral_code, referred_by, referral_bonus_applied, bonus_cards_unlocked, referral_count, updated_at
FROM public.user_learning_profiles
WHERE referred_by IS NOT NULL
ORDER BY updated_at DESC
LIMIT 15;
