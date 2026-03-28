import type { WordMetadata } from './types'

export function chineseGlyphCount(s: string): number {
  return [...s.trim()].length
}

export type WordContentKind = 'grammar' | 'vocabulary' | 'character'

/** Matches Profile meaning buckets: grammar tag → grammar; multi-glyph → vocabulary; else character. */
export function getWordContentKind(w: WordMetadata): WordContentKind {
  if (w.content_type === 'grammar') return 'grammar'
  if (chineseGlyphCount(w.character) > 1) return 'vocabulary'
  return 'character'
}
