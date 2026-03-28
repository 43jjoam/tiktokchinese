import { words as wordDataset } from '../data/words'
import { DECK_CATALOG } from '../data/deckCatalog'
import type { DeckInfo } from './deckService'
import type { WordMetadata } from './types'
import { BUILTIN_CHINESE_CHARACTERS_1 } from './deckService'

/** Dispatch after Library activation so Home / Profile refresh the merged word list. */
export const ACTIVATED_DECKS_CHANGED_EVENT = 'tiktokchinese:activated-decks-changed'

const PURCHASABLE_CATALOG_KEYS = new Set(DECK_CATALOG.map((c) => c.key))

/** Words tagged for purchasable Library decks (e.g. hsk-1) must not appear in the free character feed. */
function isTaggedForPurchasableDeck(w: WordMetadata): boolean {
  const keys = w.deck_catalog_keys
  if (!keys?.length) return false
  return keys.some((k) => PURCHASABLE_CATALOG_KEYS.has(k))
}

function characterWords(): WordMetadata[] {
  return wordDataset.filter(
    (w) =>
      (!w.content_type || w.content_type === 'character') && !isTaggedForPurchasableDeck(w),
  )
}

export function getWordsForDeck(deck: DeckInfo): WordMetadata[] {
  const chars = characterWords()
  if (deck.id === BUILTIN_CHINESE_CHARACTERS_1.id) return chars

  const catalogEntry = DECK_CATALOG.find((c) => c.matches(deck))
  if (!catalogEntry) return []

  const tagged = wordDataset.filter((w) => w.deck_catalog_keys?.includes(catalogEntry.key))
  if (tagged.length > 0) return tagged

  return []
}

/**
 * Home feed + profile scope: free Chinese Characters 1 always; purchased decks (e.g. HSK 1) only
 * when present in `activatedDecks`. Dedupes by word_id.
 */
export function buildHomeFeedWords(activatedDecks: DeckInfo[]): WordMetadata[] {
  const builtin = getWordsForDeck(BUILTIN_CHINESE_CHARACTERS_1)
  const seen = new Set(builtin.map((w) => w.word_id))
  const out = [...builtin]

  for (const deck of activatedDecks) {
    if (deck.id === BUILTIN_CHINESE_CHARACTERS_1.id) continue
    for (const w of getWordsForDeck(deck)) {
      if (seen.has(w.word_id)) continue
      seen.add(w.word_id)
      out.push(w)
    }
  }
  return out
}
