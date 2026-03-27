import { getSupabaseClient } from './deckService'

/** Default private bucket for Chinese Characters 1 deck MP4s (matches Supabase Storage bucket id). */
const CHINESE_CHARACTERS_1_VIDEO_BUCKET_ID = 'chinese character 1 _videos'

/** Override with VITE_CHINESE_CHARACTERS_1_VIDEO_BUCKET or VITE_VIDEO_STORAGE_BUCKET if needed. */
const DEFAULT_BUCKET =
  (import.meta.env.VITE_CHINESE_CHARACTERS_1_VIDEO_BUCKET as string | undefined) ||
  (import.meta.env.VITE_VIDEO_STORAGE_BUCKET as string | undefined) ||
  CHINESE_CHARACTERS_1_VIDEO_BUCKET_ID

/** Seconds until signed URL expires (default 30d). Set VITE_VIDEO_SIGN_URL_EXPIRY_SEC if your project caps lower. */
const EXPIRY_SEC = (() => {
  const raw = import.meta.env.VITE_VIDEO_SIGN_URL_EXPIRY_SEC as string | undefined
  const n = raw ? Number.parseInt(raw, 10) : NaN
  return Number.isFinite(n) && n > 60 ? n : 60 * 60 * 24 * 30
})()

export async function createLessonVideoSignedUrl(
  path: string,
  bucketOverride?: string,
): Promise<{ url: string } | { error: string }> {
  const client = getSupabaseClient()
  const bucket = bucketOverride?.trim() || DEFAULT_BUCKET
  if (!client) {
    return { error: 'Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).' }
  }
  if (!bucket) {
    return { error: 'Set video_storage_bucket on the word or VITE_* bucket env vars.' }
  }

  const cleanPath = path.trim().replace(/^\/+/, '')
  const { data, error } = await client.storage.from(bucket).createSignedUrl(cleanPath, EXPIRY_SEC)

  if (error || !data?.signedUrl) {
    return { error: error?.message ?? 'createSignedUrl returned no URL' }
  }
  return { url: data.signedUrl }
}
