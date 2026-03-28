import type { CharacterLexicalExample, WordMetadata } from './types'
import { getWordContentKind } from './wordContentKind'

export type CompoundSource = 'bundled' | 'none'

export type ResolvedCompounds = {
  examples: CharacterLexicalExample[]
  source: CompoundSource
  attribution: string | null
}

const ATTRIBUTION_BUNDLED_DEFAULT =
  'Bundled compounds checked against CC-CEDICT-style usage (CC BY-SA 4.0).'

/**
 * Only curated in-app rows: must have phrase, pinyin, and at least one L1 gloss (en / zh-TW / th).
 * No live dictionary APIs — avoids Traditional-heavy sources and half-translated lists.
 */
export function validateBundled(raw: CharacterLexicalExample[] | undefined): CharacterLexicalExample[] {
  if (!raw?.length) return []
  const out: CharacterLexicalExample[] = []
  for (const ex of raw) {
    const zh = ex.zh?.trim()
    if (!zh || zh.length < 2) continue
    const py = ex.pinyin?.trim()
    if (!py) continue
    const m = ex.l1_meanings ?? {}
    const gloss = (m.en || m['zh-TW'] || m.th || '').trim()
    if (!gloss) continue
    out.push(ex)
    if (out.length >= 3) break
  }
  return out
}

/** Synchronous: bundled data only. Empty examples → meaning overlay hides the compound block. */
export function resolveCharacterCompounds(word: WordMetadata): ResolvedCompounds {
  if (getWordContentKind(word) !== 'character') {
    return { examples: [], source: 'none', attribution: null }
  }

  const bundled = validateBundled(word.character_lexical_examples)
  if (bundled.length > 0) {
    return {
      examples: bundled,
      source: 'bundled',
      attribution: word.dictionary_attribution?.trim() || ATTRIBUTION_BUNDLED_DEFAULT,
    }
  }

  return { examples: [], source: 'none', attribution: null }
}
