/*
  Streak reminder email (~20h after “Remind tomorrow”): schedule + sent timestamps.

  Client sets streak_reminder_scheduled_at = now() + interval (e.g. 20 hours) and clears sent.
  Edge Function `send-streak-reminders` (cron) sends Resend email and sets streak_reminder_sent_at.

  After apply, deploy: supabase functions deploy send-streak-reminders
  Set secrets: RESEND_API_KEY, STREAK_REMINDER_CRON_SECRET (and existing SUPABASE_*).
  Cron: POST /functions/v1/send-streak-reminders with Authorization: Bearer STREAK_REMINDER_CRON_SECRET (see env.example; verify_jwt=false in config.toml)

  Optional: run setup_user_profile_stats_columns.sql if you want `current_streak` in DB (app sync); the reminder email works without it (generic streak line).
*/

ALTER TABLE public.user_learning_profiles
  ADD COLUMN IF NOT EXISTS streak_reminder_scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS streak_reminder_sent_at timestamptz;

COMMENT ON COLUMN public.user_learning_profiles.streak_reminder_scheduled_at IS
  'When to send the “come back” streak email (set by client ~20h after Remind tomorrow).';
COMMENT ON COLUMN public.user_learning_profiles.streak_reminder_sent_at IS
  'Set when the reminder email was sent (idempotent).';

CREATE INDEX IF NOT EXISTS user_learning_profiles_streak_reminder_due_idx
  ON public.user_learning_profiles (streak_reminder_scheduled_at)
  WHERE streak_reminder_sent_at IS NULL AND streak_reminder_scheduled_at IS NOT NULL;
