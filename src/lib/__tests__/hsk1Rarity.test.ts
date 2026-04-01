import { describe, expect, it } from 'vitest'
import {
  getHsk1EarliestAppearanceDay,
  getHsk1RarityWeight,
  HSK1_EARLIEST_APPEARANCE_DAY,
  HSK1_RARITY,
} from '../hsk1Rarity'

describe('HSK1_RARITY', () => {
  it('covers exactly 99 entries', () => {
    expect(Object.keys(HSK1_RARITY)).toHaveLength(99)
  })

  it('only uses valid tier values', () => {
    const valid = new Set(['common', 'moderate', 'rare'])
    for (const tier of Object.values(HSK1_RARITY)) {
      expect(valid.has(tier)).toBe(true)
    }
  })

  it('has 35 common, 34 moderate, and 30 rare words', () => {
    const counts = { common: 0, moderate: 0, rare: 0 }
    for (const tier of Object.values(HSK1_RARITY)) counts[tier]++
    expect(counts.common).toBe(35)
    expect(counts.moderate).toBe(34)
    expect(counts.rare).toBe(30)
  })
})

describe('HSK1_EARLIEST_APPEARANCE_DAY', () => {
  it('covers all 99 word_ids', () => {
    expect(Object.keys(HSK1_EARLIEST_APPEARANCE_DAY)).toHaveLength(99)
  })

  it('common words are all day 1', () => {
    for (const [id, tier] of Object.entries(HSK1_RARITY)) {
      if (tier === 'common') {
        expect(HSK1_EARLIEST_APPEARANCE_DAY[id]).toBe(1)
      }
    }
  })

  it('moderate words are days 3–5', () => {
    for (const [id, tier] of Object.entries(HSK1_RARITY)) {
      if (tier === 'moderate') {
        const day = HSK1_EARLIEST_APPEARANCE_DAY[id]
        expect(day).toBeGreaterThanOrEqual(3)
        expect(day).toBeLessThanOrEqual(5)
      }
    }
  })

  it('rare words are days 7–14', () => {
    for (const [id, tier] of Object.entries(HSK1_RARITY)) {
      if (tier === 'rare') {
        const day = HSK1_EARLIEST_APPEARANCE_DAY[id]
        expect(day).toBeGreaterThanOrEqual(7)
        expect(day).toBeLessThanOrEqual(14)
      }
    }
  })

  it('every HSK1_RARITY entry has a corresponding appearance day', () => {
    for (const id of Object.keys(HSK1_RARITY)) {
      expect(HSK1_EARLIEST_APPEARANCE_DAY[id]).toBeDefined()
    }
  })
})

describe('getHsk1RarityWeight', () => {
  it('returns 3 for common words', () => {
    expect(getHsk1RarityWeight('hsk1-person-22')).toBe(3)
  })

  it('returns 2 for moderate words', () => {
    expect(getHsk1RarityWeight('hsk1-air-122')).toBe(2)
  })

  it('returns 1 for rare words', () => {
    expect(getHsk1RarityWeight('hsk1-appearance-or-type-118')).toBe(1)
  })

  it('returns 1 for unknown ids', () => {
    expect(getHsk1RarityWeight('nonexistent-id')).toBe(1)
  })
})

describe('getHsk1EarliestAppearanceDay', () => {
  it('returns 1 for a common word', () => {
    expect(getHsk1EarliestAppearanceDay('hsk1-person-22')).toBe(1)
  })

  it('returns a day in 3–5 for a moderate word', () => {
    const day = getHsk1EarliestAppearanceDay('hsk1-air-122')
    expect(day).toBeGreaterThanOrEqual(3)
    expect(day).toBeLessThanOrEqual(5)
  })

  it('returns a day in 7–14 for a rare word', () => {
    const day = getHsk1EarliestAppearanceDay('hsk1-appearance-or-type-118')
    expect(day).toBeGreaterThanOrEqual(7)
    expect(day).toBeLessThanOrEqual(14)
  })

  it('returns 1 for unknown ids', () => {
    expect(getHsk1EarliestAppearanceDay('nonexistent-id')).toBe(1)
  })
})
