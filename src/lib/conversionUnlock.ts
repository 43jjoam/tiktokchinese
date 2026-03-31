import { DECK_CATALOG } from '../data/deckCatalog'
import type { DeckInfo } from './deckService'
import { BUILTIN_CHINESE_CHARACTERS_1 } from './deckService'
import { getWordsForDeck } from './deckWords'
import type { WordState } from './types'

/** After sign-in: show conversion when this many distinct CC1 character videos have been watched at least once. */
export const CONVERSION_UNIQUE_CC1_THRESHOLD = 20

/** Marketing total for HSK 1 bundle + Character 1 deck (videos + characters). */
export const CONVERSION_HSK1_TOTAL_VIDEOS_CHARS = 166

const hsk1Catalog = DECK_CATALOG.find((c) => c.key === 'hsk-1')

export function getHsk1ShopUrl(): string {
  return hsk1Catalog?.shopUrl ?? 'https://bestling.net/products/hsk-1-digital-flashcards'
}

/** Free Character 1 pool size (for “X of Y” style copy). */
export function getCc1PoolSize(): number {
  return getWordsForDeck(BUILTIN_CHINESE_CHARACTERS_1).length
}

export function getCc1WordIds(): string[] {
  return getWordsForDeck(BUILTIN_CHINESE_CHARACTERS_1).map((w) => w.word_id)
}

export function countUniqueCc1VideosSeen(
  wordStates: Record<string, WordState>,
  cc1WordIds: readonly string[],
): number {
  let n = 0
  for (const id of cc1WordIds) {
    const s = wordStates[id]
    if (s && s.sessionsSeen > 0) n++
  }
  return n
}

export function hasActivatedHsk1(activatedDecks: DeckInfo[]): boolean {
  if (!hsk1Catalog) return false
  return activatedDecks.some((d) => hsk1Catalog.matches(d))
}

/** Next local midnight (start of tomorrow) for “come back tomorrow” / soft dismiss. */
export function startOfNextLocalDayMs(): number {
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  t.setDate(t.getDate() + 1)
  return t.getTime()
}
