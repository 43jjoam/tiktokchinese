/*
  Referral — first-time referred_by: invitee +10 bonus_cards_unlocked; referrer +20; increment
  referral_count; set referral_bonus_applied on invitee row.

  Prerequisites: referral_bonus_applied column (see referral_bonus_trigger_and_backfill.sql),
  referred_by, bonus_cards_unlocked, referral_count on user_learning_profiles.

  Apply in Supabase SQL Editor after prior migrations.
*/

CREATE OR REPLACE FUNCTION public.apply_referral_bonus()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  referrer_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.referred_by IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.referred_by IS NULL THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.referral_bonus_applied, false) = true THEN
    RETURN NEW;
  END IF;

  referrer_id := NEW.referred_by;

  IF referrer_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_learning_profiles u WHERE u.user_id = referrer_id) THEN
    RETURN NEW;
  END IF;

  NEW.bonus_cards_unlocked := COALESCE(NEW.bonus_cards_unlocked, 0) + 10;
  NEW.referral_bonus_applied := true;

  UPDATE public.user_learning_profiles
  SET
    bonus_cards_unlocked = COALESCE(bonus_cards_unlocked, 0) + 20,
    referral_count = COALESCE(referral_count, 0) + 1
  WHERE user_id = referrer_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.apply_referral_bonus() IS
  'Awards referral bonus on first referred_by; SECURITY DEFINER updates referrer row across RLS.';

DROP TRIGGER IF EXISTS on_referral_attribution ON public.user_learning_profiles;

CREATE TRIGGER on_referral_attribution
  BEFORE INSERT OR UPDATE OF referred_by
  ON public.user_learning_profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.apply_referral_bonus();
