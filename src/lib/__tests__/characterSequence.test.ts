import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CC1_RARITY,
  filterCc1WordsByQuota,
  getAvailableQuota,
  loadLocalCc1Sequence,
  saveLocalCc1Sequence,
  weightedShuffleIds,
} from '../characterSequence'
import type { WordMetadata, WordState } from '../types'

const makeWord = (id: string): WordMetadata =>
  ({
    word_id: id,
    character: id,
    pinyin: '',
    l1_meanings: {},
    video_url: '',
    base_complexity: 1,
    dependencies: [],
  }) as WordMetadata

const makeState = (sessionsSeen: number): WordState => ({
  word_id: '',
  mScore: sessionsSeen > 0 ? 1 : 0,
  masteryConfirmed: false,
  consecutiveLoop1NoTapSessions: 0,
  lastLoop1NoTapAt: null,
  lastSeenAt: null,
  sessionsSeen,
})

describe('getAvailableQuota', () => {
  it('returns 20 for a cold user with no bonuses', () => {
    expect(getAvailableQuota({ sessionsServed: 0, first20Seen: 0, first20Tapped: 0, alphaFrozen: false, alphaValue: 1 })).toBe(20)
  })

  it('adds bonusCardsUnlocked', () => {
    expect(getAvailableQuota({ sessionsServed: 0, first20Seen: 0, first20Tapped: 0, alphaFrozen: false, alphaValue: 1, bonusCardsUnlocked: 10 })).toBe(30)
  })

  it('adds streakBonusCards', () => {
    expect(getAvailableQuota({ sessionsServed: 0, first20Seen: 0, first20Tapped: 0, alphaFrozen: false, alphaValue: 1, streakBonusCards: 20 })).toBe(40)
  })

  it('adds both bonuses together', () => {
    expect(getAvailableQuota({ sessionsServed: 0, first20Seen: 0, first20Tapped: 0, alphaFrozen: false, alphaValue: 1, bonusCardsUnlocked: 10, streakBonusCards: 30 })).toBe(60)
  })
})

describe('saveLocalCc1Sequence / loadLocalCc1Sequence', () => {
  afterEach(() => {
    localStorage.removeItem('tiktokchinese_cc1_character_sequence')
  })

  it('round-trips an array of word_ids', () => {
    const seq = ['a', 'b', 'c']
    saveLocalCc1Sequence(seq)
    expect(loadLocalCc1Sequence()).toEqual(seq)
  })

  it('returns null when nothing stored', () => {
    expect(loadLocalCc1Sequence()).toBeNull()
  })

  it('returns null for invalid stored data', () => {
    localStorage.setItem('tiktokchinese_cc1_character_sequence', 'not-json')
    expect(loadLocalCc1Sequence()).toBeNull()
  })
})

describe('CC1_RARITY', () => {
  it('covers exactly 66 entries', () => {
    expect(Object.keys(CC1_RARITY)).toHaveLength(66)
  })

  it('only uses valid tier values', () => {
    const valid = new Set(['common', 'moderate', 'rare'])
    for (const tier of Object.values(CC1_RARITY)) {
      expect(valid.has(tier)).toBe(true)
    }
  })

  it('has 21 common, 25 moderate, and 20 rare characters', () => {
    const counts = { common: 0, moderate: 0, rare: 0 }
    for (const tier of Object.values(CC1_RARITY)) counts[tier]++
    expect(counts.common).toBe(21)
    expect(counts.moderate).toBe(25)
    expect(counts.rare).toBe(20)
  })
})

describe('weightedShuffleIds', () => {
  it('returns a permutation of the input', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    const result = weightedShuffleIds(ids, () => 1)
    expect(result).toHaveLength(ids.length)
    expect([...result].sort()).toEqual([...ids].sort())
  })

  it('does not mutate the input array', () => {
    const ids = ['x', 'y', 'z']
    const copy = [...ids]
    weightedShuffleIds(ids, () => 2)
    expect(ids).toEqual(copy)
  })

  it('places higher-weight items before lower-weight items when Math.random is constant', () => {
    // With a constant random value, key = r^(1/w):
    //   weight 3 → r^(1/3) > r^(1/2) > r^(1/1)  for any 0 < r < 1
    // So common > moderate > rare in key order → sorted descending: common first.
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    try {
      const ids = ['rare-a', 'common-a', 'moderate-a', 'rare-b', 'common-b']
      const weights: Record<string, number> = {
        'common-a': 3,
        'common-b': 3,
        'moderate-a': 2,
        'rare-a': 1,
        'rare-b': 1,
      }
      const result = weightedShuffleIds(ids, (id) => weights[id] ?? 1)
      // All common items must appear before all rare items
      const firstRare = result.findIndex((id) => id.startsWith('rare-'))
      const lastCommon = result.map((id, i) => ({ id, i }))
        .filter(({ id }) => id.startsWith('common-'))
        .map(({ i }) => i)
        .at(-1)!
      expect(lastCommon).toBeLessThan(firstRare)
    } finally {
      vi.restoreAllMocks()
    }
  })
})

describe('filterCc1WordsByQuota', () => {
  const words = ['w1', 'w2', 'w3', 'w4', 'w5'].map(makeWord)
  const sequence = ['w1', 'w2', 'w3', 'w4', 'w5']

  it('returns words within quota in sequence order', () => {
    const result = filterCc1WordsByQuota(words, sequence, 3, {})
    expect(result.map((w) => w.word_id)).toEqual(['w1', 'w2', 'w3'])
  })

  it('always includes watched words even outside quota', () => {
    const wordStates: Record<string, WordState | undefined> = {
      w5: { ...makeState(1), word_id: 'w5' },
    }
    const result = filterCc1WordsByQuota(words, sequence, 2, wordStates)
    expect(result.map((w) => w.word_id)).toEqual(['w1', 'w2', 'w5'])
  })

  it('does not duplicate a word that is both in quota and watched', () => {
    const wordStates: Record<string, WordState | undefined> = {
      w1: { ...makeState(3), word_id: 'w1' },
    }
    const result = filterCc1WordsByQuota(words, sequence, 2, wordStates)
    expect(result.filter((w) => w.word_id === 'w1')).toHaveLength(1)
  })

  it('returns all words when quota exceeds sequence length', () => {
    const result = filterCc1WordsByQuota(words, sequence, 100, {})
    expect(result).toHaveLength(5)
  })

  it('returns only watched words when quota is 0', () => {
    const wordStates: Record<string, WordState | undefined> = {
      w3: { ...makeState(2), word_id: 'w3' },
    }
    const result = filterCc1WordsByQuota(words, sequence, 0, wordStates)
    expect(result.map((w) => w.word_id)).toEqual(['w3'])
  })

  it('silently skips sequence ids not in cc1Words', () => {
    const result = filterCc1WordsByQuota(words, ['x99', 'w1', 'w2'], 3, {})
    expect(result.map((w) => w.word_id)).toEqual(['w1', 'w2'])
  })
})
