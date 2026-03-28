import type { WordMetadata } from './types'

/** Stable clip id for engagement_events.clip_key (PRD). */
export function clipKeyForWord(w: WordMetadata): string {
  const raw =
    (w.youtube_url && w.youtube_url.trim()) ||
    (w.video_storage_path && w.video_storage_path.trim()) ||
    (w.video_url && w.video_url.trim()) ||
    w.word_id
  return raw.slice(0, 200)
}
