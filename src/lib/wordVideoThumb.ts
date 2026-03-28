import type { WordMetadata } from './types'
import { extractYouTubeVideoId } from './youtubeUrl'

/** YouTube still frame (works for Shorts). No signed-Storage poster in v1 — UI falls back to glyph. */
export function youtubePosterUrlForWord(w: WordMetadata): string | null {
  const y = w.youtube_url?.trim()
  if (!y) return null
  const id = extractYouTubeVideoId(y)
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null
}
