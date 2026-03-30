import { describe, expect, it } from 'vitest'
import { cubeVaultSortTier, sortWordsByCubeTier } from '../cubeVaultSort'
import type { WordMetadata, WordState } from '../types'

function word(id: string, character: string): WordMetadata {
  return {
    word_id: id,
    character,
    pinyin: '',
    l1_meanings: { en: '' },
    video_url: '',
    base_complexity: 1,
    dependencies: [],
  }
}

describe('cubeVaultSortTier', () => {
  it('mastered before in-progress before new', () => {
    const mastered: WordState = {
      word_id: 'a',
      mScore: 5,
      masteryConfirmed: false,
      consecutiveLoop1NoTapSessions: 0,
      lastLoop1NoTapAt: null,
      lastSeenAt: null,
      sessionsSeen: 2,
    }
    const mid: WordState = {
      word_id: 'b',
      mScore: 2,
      masteryConfirmed: false,
      consecutiveLoop1NoTapSessions: 0,
      lastLoop1NoTapAt: null,
      lastSeenAt: null,
      sessionsSeen: 1,
    }
    expect(cubeVaultSortTier(mastered)).toBe(0)
    expect(cubeVaultSortTier(mid)).toBe(1)
    expect(cubeVaultSortTier(undefined)).toBe(2)
  })

  it('masteryConfirmed is tier 0', () => {
    expect(
      cubeVaultSortTier({
        word_id: 'x',
        mScore: 0,
        masteryConfirmed: true,
        consecutiveLoop1NoTapSessions: 0,
        lastLoop1NoTapAt: null,
        lastSeenAt: null,
        sessionsSeen: 1,
      }),
    ).toBe(0)
  })
})

describe('sortWordsByCubeTier', () => {
  it('sorts by tier then zh-Hans', () => {
    const words = [word('n', '\u65b0'), word('m', '\u4e2d'), word('p', '\u4e00')]
    const states: Record<string, WordState | undefined> = {
      n: {
        word_id: 'n',
        mScore: 0,
        masteryConfirmed: false,
        consecutiveLoop1NoTapSessions: 0,
        lastLoop1NoTapAt: null,
        lastSeenAt: null,
        sessionsSeen: 0,
      },
      m: {
        word_id: 'm',
        mScore: 6,
        masteryConfirmed: false,
        consecutiveLoop1NoTapSessions: 0,
        lastLoop1NoTapAt: null,
        lastSeenAt: null,
        sessionsSeen: 2,
      },
      p: {
        word_id: 'p',
        mScore: 2,
        masteryConfirmed: false,
        consecutiveLoop1NoTapSessions: 0,
        lastLoop1NoTapAt: null,
        lastSeenAt: null,
        sessionsSeen: 1,
      },
    }
    const sorted = sortWordsByCubeTier(words, states)
    expect(sorted.map((x) => x.word_id)).toEqual(['m', 'p', 'n'])
  })
})
