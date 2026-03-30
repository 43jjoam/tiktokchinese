import type { WordMetadata } from './types'
import type { PosTag } from './posTag'

/** Homographs and other cases where gloss heuristics are wrong. Exported for LLM / CI checks. */
export const POS_TAG_INFER_OVERRIDES: Partial<Record<string, PosTag>> = {
  'M-hair-05': 'noun',
  'M-sendout-04': 'verb',
  /** Gloss has a non-`to …` chunk but both senses are verbal (understand / know-how). */
  'hsk1-know-how-to-27': 'verb',
  /** Distinct lexical senses (food vs body / surface). */
  'hsk1-noodles-174': 'multi_class',
  /** Time unit vs other “dot” senses. */
  'hsk1-oclock-to-order-dot-128': 'multi_class',
}

const PRONOUN_CHARS = new Set(['他', '她', '我', '你', '它', '您'])

/** Structural / grammatical particles — PRD has no `particle` bucket; use multi_class. */
const STRUCTURAL_PARTICLE_CHARS = new Set(['的', '了', '吗', '呢', '吧'])

/** Classic interjections when added to the library (啊, 哎, …). */
const INTERJECTION_CHARS = new Set<string>([])

/**
 * Single-character cards where the primary reading in this curriculum is adjectival
 * (stative / property), not event verbs.
 */
const ADJECTIVE_CHARS = new Set([
  '大',
  '小',
  '冷',
  '热',
  '亮',
  '明',
  '老',
  '高',
  '多',
  '对',
  '同',
  '密',
  '富',
  '疲',
  '乐',
])

const MODAL_RE = /\b(can|could|should|would|may|might|must|will|shall)\b/i
const BE_ABLE_RE = /\bbe able\b/i

function chunks(en: string): string[] {
  return en
    .split(/[;,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function chunkIsVerbish(c: string): boolean {
  return /^to\s/i.test(c) || /^to[,/]/i.test(c)
}

function glossSuggestsMultiClass(en: string): boolean {
  const ch = chunks(en)
  if (ch.length < 2) return false
  const verbish = ch.filter(chunkIsVerbish)
  const nonVerbish = ch.filter((c) => !chunkIsVerbish(c))
  return verbish.length >= 1 && nonVerbish.length >= 1
}

function glossSuggestsVerb(en: string): boolean {
  return chunks(en).some(chunkIsVerbish)
}

function glossSuggestsModalAuxiliary(en: string): boolean {
  return MODAL_RE.test(en) || BE_ABLE_RE.test(en)
}

/**
 * Best-effort POS for L1 pedagogy. Prefer `WordMetadata.pos_tag` when curated;
 * homographs (e.g. 发 hair vs send out) use `OVERRIDES`.
 */
export function inferPosTag(w: WordMetadata): PosTag {
  const byId = POS_TAG_INFER_OVERRIDES[w.word_id]
  if (byId) return byId

  const en = (w.l1_meanings?.en ?? '').trim()
  const c = w.character

  if (/measure word/i.test(en)) return 'classifier'
  if (INTERJECTION_CHARS.has(c)) return 'interjection'
  if (/particle/i.test(en) || STRUCTURAL_PARTICLE_CHARS.has(c)) return 'multi_class'
  if (PRONOUN_CHARS.has(c)) return 'pronoun'
  if (c === '不') return 'adverb'

  if (glossSuggestsMultiClass(en)) return 'multi_class'

  if (glossSuggestsModalAuxiliary(en) && !glossSuggestsVerb(en)) return 'multi_class'

  if (glossSuggestsVerb(en)) return 'verb'

  if (ADJECTIVE_CHARS.has(c)) return 'adjective'

  return 'noun'
}

export function resolvePosTag(w: WordMetadata): PosTag {
  return w.pos_tag ?? inferPosTag(w)
}
