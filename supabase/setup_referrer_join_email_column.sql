/*
  Idempotent flag for Edge Function `notify-referrer-join`: email to referrer after a friend joins.
  Apply in Supabase SQL Editor, then deploy: supabase functions deploy notify-referrer-join
*/

ALTER TABLE public.user_learning_profiles
  ADD COLUMN IF NOT EXISTS referrer_join_email_sent_at timestamptz;

COMMENT ON COLUMN public.user_learning_profiles.referrer_join_email_sent_at IS
  'Set when referrer was emailed that someone joined via their link/code (Resend).';
