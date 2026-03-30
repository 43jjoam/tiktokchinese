/**
 * Words that count for POS catalog / LLM tagging (same rule as `scripts/tag-pos-openai.ts`).
 * Giftable = has storage video path + English gloss.
 */
import { hsk1Words } from '../data/hsk1Words'
import { words } from '../data/words'
import type { WordMetadata } from './types'

export function giftableEnglishGloss(w: WordMetadata): string | null {
  const en = w.l1_meanings?.en?.trim()
  return en && en.length ? en : null
}

export function isGiftableForPosCatalog(w: WordMetadata): boolean {
  return Boolean(w.video_storage_path?.trim() && giftableEnglishGloss(w))
}

/** Merged `words` + `hsk1Words`, de-duped by `word_id`, sorted for stable batches. */
export function mergedGiftableWords(): WordMetadata[] {
  const merged = new Map<string, WordMetadata>()
  for (const w of words) {
    if (isGiftableForPosCatalog(w)) merged.set(w.word_id, w)
  }
  for (const w of hsk1Words) {
    if (isGiftableForPosCatalog(w)) merged.set(w.word_id, w)
  }
  return [...merged.values()].sort((a, b) => a.word_id.localeCompare(b.word_id))
}
