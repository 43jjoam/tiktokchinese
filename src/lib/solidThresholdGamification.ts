import type { WordState } from './types'

/** ms to hold the feed on the “roll into vault” beat after crossing Solid (mScore ≥ 5). */
export const SOLID_THRESHOLD_ROLL_HOLD_MS = 920

/**
 * True when a right-swipe session moves the word into the Solid vault tier (mScore crosses 5 from below).
 * Gold via `masteryConfirmed` without hitting 5 is a separate path — not included here.
 */
export function crossedIntoSolidTier(prev: WordState, next: WordState): boolean {
  if (next.masteryConfirmed) return false
  return prev.mScore < 5 && next.mScore >= 5
}
