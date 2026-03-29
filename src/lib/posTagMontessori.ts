import { POS_TAGS, type PosTag } from './posTag'

/**
 * Phase 1a — Montessori grammar-symbol colors adapted for dark UI / video overlays.
 * Classic materials use e.g. black triangle for noun on white paper; here we use light neutrals
 * and saturated accents so swatches stay legible on black.
 */
const HEX: Record<PosTag, string> = {
  noun: '#e2e8f0',
  verb: '#ef4444',
  adjective: '#3b82f6',
  classifier: '#14b8a6',
  adverb: '#f97316',
  conjunction: '#ec4899',
  preposition: '#22c55e',
  pronoun: '#a855f7',
  interjection: '#eab308',
  multi_class: '#94a3b8',
}

const LABEL: Record<PosTag, string> = {
  noun: 'Noun',
  verb: 'Verb',
  adjective: 'Adjective',
  classifier: 'Classifier',
  adverb: 'Adverb',
  conjunction: 'Conjunction',
  preposition: 'Preposition',
  pronoun: 'Pronoun',
  interjection: 'Interjection',
  multi_class: 'Multi-class',
}

export function montessoriHexForPosTag(tag: PosTag): string {
  return HEX[tag]
}

/** Tailwind classes for hanzi on solid Montessori tile (light tiles → dark text). */
export function montessoriTileTextClassForHex(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return 'text-white drop-shadow-md'
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return luminance > 0.58 ? 'text-slate-900' : 'text-white drop-shadow-md'
}

export function posTagDisplayLabel(tag: PosTag): string {
  return LABEL[tag]
}

export function emptyPosTagCounts(): Record<PosTag, number> {
  const o = {} as Record<PosTag, number>
  for (const t of POS_TAGS) o[t] = 0
  return o
}

export const POS_TAG_MONTESSORI_LEGEND = POS_TAGS.map((tag) => ({
  tag,
  label: LABEL[tag],
  hex: HEX[tag],
}))
