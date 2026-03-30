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
