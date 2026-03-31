/*
  Public RPC: map a shareable referral_code to the referrer's user_id (for ?ref= attribution).
  referred_by on the invitee row stores this uuid — not the raw code string.

  Apply after setup_user_profile_referral_columns.sql (referral_code column must exist).

  PostgREST: supabase.rpc('user_id_for_referral_code', { code: 'ABCD1234' })
*/

CREATE OR REPLACE FUNCTION public.user_id_for_referral_code(code text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id
  FROM public.user_learning_profiles
  WHERE referral_code = upper(trim(code))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.user_id_for_referral_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_id_for_referral_code(text) TO anon, authenticated;

COMMENT ON FUNCTION public.user_id_for_referral_code(text) IS
  'Returns referrer user_id for a referral_code; used when applying ?ref= after sign-in.';
