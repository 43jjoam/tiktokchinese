import { describe, expect, it } from 'vitest'
import { buildHomeFeedWords, lookupWordMetadataById, mergeDeepLinkIntoFeed } from '../deckWords'

describe('mergeDeepLinkIntoFeed', () => {
  it('prepends a known word_id from the full catalog when missing from the home feed', () => {
    const base = buildHomeFeedWords([])
    const hsk = lookupWordMetadataById('hsk1-capital-city-20')
    expect(base.some((w) => w.word_id === 'hsk1-capital-city-20')).toBe(false)
    expect(hsk).toBeDefined()
    const merged = mergeDeepLinkIntoFeed(base, 'hsk1-capital-city-20')
    expect(merged[0]?.word_id).toBe('hsk1-capital-city-20')
    expect(merged.length).toBe(base.length + 1)
  })

  it('is a no-op when already present or unknown id', () => {
    const base = buildHomeFeedWords([])
    const first = base[0]!
    expect(mergeDeepLinkIntoFeed(base, first.word_id)).toBe(base)
    expect(mergeDeepLinkIntoFeed(base, 'definitely-not-a-real-word-id-xyz')).toBe(base)
  })
})
