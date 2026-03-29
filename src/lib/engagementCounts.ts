import { getSupabaseFunctionsBaseUrl } from './supabaseFunctionsUrl'

const CACHE_KEY = 'tiktokchinese_engagement_counts_v1'
const TTL_MS = 5 * 60 * 1000

type CacheEntry = { likes: number; saves: number; fetched_at: number }
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

export type GlobalEngagementCounts = { ok: true; likes: number; saves: number } | { ok: false }

/**
 * Global like/save totals for a word — 5 min local cache; Edge `get-counts` on miss.
 * On failure returns `{ ok: false }` so UI shows "—" (honest, not stale).
 */
export async function getGlobalEngagementCounts(wordId: string): Promise<GlobalEngagementCounts> {
  const wid = wordId.trim()
  if (!wid) return { ok: false }

  const cache = readCache()
  const hit = cache[wid]
  if (hit && Date.now() - hit.fetched_at < TTL_MS) {
    return { ok: true, likes: hit.likes, saves: hit.saves }
  }

  const base = getSupabaseFunctionsBaseUrl()
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!base || !anon?.trim()) return { ok: false }

  try {
    const res = await fetch(`${base}/get-counts?word_id=${encodeURIComponent(wid)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${anon}`,
        apikey: anon,
      },
    })
    if (!res.ok) return { ok: false }
    const j = (await res.json()) as { likes?: unknown; saves?: unknown }
    if (typeof j.likes !== 'number' || typeof j.saves !== 'number') return { ok: false }

    cache[wid] = { likes: j.likes, saves: j.saves, fetched_at: Date.now() }
    writeCache(cache)
    return { ok: true, likes: j.likes, saves: j.saves }
  } catch {
    return { ok: false }
  }
}
