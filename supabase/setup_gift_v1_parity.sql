/*
  Gift parity (PRD §9.6 / ImplRef): token expiry, revocation flag, UTC daily receive cap support.

  Apply after setup_gift_v0.sql. Then redeploy create-gift + redeem-gift.

  - gift_tokens.expires_at: default now() + 7 days; backfilled for existing rows.
  - gift_tokens.is_revoked: admin kill-switch; default false.
  - gift_redemptions: index for counting redemptions per device_hash per UTC calendar day.
*/

ALTER TABLE public.gift_tokens
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_revoked boolean NOT NULL DEFAULT false;

UPDATE public.gift_tokens
SET expires_at = created_at + interval '7 days'
WHERE expires_at IS NULL;

ALTER TABLE public.gift_tokens
  ALTER COLUMN expires_at SET NOT NULL,
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '7 days');

COMMENT ON COLUMN public.gift_tokens.is_revoked IS 'When true, redeem-gift rejects the token (admin moderation).';

CREATE INDEX IF NOT EXISTS gift_redemptions_device_utc_day_idx
  ON public.gift_redemptions (device_hash, ((created_at AT TIME ZONE 'UTC')::date));
