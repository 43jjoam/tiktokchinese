import { describe, expect, it } from 'vitest'
import { BUILTIN_CHINESE_CHARACTERS_1 } from '../deckService'
import { wordStateSeed } from '../memoryEngine'
import {
  countUniqueCc1VideosSeen,
  getCc1WordIds,
  getConversionUniqueCc1Threshold,
  getHardCapUniqueCc1,
  hasActivatedHsk1,
  isFinalGateUniqueCc1,
} from '../conversionUnlock'
import { DEFAULT_STUDY_META } from '../storage'

describe('conversionUnlock', () => {
  it('counts unique CC1 words with sessionsSeen > 0', () => {
    const ids = getCc1WordIds()
    expect(ids.length).toBeGreaterThan(0)
    const a = ids[0]!
    const b = ids[1] ?? a
    const seen = wordStateSeed({ word_id: a })
    seen.sessionsSeen = 1
    const unseen = wordStateSeed({ word_id: b })
    unseen.sessionsSeen = 0
    const wordStates = { [a]: seen, [b]: unseen }
    expect(countUniqueCc1VideosSeen(wordStates, ids)).toBe(1)
  })

  it('getConversionUniqueCc1Threshold: 20 base; +10 if referred (fallback); uses bonus_cards_unlocked + streak', () => {
    expect(getConversionUniqueCc1Threshold({ ...DEFAULT_STUDY_META })).toBe(20)
    // Referred but server bonus not yet synced → fallback +10
    expect(
      getConversionUniqueCc1Threshold({
        ...DEFAULT_STUDY_META,
        referredByUserId: '550e8400-e29b-41d4-a716-446655440000',
      }),
    ).toBe(30)
    // Server bonus synced (bonusCardsUnlocked = 10): same result
    expect(
      getConversionUniqueCc1Threshold({
        ...DEFAULT_STUDY_META,
        bonusCardsUnlocked: 10,
      }),
    ).toBe(30)
    // Streak bonus
    expect(
      getConversionUniqueCc1Threshold({
        ...DEFAULT_STUDY_META,
        streakBonusCards: 10,
      }),
    ).toBe(30)
    // Both bonus and streak
    expect(
      getConversionUniqueCc1Threshold({
        ...DEFAULT_STUDY_META,
        bonusCardsUnlocked: 10,
        streakBonusCards: 20,
      }),
    ).toBe(50)
  })

  it('isFinalGateUniqueCc1: true at 66+', () => {
    expect(isFinalGateUniqueCc1(65)).toBe(false)
    expect(isFinalGateUniqueCc1(66)).toBe(true)
    expect(isFinalGateUniqueCc1(100)).toBe(true)
  })

  it('getHardCapUniqueCc1: 50 until you refer; 66 after first referral', () => {
    expect(getHardCapUniqueCc1({ ...DEFAULT_STUDY_META })).toBe(50)
    expect(getHardCapUniqueCc1({ ...DEFAULT_STUDY_META, referralCount: 1 })).toBe(66)
  })

  it('hasActivatedHsk1 matches catalog deck', () => {
    expect(hasActivatedHsk1([])).toBe(false)
    expect(
      hasActivatedHsk1([
        {
          id: BUILTIN_CHINESE_CHARACTERS_1.id,
          name: 'Chinese Characters 1',
          cover_image_url: '',
          shopify_url: null,
        },
      ]),
    ).toBe(false)
    expect(
      hasActivatedHsk1([
        {
          id: '4d0a4205-8770-4c0e-ad4c-90ea8401eea9',
          name: 'HSK 1',
          cover_image_url: '',
          shopify_url: null,
        },
      ]),
    ).toBe(true)
  })
})
