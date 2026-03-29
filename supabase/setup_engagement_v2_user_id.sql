/*
  v2 — Account-scoped likes/saves + merge from device_hash on sign-in.
  Apply after setup_engagement_v1.sql. Deploy Edge: record-engagement, merge-device-engagement.

  - Adds nullable user_id on engagement_events.
  - Replaces single unique index with partial indexes: by user_id when set, else by device_hash.
  - RPC merge_engagement_device_to_user(p_user_id, p_device_hash): service_role only; called from Edge after JWT verify.
*/

ALTER TABLE public.engagement_events
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS engagement_events_user_word_type_idx
  ON public.engagement_events (user_id, word_id, type)
  WHERE user_id IS NOT NULL AND NOT is_deleted;

DROP INDEX IF EXISTS engagement_like_save_unique;

CREATE UNIQUE INDEX IF NOT EXISTS engagement_like_save_user_unique
  ON public.engagement_events (type, word_id, user_id)
  WHERE type IN ('like', 'save') AND user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS engagement_like_save_device_unique
  ON public.engagement_events (type, word_id, device_hash)
  WHERE type IN ('like', 'save') AND user_id IS NULL;

CREATE OR REPLACE FUNCTION public.merge_engagement_device_to_user(p_user_id uuid, p_device_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_device_hash IS NULL OR char_length(p_device_hash) < 8 OR char_length(p_device_hash) > 128 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  /* Drop anonymous like/save rows when this user already has that (type, word_id). */
  DELETE FROM public.engagement_events e
  USING public.engagement_events x
  WHERE e.device_hash = p_device_hash
    AND e.user_id IS NULL
    AND e.type IN ('like', 'save')
    AND x.user_id = p_user_id
    AND x.type = e.type
    AND x.word_id = e.word_id
    AND NOT x.is_deleted;

  UPDATE public.engagement_events
  SET user_id = p_user_id
  WHERE device_hash = p_device_hash
    AND user_id IS NULL
    AND type IN ('like', 'save');

  UPDATE public.engagement_events
  SET user_id = p_user_id
  WHERE device_hash = p_device_hash
    AND user_id IS NULL
    AND type IN ('share_tap', 'share_success');

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.merge_engagement_device_to_user(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_engagement_device_to_user(uuid, text) TO service_role;
