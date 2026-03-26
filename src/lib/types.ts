export type Locale = 'en' | 'zh-TW' | 'th'

export type WordId = string

export type WordMetadata = {
  word_id: WordId
  character: string
  pinyin: string
  l1_meanings: Partial<Record<Locale, string>>
  video_url: string
  // Original video source (useful for future download/sync tooling).
  youtube_url?: string
  base_complexity: number
  dependencies: WordId[]
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

