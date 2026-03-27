export type Locale = 'en' | 'zh-TW' | 'th'

export type WordId = string

export type WordMetadata = {
  word_id: WordId
  character: string
  pinyin: string
  l1_meanings: Partial<Record<Locale, string>>
  video_url: string
  // Original video source. Without use_video_url, playback uses the iframe player when present.
  // With use_video_url, try Supabase signed URL + video_url first; youtube_url is last-resort if both fail.
  youtube_url?: string
  /** When true, prefer Storage signed URL then native video_url; YouTube only if those fail to play. */
  use_video_url?: boolean
  /**
   * Path inside a private Supabase Storage bucket (no leading slash), e.g. `hsk1/M-dad-01.mp4`.
   * When set with use_video_url, the app calls createSignedUrl — use video_url as fallback label/id only.
   */
  video_storage_path?: string
  /** Optional bucket; defaults to VITE_VIDEO_STORAGE_BUCKET. */
  video_storage_bucket?: string
  base_complexity: number
  dependencies: WordId[]
  /** Feed item kind for profile / analytics. Defaults to character when omitted. */
  content_type?: 'character' | 'vocabulary' | 'grammar'
  /** Library catalog keys (e.g. hsk-2) that include this word; used when a purchased deck lists contents. */
  deck_catalog_keys?: string[]
}

export type WordState = {
  word_id: WordId
  mScore: number
  masteryConfirmed: boolean
  consecutiveLoop1NoTapSessions: number
  lastLoop1NoTapAt: number | null
  lastSeenAt: number | null
  sessionsSeen: number
}

export type VideoQualityState = {
  video_id: string
  views: number
  left_swipes_no_tap: number
  quality_flag: boolean
}

export type SwipeDirection = 'left' | 'right'
export type TapTiming = 'early' | 'late'

export type SessionSignals = {
  word_id: WordId
  video_id: string
  swipeDirection: SwipeDirection
  loopsElapsed: number
  tapOccurred: boolean
  tapTiming?: TapTiming
}

