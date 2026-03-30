/**
 * Sprint 5 Phase 1b — mastery block tiers (PRD v3).
 * Tiers derive from persisted `mScore` + Phase-1 `all_meanings_mastered` (= `masteryConfirmed`).
 */

import type { WordState } from './types'

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
 * Vault “ghost” / new cube (`mScore === 0` and not mastered). Matches `MasteryCube` ghost art.
 * Playback and meaning review stay on Home until the learner earns non-zero SRS progress (solid path) or gold.
 */
export function isVaultGhostCube(wordState: WordState | undefined): boolean {
  const mScore = wordState?.mScore ?? 0
  if (wordState?.masteryConfirmed) return false
  if (mScore >= 5) return false
  return mScore === 0
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

/**
 * Grey “dust” overlay strength for vault cubes (display-only). No dust for ghosts, gold, or fresh reviews.
 */
export function vaultDustOpacity(wordState: WordState | undefined, nowMs: number): number {
  if (!wordState || wordState.masteryConfirmed) return 0
  if (isVaultGhostCube(wordState)) return 0
  const m = wordState.mScore
  if (m <= 0) return 0
  const mDec = computeMDecayed({
    mScore: m,
    lastSeenAtMs: wordState.lastSeenAt,
    nowMs,
    allMeaningsMastered: wordState.masteryConfirmed,
  })
  const ratio = mDec / m
  if (ratio >= 0.9) return 0
  return Math.min(0.7, (0.9 - ratio) * 2.2)
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
