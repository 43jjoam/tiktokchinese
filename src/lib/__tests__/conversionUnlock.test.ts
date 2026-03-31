import { describe, expect, it } from 'vitest'
import { BUILTIN_CHINESE_CHARACTERS_1 } from '../deckService'
import { wordStateSeed } from '../memoryEngine'
import { countUniqueCc1VideosSeen, getCc1WordIds, hasActivatedHsk1 } from '../conversionUnlock'

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
