/**
 * Sprint 5 Phase 1b — mastery block tiers (PRD v3).
 * Tiers derive from persisted `mScore` + Phase-1 `all_meanings_mastered` (= `masteryConfirmed`).
 */

export type MasteryBlockTier = 'fluid' | 'crystallizing' | 'solid' | 'gold'

/** λ per hour for display-only decay (vault dust). Persisted `mScore` is never decayed by time. */
export const M_DECAY_LAMBDA_PER_HOUR = 0.0208

/**
 * Phase 1: Gold iff mastery gate confirmed. Otherwise: &lt;3 fluid, 3–4 crystallizing, ≥5 solid.
 */
export function deriveMasteryBlockTier(mScore: number, allMeaningsMastered: boolean): MasteryBlockTier {
  if (allMeaningsMastered) return 'gold'
  if (mScore >= 5) return 'solid'
  if (mScore >= 3) return 'crystallizing'
  return 'fluid'
}

/**
 * Display-only decay for vault dust. Never persist.
 * Gold skips lambda — mDecayed equals mScore.
 * Missing lastSeenAt: no elapsed time, no dust (PRD).
 */
export function computeMDecayed(args: {
  mScore: number
  lastSeenAtMs: number | null
  nowMs: number
  allMeaningsMastered: boolean
}): number {
  if (args.allMeaningsMastered) return args.mScore
  if (args.lastSeenAtMs == null || args.lastSeenAtMs <= 0) return args.mScore
  const hours = (args.nowMs - args.lastSeenAtMs) / 36e5
  return args.mScore * Math.exp(-M_DECAY_LAMBDA_PER_HOUR * hours)
}

export function masteryBlockTierLabel(tier: MasteryBlockTier): string {
  switch (tier) {
    case 'fluid':
      return 'Fluid'
    case 'crystallizing':
      return 'Crystallizing'
    case 'solid':
      return 'Solid'
    case 'gold':
      return 'Gold'
    default:
      return tier
  }
}
