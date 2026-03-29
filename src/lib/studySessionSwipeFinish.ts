import type { PersistedState } from './storage'
import type { SessionSignals, SwipeDirection, WordMetadata } from './types'
import {
  computeTapRateAdaptiveAlpha,
  loopsElapsedFromMs,
  updateWordState,
  wordStateSeed,
} from './memoryEngine'

/** Stable id for `videoQuality` aggregation (matches `VideoFeed`). */
export function qualityVideoIdForWord(word: WordMetadata): string {
  return word.video_storage_path ? `storage:${word.video_storage_path}` : word.video_url
}

/** Anonymous guests may complete at most this many swipe sessions before signing in (see VideoFeed gate). */
export const ANONYMOUS_SWIPE_SESSION_CAP = 20

/** Block another swipe session when the guest has reached the cap and is not signed in. */
export function shouldBlockUnsignedSwipeAfterCap(first20Seen: number, isSignedIn: boolean): boolean {
  if (isSignedIn) return false
  return first20Seen >= ANONYMOUS_SWIPE_SESSION_CAP
}

/**
 * Apply one completed swipe session to persisted study state (M-score, meta, video quality).
 * Used by `VideoFeed` and `EngagementWordPlayer` so Profile replays train SRS the same way.
 */
export function applyStudySwipeToPersistedState(args: {
  word: WordMetadata
  swipeDirection: SwipeDirection
  /** Wall-clock ms since this card’s session started (same meaning as `VideoFeed` elapsed). */
  sessionElapsedMs: number
  tapOccurred: boolean
  tapTiming: SessionSignals['tapTiming']
  persisted: PersistedState
  nowMs?: number
}): PersistedState {
  const nowMs = args.nowMs ?? Date.now()
  const loopsElapsed = loopsElapsedFromMs(args.sessionElapsedMs)
  const qualityVideoId = qualityVideoIdForWord(args.word)

  const signals: SessionSignals = {
    word_id: args.word.word_id,
    video_id: qualityVideoId,
    swipeDirection: args.swipeDirection,
    loopsElapsed,
    tapOccurred: args.tapOccurred,
    tapTiming: args.tapTiming,
  }

  const { wordStates, videoQuality, meta } = args.persisted
  const prevWord = wordStates[args.word.word_id] ?? wordStateSeed(args.word)

  const first20SeenNext = meta.first20Seen + 1
  const first20TappedNext = meta.first20Tapped + (args.tapOccurred ? 1 : 0)
  const tapRate = first20TappedNext / Math.max(1, first20SeenNext)

  const alphaCandidate = computeTapRateAdaptiveAlpha(tapRate)
  const alpha = meta.alphaFrozen ? meta.alphaValue : alphaCandidate

  const alphaFrozenNext = meta.alphaFrozen || first20SeenNext >= ANONYMOUS_SWIPE_SESSION_CAP
  const alphaValueNext = alphaFrozenNext ? alphaCandidate : meta.alphaValue

  const updatedWordState = updateWordState({
    word: args.word,
    prev: prevWord,
    signals,
    alpha,
    nowMs,
  })

  const prevQuality = videoQuality[qualityVideoId] ?? {
    video_id: qualityVideoId,
    views: 0,
    left_swipes_no_tap: 0,
    quality_flag: false,
  }

  let nextQuality = { ...prevQuality, views: prevQuality.views + 1 }
  if (args.swipeDirection === 'left' && !args.tapOccurred) {
    nextQuality = {
      ...nextQuality,
      left_swipes_no_tap: nextQuality.left_swipes_no_tap + 1,
    }
    const rate = nextQuality.left_swipes_no_tap / Math.max(1, nextQuality.views)
    nextQuality.quality_flag = rate > 0.2
  }

  return {
    wordStates: { ...wordStates, [args.word.word_id]: updatedWordState },
    videoQuality: { ...videoQuality, [qualityVideoId]: nextQuality },
    meta: {
      ...meta,
      sessionsServed: meta.sessionsServed + 1,
      first20Seen: first20SeenNext,
      first20Tapped: first20TappedNext,
      alphaFrozen: alphaFrozenNext,
      alphaValue: alphaValueNext,
    },
  }
}
