import { words as wordDataset } from '../data/words'
import { DECK_CATALOG } from '../data/deckCatalog'
import type { DeckInfo } from './deckService'
import type { WordMetadata } from './types'
import { BUILTIN_CHINESE_CHARACTERS_1 } from './deckService'

function characterWords(): WordMetadata[] {
  return wordDataset.filter((w) => !w.content_type || w.content_type === 'character')
}

export function getWordsForDeck(deck: DeckInfo): WordMetadata[] {
  const chars = characterWords()
  if (deck.id === BUILTIN_CHINESE_CHARACTERS_1.id) return chars

  const catalogEntry = DECK_CATALOG.find((c) => c.matches(deck))
  if (!catalogEntry) return chars

  const tagged = wordDataset.filter((w) => w.deck_catalog_keys?.includes(catalogEntry.key))
  if (tagged.length > 0) return tagged

  if (catalogEntry.key === 'hsk-1') return chars
  return []
}
