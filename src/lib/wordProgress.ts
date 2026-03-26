import type { WordState } from './types'

const MASTERY_THRESHOLD = 3.0

export type ProgressTier = 'mastered' | 'inProgress' | 'new'

/** Aligns with VideoFeed bucket logic (mScore threshold + masteryConfirmed). */
export function wordProgressTier(st: WordState | undefined): ProgressTier {
  if (!st || st.sessionsSeen === 0) return 'new'
  if (st.masteryConfirmed || st.mScore >= MASTERY_THRESHOLD) return 'mastered'
  return 'inProgress'
}

export const tierBarClass: Record<ProgressTier, string> = {
  mastered: 'bg-green-500',
  inProgress: 'bg-orange-500',
  new: 'bg-zinc-400',
}
