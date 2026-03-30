import type { SessionSignals, TapTiming, WordMetadata, WordState, SwipeDirection } from './types'

/** One “loop” in session scoring (~5s clip). Exported so UI and tests stay aligned with `loopsElapsedFromMs`. */
export const LOOP_MS = 5000

// PRD: Tap timing canonical definition.
// Early Tap: 2 loops; Late Tap: > 2 loops.
export function classifyTapTiming(loopsElapsed: number): TapTiming {
  return loopsElapsed <= 2.0 ? 'early' : 'late'
}

export function computeTapRateAdaptiveAlpha(tapRate: number): number {
  // PRD only defines qualitative mapping; values here are calibrated for a demo.
  // High tap rate -> slower pace -> slightly lower alpha.
  if (tapRate > 0.6) return 0.85
  if (tapRate < 0.3) return 1.15
  return 1.0
}

function consistencyMultiplier(hoursSinceLastSeen: number): number {
  // PRD: consistency multiplier
  // within same 12h window (binge penalty), between 12h-36h, after >36h gap (reward).
  if (hoursSinceLastSeen < 12) return 0.85
  if (hoursSinceLastSeen <= 36) return 1.0
  return 1.15
}

/**
 * PRD v3 session score (before α × consistency). See `src/lib/__tests__/srsSignalMatrix.test.ts` for the matrix.
 */
export function scoreFromSession(signals: SessionSignals): number {
  const { swipeDirection, tapOccurred, tapTiming, loopsElapsed } = signals

  if (swipeDirection === 'left') {
    // PRD: Left-Swipe Bridge
    if (!tapOccurred) return 0.0
    // Any tap on left swipe = failure + content rejection.
    return -1.0
  }

  // Right swipe.
  if (!tapOccurred) {
    // PRD: Loop ranges for right swipe, no tap.
    if (loopsElapsed < 1.0) return 0.3
    if (loopsElapsed <= 2.0) return 2.0
    if (loopsElapsed <= 4.0) return 1.0
    return 0.5
  }

  // Any tap + right swipe:
  // early/late mapping is canonical in PRD.
  const timing: TapTiming = tapTiming ?? classifyTapTiming(loopsElapsed)
  if (timing === 'early') return 0.6
  return -1.5
}

export function updateWordState(args: {
  word: WordMetadata
  prev: WordState
  signals: SessionSignals
  alpha: number
  nowMs: number
}): WordState {
  const { prev, signals, alpha, nowMs } = args

  const hoursSinceLastSeen = prev.lastSeenAt ? (nowMs - prev.lastSeenAt) / 36e5 : 9999
  const consistency = prev.lastSeenAt ? consistencyMultiplier(hoursSinceLastSeen) : 1.0
  const scoreS = scoreFromSession(signals)

  /* Persisted M_score is only moved by session signals (PRD v3). Time decay is display-only (`computeMDecayed`). */
  const mScore = Math.max(0, prev.mScore + scoreS * alpha * consistency)

  // PRD mastery gate:
  // Mastery confirmed when a word achieves 3 consecutive "Loop 1 / No Tap" sessions,
  // each session spaced at least 48h apart.
  const loop1NoTap =
    signals.swipeDirection === 'right' &&
    !signals.tapOccurred &&
    signals.loopsElapsed >= 1.0 &&
    signals.loopsElapsed <= 2.0

  let consecutiveLoop1NoTapSessions = 0
  let lastLoop1NoTapAt: number | null = null
  if (loop1NoTap) {
    if (prev.lastLoop1NoTapAt && prev.lastLoop1NoTapAt > 0) {
      const hoursSinceLastLoop1 = (nowMs - prev.lastLoop1NoTapAt) / 36e5
      consecutiveLoop1NoTapSessions =
        hoursSinceLastLoop1 >= 48 ? prev.consecutiveLoop1NoTapSessions + 1 : 1
    } else {
      consecutiveLoop1NoTapSessions = 1
    }
    lastLoop1NoTapAt = nowMs
  } else {
    consecutiveLoop1NoTapSessions = 0
    lastLoop1NoTapAt = null
  }

  /* Once the gate is satisfied, keep Gold / all_meanings_mastered latched (Phase 1). */
  const masteryConfirmed = prev.masteryConfirmed || consecutiveLoop1NoTapSessions >= 3

  return {
    ...prev,
    mScore,
    masteryConfirmed,
    consecutiveLoop1NoTapSessions,
    lastLoop1NoTapAt,
    lastSeenAt: nowMs,
    sessionsSeen: prev.sessionsSeen + 1,
  }
}

export function loopsElapsedFromMs(elapsedMs: number): number {
  return elapsedMs / LOOP_MS
}

/** Initial `WordState` before any sessions are recorded for this word. */
export function wordStateSeed(word: Pick<WordMetadata, 'word_id'>): WordState {
  return {
    word_id: word.word_id,
    mScore: 0,
    masteryConfirmed: false,
    consecutiveLoop1NoTapSessions: 0,
    lastLoop1NoTapAt: null,
    lastSeenAt: null,
    sessionsSeen: 0,
  }
}

