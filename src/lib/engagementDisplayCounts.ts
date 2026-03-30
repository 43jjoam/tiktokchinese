/**
 * Social-proof display counts: stable per-word floors plus real totals from the API.
 * Server still stores true counts; this only affects what we show and optimistic UI deltas.
 *
 * Floors (deterministic per word_id):
 * - Likes: 100–2000
 * - Saves: 10%–50% of like floor (strictly below likes)
 * - Shares: 2%–10% of like floor (strictly below saves)
 */

function stableUint32Hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function getStableEngagementFloors(wordId: string): {
  likesFloor: number
  savesFloor: number
  sharesFloor: number
} {
  const wid = wordId.trim()
  if (!wid) {
    return { likesFloor: 1000, savesFloor: 250, sharesFloor: 50 }
  }

  const h1 = stableUint32Hash(`${wid}:engLikes`)
  const h2 = stableUint32Hash(`${wid}:engSaves`)
  const h3 = stableUint32Hash(`${wid}:engShares`)

  // 100–2000 inclusive (1901 values)
  const likesFloor = 100 + (h1 % 1901)

  // Saves: 10%–50% of likes (integer percent)
  const savePct = 10 + (h2 % 41)
  let savesFloor = Math.floor((likesFloor * savePct) / 100)
  savesFloor = Math.max(1, Math.min(savesFloor, likesFloor - 1))

  // Shares: 2%–10% of likes (integer percent), then keep strictly below saves
  const sharePct = 2 + (h3 % 9)
  let sharesFloor = Math.floor((likesFloor * sharePct) / 100)
  sharesFloor = Math.max(1, Math.min(sharesFloor, likesFloor - 1))
  if (sharesFloor >= savesFloor) {
    sharesFloor = Math.max(1, savesFloor - 1)
  }

  return { likesFloor, savesFloor, sharesFloor }
}

/**
 * Displayed global counts = floor + real DB totals. Keeps saves &lt; likes and shares &lt; saves.
 */
export function combineDisplayedGlobalCounts(
  wordId: string,
  realLikes: number,
  realSaves: number,
  realShares = 0,
): { likes: number; saves: number; shares: number } {
  const { likesFloor, savesFloor, sharesFloor } = getStableEngagementFloors(wordId)
  const rl = Math.max(0, Math.floor(Number(realLikes) || 0))
  const rs = Math.max(0, Math.floor(Number(realSaves) || 0))
  const rsh = Math.max(0, Math.floor(Number(realShares) || 0))

  let likes = likesFloor + rl
  let saves = savesFloor + rs

  if (saves >= likes) {
    saves = Math.max(savesFloor, likes - 1)
  }
  if (saves < savesFloor) saves = savesFloor

  const maxShare = Math.max(0, Math.min(saves - 1, likes - 1))
  let shares = Math.min(sharesFloor + rsh, maxShare)
  shares = Math.max(shares, Math.min(sharesFloor, maxShare))

  return { likes, saves, shares }
}
