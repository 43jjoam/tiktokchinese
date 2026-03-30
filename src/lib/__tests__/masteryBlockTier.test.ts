import { describe, expect, it } from 'vitest'
import {
  computeMDecayed,
  deriveMasteryBlockTier,
  isVaultGhostCube,
  M_DECAY_LAMBDA_PER_HOUR,
  vaultDustOpacity,
} from '../masteryBlockTier'
import type { WordState } from '../types'

describe('deriveMasteryBlockTier', () => {
  it('gold when mastery confirmed', () => {
    expect(deriveMasteryBlockTier(0, true)).toBe('gold')
    expect(deriveMasteryBlockTier(2, true)).toBe('gold')
  })

  it('solid when mScore at least 5 and not mastered', () => {
    expect(deriveMasteryBlockTier(5, false)).toBe('solid')
    expect(deriveMasteryBlockTier(10, false)).toBe('solid')
  })

  it('crystallizing for mScore 3 and 4', () => {
    expect(deriveMasteryBlockTier(3, false)).toBe('crystallizing')
    expect(deriveMasteryBlockTier(4, false)).toBe('crystallizing')
  })

  it('fluid for mScore below 3', () => {
    expect(deriveMasteryBlockTier(0, false)).toBe('fluid')
    expect(deriveMasteryBlockTier(2, false)).toBe('fluid')
  })
})

describe('isVaultGhostCube', () => {
  const ws = (partial: Partial<WordState> & Pick<WordState, 'word_id'>): WordState => ({
    word_id: partial.word_id,
    mScore: partial.mScore ?? 0,
    masteryConfirmed: partial.masteryConfirmed ?? false,
    consecutiveLoop1NoTapSessions: partial.consecutiveLoop1NoTapSessions ?? 0,
    lastLoop1NoTapAt: partial.lastLoop1NoTapAt ?? null,
    lastSeenAt: partial.lastSeenAt ?? null,
    sessionsSeen: partial.sessionsSeen ?? 0,
  })

  it('true only for zero mScore and not mastered (vault ghost)', () => {
    expect(isVaultGhostCube(undefined)).toBe(true)
    expect(isVaultGhostCube(ws({ word_id: 'a', mScore: 0, masteryConfirmed: false }))).toBe(true)
    expect(isVaultGhostCube(ws({ word_id: 'b', mScore: 1, masteryConfirmed: false }))).toBe(false)
    expect(isVaultGhostCube(ws({ word_id: 'c', mScore: 5, masteryConfirmed: false }))).toBe(false)
    expect(isVaultGhostCube(ws({ word_id: 'd', mScore: 0, masteryConfirmed: true }))).toBe(false)
  })
})

describe('computeMDecayed', () => {
  it('unchanged when gold latched', () => {
    expect(
      computeMDecayed({
        mScore: 3,
        lastSeenAtMs: Date.now() - 7 * 36e5,
        nowMs: Date.now(),
        allMeaningsMastered: true,
      }),
    ).toBe(3)
  })

  it('unchanged when lastSeenAt missing', () => {
    expect(
      computeMDecayed({
        mScore: 4,
        lastSeenAtMs: null,
        nowMs: Date.now(),
        allMeaningsMastered: false,
      }),
    ).toBe(4)
  })

  it('decays over time when not gold', () => {
    const now = Date.now()
    const hours = 48
    const prev = computeMDecayed({
      mScore: 10,
      lastSeenAtMs: now - hours * 36e5,
      nowMs: now,
      allMeaningsMastered: false,
    })
    expect(prev).toBeLessThan(10)
    expect(prev).toBeCloseTo(10 * Math.exp(-M_DECAY_LAMBDA_PER_HOUR * hours), 5)
  })
})

describe('vaultDustOpacity', () => {
  const base = (partial: Partial<WordState> & Pick<WordState, 'word_id'>): WordState => ({
    word_id: partial.word_id,
    mScore: partial.mScore ?? 5,
    masteryConfirmed: partial.masteryConfirmed ?? false,
    consecutiveLoop1NoTapSessions: partial.consecutiveLoop1NoTapSessions ?? 0,
    lastLoop1NoTapAt: partial.lastLoop1NoTapAt ?? null,
    lastSeenAt: partial.lastSeenAt ?? Date.now(),
    sessionsSeen: partial.sessionsSeen ?? 1,
  })

  it('is zero for ghost and gold', () => {
    expect(vaultDustOpacity(undefined, Date.now())).toBe(0)
    expect(vaultDustOpacity(base({ word_id: 'a', mScore: 0 }), Date.now())).toBe(0)
    expect(vaultDustOpacity(base({ word_id: 'b', masteryConfirmed: true }), Date.now())).toBe(0)
  })

  it('ramps up when display decay lags persisted mScore', () => {
    const now = Date.now()
    const lastSeen = now - 72 * 36e5
    const dusty = vaultDustOpacity(base({ word_id: 'c', mScore: 6, lastSeenAt: lastSeen }), now)
    const fresh = vaultDustOpacity(base({ word_id: 'c', mScore: 6, lastSeenAt: now }), now)
    expect(dusty).toBeGreaterThan(fresh)
    expect(fresh).toBe(0)
  })
})
