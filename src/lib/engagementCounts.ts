import { combineDisplayedGlobalCounts } from './engagementDisplayCounts'
import { getSupabaseFunctionsBaseUrl } from './supabaseFunctionsUrl'

const CACHE_KEY = 'tiktokchinese_engagement_counts_v1'
const TTL_MS = 5 * 60 * 1000

type CacheEntry = { likes: number; saves: number; shares?: number; fetched_at: number }
type CountCache = Record<string, CacheEntry>

function readCache(): CountCache {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return {}
    const j = JSON.parse(raw) as unknown
    if (!j || typeof j !== 'object' || Array.isArray(j)) return {}
    return j as CountCache
  } catch {
    return {}
  }
}

function writeCache(c: CountCache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c))
  } catch {
    /* ignore */
  }
}

/** Drop cached global counts for one word (e.g. after local like/save toggle). */
export function invalidateEngagementCountCache(wordId: string): void {
  const wid = wordId.trim()
  if (!wid) return
  const c = readCache()
  delete c[wid]
  writeCache(c)
}

export type GlobalEngagementCounts =
  | { ok: true; likes: number; saves: number; shares: number }
  | { ok: false }

function combineFromRaw(
  wordId: string,
  rawLikes: number,
  rawSaves: number,
  rawShares: number,
): GlobalEngagementCounts {
  const d = combineDisplayedGlobalCounts(wordId, rawLikes, rawSaves, rawShares)
  return { ok: true, likes: d.likes, saves: d.saves, shares: d.shares }
}

/** After a failed `get-counts`, reuse last cached **raw** API numbers (any age) with the same combine step as success. */
function fallbackFromStaleCache(wid: string, cache: CountCache): GlobalEngagementCounts | null {
  const stale = cache[wid]
  if (!stale) return null
  return combineFromRaw(wid, stale.likes, stale.saves, stale.shares ?? 0)
}

/**
 * Global like/save totals for a word — 5 min local cache; Edge `get-counts` on miss.
 * Cache stores **raw** API integers; success and stale fallback both use `combineDisplayedGlobalCounts`.
 * If `get-counts` fails and there is no cached raw row for this word, returns `{ ok: false }`.
 */
export async function getGlobalEngagementCounts(wordId: string): Promise<GlobalEngagementCounts> {
  const wid = wordId.trim()
  if (!wid) return { ok: false }

  const cache = readCache()
  const hit = cache[wid]
  if (hit && Date.now() - hit.fetched_at < TTL_MS) {
    return combineFromRaw(wid, hit.likes, hit.saves, hit.shares ?? 0)
  }

  const base = getSupabaseFunctionsBaseUrl()
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!base || !anon?.trim()) {
    return fallbackFromStaleCache(wid, cache) ?? { ok: false }
  }

  try {
    const res = await fetch(`${base}/get-counts?word_id=${encodeURIComponent(wid)}`, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${anon}`,
        apikey: anon,
      },
    })
    const rawText = await res.text()
    if (!res.ok) {
      if (import.meta.env.DEV) {
        console.warn('[engagementCounts] get-counts HTTP', res.status, rawText.slice(0, 200))
      }
      return fallbackFromStaleCache(wid, cache) ?? { ok: false }
    }
    let j: { likes?: unknown; saves?: unknown; shares?: unknown }
    try {
      j = JSON.parse(rawText) as { likes?: unknown; saves?: unknown; shares?: unknown }
    } catch {
      return fallbackFromStaleCache(wid, cache) ?? { ok: false }
    }
    if (typeof j.likes !== 'number' || typeof j.saves !== 'number') {
      return fallbackFromStaleCache(wid, cache) ?? { ok: false }
    }

    const rawLikes = j.likes
    const rawSaves = j.saves
    const rawShares = typeof j.shares === 'number' ? j.shares : 0
    cache[wid] = { likes: rawLikes, saves: rawSaves, shares: rawShares, fetched_at: Date.now() }
    writeCache(cache)
    return combineFromRaw(wid, rawLikes, rawSaves, rawShares)
  } catch {
    return fallbackFromStaleCache(wid, cache) ?? { ok: false }
  }
}
