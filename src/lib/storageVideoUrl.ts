import { getSupabaseClient } from './deckService'
import type { WordMetadata } from './types'

/** Default private bucket for Chinese Characters 1 deck MP4s (matches Supabase Storage bucket id). */
const CHINESE_CHARACTERS_1_VIDEO_BUCKET_ID = 'chinese character 1 _videos'

/** Override with VITE_CHINESE_CHARACTERS_1_VIDEO_BUCKET or VITE_VIDEO_STORAGE_BUCKET if needed. */
const DEFAULT_BUCKET =
  (import.meta.env.VITE_CHINESE_CHARACTERS_1_VIDEO_BUCKET as string | undefined) ||
  (import.meta.env.VITE_VIDEO_STORAGE_BUCKET as string | undefined) ||
  CHINESE_CHARACTERS_1_VIDEO_BUCKET_ID

/** Seconds until signed URL expires (default 7d — longer values are sometimes rejected by the API). */
const EXPIRY_SEC = (() => {
  const raw = import.meta.env.VITE_VIDEO_SIGN_URL_EXPIRY_SEC as string | undefined
  const n = raw ? Number.parseInt(raw, 10) : NaN
  return Number.isFinite(n) && n > 60 ? n : 60 * 60 * 24 * 7
})()

/** Refresh before JWT expiry so we never hand the browser a stale URL. */
const CACHE_SKEW_SEC = Math.min(300, Math.max(60, Math.floor(EXPIRY_SEC * 0.02)))

type CachedSigned = { url: string; validUntil: number }

const signedUrlCache = new Map<string, CachedSigned>()
const inflightSigned = new Map<string, Promise<{ url: string } | { error: string }>>()

function cacheKey(bucket: string, canonicalPath: string) {
  return `${bucket}::${canonicalPath.trim()}`
}

function resolveBucket(bucketOverride?: string) {
  return bucketOverride?.trim() || DEFAULT_BUCKET
}

/** Supabase object keys for uploads that used spaces instead of hyphens (e.g. M dad 01.mp4). */
function storageObjectKeyCandidates(canonicalPath: string): string[] {
  const clean = canonicalPath.trim().replace(/^\/+/, '')
  const spaced = clean.replace(/-/g, ' ')
  const m = clean.match(/^M-(.+)\.mp4$/i)
  const doubleAfterM = m ? `M  ${m[1].replace(/-/g, ' ')}.mp4` : null
  return [...new Set([clean, spaced, ...(doubleAfterM ? [doubleAfterM] : [])])]
}

async function signOnce(
  client: NonNullable<ReturnType<typeof getSupabaseClient>>,
  bucket: string,
  canonicalPath: string,
): Promise<{ url: string } | { error: string }> {
  const candidates = storageObjectKeyCandidates(canonicalPath)
  let lastMessage = 'createSignedUrl returned no URL'

  for (const objectPath of candidates) {
    const { data, error } = await client.storage.from(bucket).createSignedUrl(objectPath, EXPIRY_SEC)
    if (!error && data?.signedUrl) {
      return { url: data.signedUrl }
    }
    if (error?.message) lastMessage = error.message
  }

  return { error: lastMessage }
}

/** Synchronous read when prefetch or a prior visit already filled the cache (avoids a blank frame). */
export function peekCachedLessonVideoSignedUrl(path: string, bucketOverride?: string): string | null {
  if (!getSupabaseClient()) return null
  const bucket = resolveBucket(bucketOverride)
  const hit = signedUrlCache.get(cacheKey(bucket, path))
  if (hit && hit.validUntil > Date.now()) return hit.url
  return null
}

export async function createLessonVideoSignedUrl(
  path: string,
  bucketOverride?: string,
): Promise<{ url: string } | { error: string }> {
  const client = getSupabaseClient()
  const bucket = resolveBucket(bucketOverride)
  if (!client) {
    return { error: 'Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).' }
  }
  if (!bucket) {
    return { error: 'Set video_storage_bucket on the word or VITE_* bucket env vars.' }
  }

  const key = cacheKey(bucket, path)
  const hit = signedUrlCache.get(key)
  if (hit && hit.validUntil > Date.now()) {
    return { url: hit.url }
  }

  const pending = inflightSigned.get(key)
  if (pending) return pending

  const promise = (async () => {
    const result = await signOnce(client, bucket, path)
    if ('url' in result) {
      signedUrlCache.set(key, {
        url: result.url,
        validUntil: Date.now() + (EXPIRY_SEC - CACHE_SKEW_SEC) * 1000,
      })
    }
    return result
  })().finally(() => {
    inflightSigned.delete(key)
  })

  inflightSigned.set(key, promise)
  return promise
}

/**
 * Warms signed-URL cache in the background so the first swipe to each lesson feels instant.
 * Low concurrency avoids hammering Supabase on startup.
 */
export function prefetchLessonVideoSignedUrls(
  words: WordMetadata[],
  options?: { concurrency?: number; prioritizePath?: string },
): void {
  const client = getSupabaseClient()
  if (!client) return

  const seen = new Set<string>()
  const jobs: { path: string; bucket?: string }[] = []
  for (const w of words) {
    if (!w.use_video_url || !w.video_storage_path?.trim()) continue
    const bucket = resolveBucket(w.video_storage_bucket)
    const key = cacheKey(bucket, w.video_storage_path)
    if (seen.has(key)) continue
    seen.add(key)
    jobs.push({ path: w.video_storage_path, bucket: w.video_storage_bucket })
  }

  const first = options?.prioritizePath?.trim()
  if (first) {
    jobs.sort((a, b) => {
      if (a.path === first) return -1
      if (b.path === first) return 1
      return 0
    })
  }

  const concurrency = Math.max(1, Math.min(12, options?.concurrency ?? 6))
  let i = 0
  const runWorker = async () => {
    while (i < jobs.length) {
      const j = i++
      const { path, bucket } = jobs[j]
      try {
        await createLessonVideoSignedUrl(path, bucket)
      } catch {
        /* ignore prefetch failures */
      }
    }
  }
  void Promise.all(Array.from({ length: concurrency }, () => runWorker()))
}
