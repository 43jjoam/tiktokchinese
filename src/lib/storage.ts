import type { VideoQualityState, WordState } from './types'

const KEY_CURRENT_WORD_ID = 'stealthSwipe.currentWordId.v1'
const KEY_WORD_STATES = 'stealthSwipe.wordStates.v1'
const KEY_VIDEO_QUALITY = 'stealthSwipe.videoQuality.v1'
const KEY_APP_META = 'stealthSwipe.appMeta.v1'

export type AppMeta = {
  sessionsServed: number
  first20Seen: number
  first20Tapped: number
  alphaFrozen: boolean
  alphaValue: number
  /**
   * Save prompt: times user tapped "Not now" (0–2).
   * 0 → prompt at 10 swipes (with Not now); 1 → again at 15; 2 → final at 20 without Not now.
   */
  accountSaveNotNowCount?: number
  /** Magic link sent; suppress re-showing the prompt until sign-in */
  accountMagicLinkSentAt?: number
  /** ISO timestamp from `user_learning_profiles.updated_at` after last merge or upload */
  lastMergedRemoteUpdatedAt?: string | null
}

export type PersistedState = {
  wordStates: Record<string, WordState>
  videoQuality: Record<string, VideoQualityState>
  meta: AppMeta
}

const defaultMeta: AppMeta = {
  sessionsServed: 0,
  first20Seen: 0,
  first20Tapped: 0,
  alphaFrozen: false,
  alphaValue: 1.0,
}

export function loadCurrentWordId(): string | null {
  try {
    return localStorage.getItem(KEY_CURRENT_WORD_ID)
  } catch {
    return null
  }
}

export function saveCurrentWordId(wordId: string) {
  try {
    localStorage.setItem(KEY_CURRENT_WORD_ID, wordId)
  } catch {
    // ignore
  }
}

export function loadPersistedState(): PersistedState {
  const empty: PersistedState = {
    wordStates: {},
    videoQuality: {},
    meta: defaultMeta,
  }

  try {
    const rawWords = localStorage.getItem(KEY_WORD_STATES)
    if (rawWords) empty.wordStates = JSON.parse(rawWords)
  } catch {
    // ignore
  }

  try {
    const rawQuality = localStorage.getItem(KEY_VIDEO_QUALITY)
    if (rawQuality) empty.videoQuality = JSON.parse(rawQuality)
  } catch {
    // ignore
  }

  try {
    const rawMeta = localStorage.getItem(KEY_APP_META)
    if (rawMeta) {
      const parsed = JSON.parse(rawMeta) as Record<string, unknown>
      const m = { ...defaultMeta, ...parsed } as AppMeta
      /* Legacy: old “dismiss forever” → treat as two snoozes so final gate can still apply at 20+ swipes */
      if (
        parsed.accountSavePromptDismissed === true &&
        m.accountSaveNotNowCount === undefined
      ) {
        m.accountSaveNotNowCount = 2
      }
      delete (m as { accountSavePromptDismissed?: boolean }).accountSavePromptDismissed
      empty.meta = m
    }
  } catch {
    // ignore
  }

  return empty
}

export function savePersistedState(state: PersistedState) {
  localStorage.setItem(KEY_WORD_STATES, JSON.stringify(state.wordStates))
  localStorage.setItem(KEY_VIDEO_QUALITY, JSON.stringify(state.videoQuality))
  localStorage.setItem(KEY_APP_META, JSON.stringify(state.meta))
}

export function upsertWordState(wordStates: Record<string, WordState>, next: WordState): Record<string, WordState> {
  return { ...wordStates, [next.word_id]: next }
}

export function upsertVideoQuality(
  videoQuality: Record<string, VideoQualityState>,
  next: VideoQualityState,
): Record<string, VideoQualityState> {
  return { ...videoQuality, [next.video_id]: next }
}

