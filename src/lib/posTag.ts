/**
 * Closed set for word_metadata.pos_tag — aligned with PRD §3.3 (Montessori color wheel).
 * Note: structural particles (的, 了, …) map to multi_class here; interjection is for 啊, 哎, etc.
 */
export const POS_TAGS = [
  'noun',
  'verb',
  'adjective',
  'classifier',
  'adverb',
  'conjunction',
  'preposition',
  'pronoun',
  'interjection',
  'multi_class',
] as const

export type PosTag = (typeof POS_TAGS)[number]

export function isPosTag(s: string): s is PosTag {
  return (POS_TAGS as readonly string[]).includes(s)
}
