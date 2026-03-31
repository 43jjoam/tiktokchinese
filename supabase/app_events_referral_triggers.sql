/*
  Server-side app_events for referral (Completion Spec §5).
  Fires on first referred_by and when referral_bonus_applied becomes true.

  Prerequisites: public.app_events (setup_app_events.sql), user_learning_profiles referral columns.
  Apply in Supabase SQL Editor. Uses SECURITY DEFINER so inserts bypass RLS as postgres.
*/

CREATE OR REPLACE FUNCTION public.log_referral_app_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.referred_by IS NOT NULL THEN
      INSERT INTO public.app_events (user_id, name, payload)
      VALUES (
        NEW.user_id,
        'referral_attributed',
        jsonb_build_object('referrer_id', NEW.referred_by)
      );
    END IF;
    IF COALESCE(NEW.referral_bonus_applied, false) = true AND NEW.referred_by IS NOT NULL THEN
      INSERT INTO public.app_events (user_id, name, payload)
      VALUES (
        NEW.user_id,
        'referral_bonus_awarded',
        jsonb_build_object('referrer_id', NEW.referred_by)
      );
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.referred_by IS NULL AND NEW.referred_by IS NOT NULL THEN
      INSERT INTO public.app_events (user_id, name, payload)
      VALUES (
        NEW.user_id,
        'referral_attributed',
        jsonb_build_object('referrer_id', NEW.referred_by)
      );
    END IF;
    IF NOT COALESCE(OLD.referral_bonus_applied, false) AND COALESCE(NEW.referral_bonus_applied, false) = true
       AND NEW.referred_by IS NOT NULL THEN
      INSERT INTO public.app_events (user_id, name, payload)
      VALUES (
        NEW.user_id,
        'referral_bonus_awarded',
        jsonb_build_object('referrer_id', NEW.referred_by)
      );
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_learning_profiles_referral_app_events ON public.user_learning_profiles;

CREATE TRIGGER user_learning_profiles_referral_app_events
  AFTER INSERT OR UPDATE OF referred_by, referral_bonus_applied
  ON public.user_learning_profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.log_referral_app_events();
