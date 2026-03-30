import { describe, expect, it } from 'vitest'
import { crossedIntoSolidTier } from '../solidThresholdGamification'
import type { WordState } from '../types'

function ws(p: Partial<WordState> & Pick<WordState, 'word_id'>): WordState {
  return {
    word_id: p.word_id,
    mScore: p.mScore ?? 0,
    masteryConfirmed: p.masteryConfirmed ?? false,
    consecutiveLoop1NoTapSessions: p.consecutiveLoop1NoTapSessions ?? 0,
    lastLoop1NoTapAt: p.lastLoop1NoTapAt ?? null,
    lastSeenAt: p.lastSeenAt ?? null,
    sessionsSeen: p.sessionsSeen ?? 0,
  }
}

describe('crossedIntoSolidTier', () => {
  it('true when mScore crosses from below 5 to 5+ and not gold latched', () => {
    expect(
      crossedIntoSolidTier(ws({ word_id: 'a', mScore: 4.9 }), ws({ word_id: 'a', mScore: 5 })),
    ).toBe(true)
  })

  it('false when already solid', () => {
    expect(
      crossedIntoSolidTier(ws({ word_id: 'a', mScore: 5 }), ws({ word_id: 'a', mScore: 6 })),
    ).toBe(false)
  })

  it('false when mastery confirmed', () => {
    expect(
      crossedIntoSolidTier(
        ws({ word_id: 'a', mScore: 4 }),
        ws({ word_id: 'a', mScore: 5, masteryConfirmed: true }),
      ),
    ).toBe(false)
  })
})
