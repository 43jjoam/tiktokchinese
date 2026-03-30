import { describe, expect, it } from 'vitest'
import { computeMDecayed, deriveMasteryBlockTier, M_DECAY_LAMBDA_PER_HOUR } from '../masteryBlockTier'

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
