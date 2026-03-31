import type { WordMetadata, WordState } from './types'

/** 0 = mastered / gold cube, 1 = in progress (solid POS), 2 = new (ghost). */
export function cubeVaultSortTier(st: WordState | undefined): 0 | 1 | 2 {
  const mScore = st?.mScore ?? 0
  const mastered = Boolean(st?.masteryConfirmed) || mScore >= 5
  if (mastered) return 0
  if (mScore === 0) return 2
  return 1
}

/**
 * Mastered first, in progress second, new last; then `zh-Hans` character order.
 */
export function sortWordsByCubeTier(
  words: WordMetadata[],
  wordStates: Record<string, WordState | undefined>,
): WordMetadata[] {
  const collator = new Intl.Collator('zh-Hans-CN')
  return [...words].sort((a, b) => {
    const ta = cubeVaultSortTier(wordStates[a.word_id])
    const tb = cubeVaultSortTier(wordStates[b.word_id])
    if (ta !== tb) return ta - tb
    return collator.compare(a.character, b.character)
  })
}

/** Bands for Library deck contents — same tiers as `MasteryCube` / grammar vault. */
export type DeckCubeBands = {
  mastered: WordMetadata[]
  inProgress: WordMetadata[]
  newWords: WordMetadata[]
  /** New (ghost) first, in progress middle, mastered last; zh-Hans tie-break. */
  flat: WordMetadata[]
}

/**
 * Library deck cube order: ghost (new) → solid POS (in progress) → gold (mastered).
 * Matches `GrammarColorsMontessoriPage` / `MasteryCube` ghost vs solid vs gold.
 */
export function bandDeckWordsByCubeTier(
  words: WordMetadata[],
  wordStates: Record<string, WordState | undefined>,
): DeckCubeBands {
  const mastered: WordMetadata[] = []
  const inProgress: WordMetadata[] = []
  const newWords: WordMetadata[] = []
  const sortZh = (a: WordMetadata, b: WordMetadata) =>
    a.character.localeCompare(b.character, 'zh-Hans-CN')
  for (const w of words) {
    const st = wordStates[w.word_id]
    const mScore = st?.mScore ?? 0
    const isMastered = Boolean(st?.masteryConfirmed) || mScore >= 5
    if (isMastered) mastered.push(w)
    else if (mScore === 0) newWords.push(w)
    else inProgress.push(w)
  }
  mastered.sort(sortZh)
  inProgress.sort(sortZh)
  newWords.sort(sortZh)
  const flat = [...newWords, ...inProgress, ...mastered]
  return { mastered, inProgress, newWords, flat }
}
