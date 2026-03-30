import { describe, expect, it } from 'vitest'
import { mergedGiftableWords } from '../giftableWordList'
import { inferPosTag, POS_TAG_INFER_OVERRIDES, resolvePosTag } from '../inferPosTag'
import { isPosTag } from '../posTag'

describe('POS tag resolution — giftable catalog (#4 LLM / Montessori check)', () => {
  const list = mergedGiftableWords()

  it('merged giftable list is non-empty', () => {
    expect(list.length).toBeGreaterThan(0)
  })

  it('every giftable word resolves to a closed-set pos_tag', () => {
    for (const w of list) {
      const t = resolvePosTag(w)
      expect(isPosTag(t), `${w.word_id} resolved to invalid "${t}"`).toBe(true)
    }
  })

  it('inferPosTag overrides match entries present in the giftable catalog', () => {
    const byId = new Map(list.map((w) => [w.word_id, w]))
    for (const [wordId, expected] of Object.entries(POS_TAG_INFER_OVERRIDES)) {
      const w = byId.get(wordId)
      expect(w, `override ${wordId} not in giftable catalog — drop it or add the word`).toBeDefined()
      expect(inferPosTag(w!)).toBe(expected)
    }
  })
})
