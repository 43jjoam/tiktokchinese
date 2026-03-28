import type { WordMetadata } from './types'
import { getSupabaseClient } from './deckService'
import { clipKeyForWord } from './clipKey'
import { getDeviceHashForEngagement } from './deviceHash'

export const ENGAGEMENT_LOCAL_CHANGED_EVENT = 'tiktokchinese:engagement-local-changed'

const LOCAL_LIKED = 'tiktokchinese_engagement_liked_v1'
const LOCAL_SAVED = 'tiktokchinese_engagement_saved_v1'
const LOCAL_SHARED = 'tiktokchinese_engagement_shared_recent_v1'
/** Reserved for “shared with you” / inbox-style items (populated when backend exists). */
const LOCAL_RECEIVED = 'tiktokchinese_engagement_received_v1'
const MAX_RECENT_IDS = 200

function notifyEngagementLocalChanged() {
  try {
    window.dispatchEvent(new CustomEvent(ENGAGEMENT_LOCAL_CHANGED_EVENT))
  } catch {
    /* ignore */
  }
}

function parseIdList(key: string): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]')
    if (!Array.isArray(raw)) return []
    const out: string[] = []
    const seen = new Set<string>()
    for (const x of raw) {
      if (typeof x !== 'string' || !x.length || seen.has(x)) continue
      seen.add(x)
      out.push(x)
    }
    return out
  } catch {
    return []
  }
}

function persistIdList(key: string, ids: string[]) {
  localStorage.setItem(key, JSON.stringify(ids.slice(0, MAX_RECENT_IDS)))
  notifyEngagementLocalChanged()
}

function getLikedIdsOrdered(): string[] {
  return parseIdList(LOCAL_LIKED)
}

function likedSet(): Set<string> {
  return new Set(getLikedIdsOrdered())
}

function getSavedIdsOrdered(): string[] {
  return parseIdList(LOCAL_SAVED)
}

function savedSet(): Set<string> {
  return new Set(getSavedIdsOrdered())
}

/** All saved ids, most recently saved first. */
export function getLocalSavedWordIds(): string[] {
  return getSavedIdsOrdered()
}

export function getLocalLikedWordIds(): string[] {
  return getLikedIdsOrdered()
}

export function getLocalSharedWordIds(): string[] {
  return parseIdList(LOCAL_SHARED)
}

/** Words shared *to* the user (placeholder list until receive/share-inbox is wired). */
export function getLocalReceivedWordIds(): string[] {
  return parseIdList(LOCAL_RECEIVED)
}

export function getRecentSavedWordIds(n = 3): string[] {
  return getSavedIdsOrdered().slice(0, n)
}

export function getRecentLikedWordIds(n = 3): string[] {
  return getLikedIdsOrdered().slice(0, n)
}

export function getRecentSharedWordIds(n = 3): string[] {
  return parseIdList(LOCAL_SHARED).slice(0, n)
}

/** Call when user taps Share (local history for Profile). */
export function recordLocalShare(wordId: string): void {
  const wid = wordId.trim()
  if (!wid) return
  const ids = parseIdList(LOCAL_SHARED).filter((x) => x !== wid)
  ids.unshift(wid)
  persistIdList(LOCAL_SHARED, ids)
}

function functionsUrl(): string | null {
  const u = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL as string | undefined
  if (u?.trim()) return u.replace(/\/$/, '')
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined
  if (!base?.trim()) return null
  return `${base.replace(/\/$/, '')}/functions/v1`
}

async function invokeRecordEngagement(body: Record<string, unknown>): Promise<boolean> {
  const url = functionsUrl()
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!url || !anon) return false

  try {
    const res = await fetch(`${url}/record-engagement`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anon}`,
        apikey: anon,
      },
      body: JSON.stringify(body),
    })
    return res.ok
  } catch {
    return false
  }
}

export type EngagementSnapshot = {
  likeCount: number | null
  saveCount: number | null
  liked: boolean
  saved: boolean
  /** False when Supabase read failed or not configured — show "—" for global counts. */
  backendCountsOk: boolean
}

export async function fetchEngagementSnapshot(word: WordMetadata): Promise<EngagementSnapshot> {
  const supabase = getSupabaseClient()
  const wid = word.word_id
  const dh = await getDeviceHashForEngagement()

  const readLocal = () => ({
    liked: likedSet().has(wid),
    saved: savedSet().has(wid),
  })

  if (!supabase) {
    const L = readLocal()
    return {
      likeCount: null,
      saveCount: null,
      liked: L.liked,
      saved: L.saved,
      backendCountsOk: false,
    }
  }

  try {
    const [likeCountRes, saveCountRes, myLike, mySave] = await Promise.all([
      supabase.from('engagement_events').select('*', { count: 'exact', head: true }).eq('word_id', wid).eq('type', 'like'),
      supabase.from('engagement_events').select('*', { count: 'exact', head: true }).eq('word_id', wid).eq('type', 'save'),
      supabase
        .from('engagement_events')
        .select('id')
        .eq('word_id', wid)
        .eq('type', 'like')
        .eq('device_hash', dh)
        .maybeSingle(),
      supabase
        .from('engagement_events')
        .select('id')
        .eq('word_id', wid)
        .eq('type', 'save')
        .eq('device_hash', dh)
        .maybeSingle(),
    ])

    const le = likeCountRes.error
    const se = saveCountRes.error
    const L = readLocal()
    if (le || se) {
      return {
        likeCount: null,
        saveCount: null,
        liked: L.liked,
        saved: L.saved,
        backendCountsOk: false,
      }
    }

    return {
      likeCount: likeCountRes.count ?? 0,
      saveCount: saveCountRes.count ?? 0,
      liked: !!myLike.data || L.liked,
      saved: !!mySave.data || L.saved,
      backendCountsOk: true,
    }
  } catch {
    const L = readLocal()
    return {
      likeCount: null,
      saveCount: null,
      liked: L.liked,
      saved: L.saved,
      backendCountsOk: false,
    }
  }
}

export async function engagementSetLike(word: WordMetadata, on: boolean): Promise<void> {
  const wid = word.word_id
  let ids = getLikedIdsOrdered().filter((x) => x !== wid)
  if (on) ids.unshift(wid)
  persistIdList(LOCAL_LIKED, ids)

  const clip = clipKeyForWord(word)
  const dh = await getDeviceHashForEngagement()
  const ok = await invokeRecordEngagement({
    op: on ? 'like_set' : 'like_clear',
    word_id: wid,
    clip_key: clip,
    device_hash: dh,
  })
  if (!ok && on) {
    /* keep local optimistic liked; count may show — */
  }
}

export async function engagementSetSave(word: WordMetadata, on: boolean): Promise<void> {
  const wid = word.word_id
  let ids = getSavedIdsOrdered().filter((x) => x !== wid)
  if (on) ids.unshift(wid)
  persistIdList(LOCAL_SAVED, ids)

  const clip = clipKeyForWord(word)
  const dh = await getDeviceHashForEngagement()
  await invokeRecordEngagement({
    op: on ? 'save_set' : 'save_clear',
    word_id: wid,
    clip_key: clip,
    device_hash: dh,
  })
}

export async function engagementShareTap(word: WordMetadata): Promise<void> {
  const dh = await getDeviceHashForEngagement()
  await invokeRecordEngagement({
    op: 'share_tap',
    word_id: word.word_id,
    clip_key: clipKeyForWord(word),
    device_hash: dh,
  })
}

/** Logged on `share_success.payload.method` (stored as string in DB). */
export type ShareSuccessMethod =
  | 'web_share'
  | 'copy'
  | 'facebook'
  | 'whatsapp'
  | 'sms'
  | 'email'
  | 'instagram'
  | 'instagram_direct'

export async function engagementShareSuccess(
  word: WordMetadata,
  method: ShareSuccessMethod,
): Promise<void> {
  const dh = await getDeviceHashForEngagement()
  await invokeRecordEngagement({
    op: 'share_success',
    word_id: word.word_id,
    clip_key: clipKeyForWord(word),
    device_hash: dh,
    payload: { method },
  })
}

export function buildShareUrl(wordId: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const path = typeof window !== 'undefined' ? window.location.pathname || '/' : '/'
  return `${origin}${path}?w=${encodeURIComponent(wordId)}`
}

/** Body text for challenge shares (Web Share, SMS, etc.). */
export function buildChallengeShareText(word: WordMetadata, url: string): string {
  return `I'm gifting you a Chinese character on Chinese Flash, can you guess the meaning of it?\n\n${word.character} (${word.pinyin})\n${url}`
}

export function isNavigatorShareSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

/**
 * Web Share only exists in a [secure context](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts):
 * `https://`, `http://localhost`, `http://127.0.0.1`, etc.
 * `http://192.168.x.x` (LAN IP) is **not** secure → `navigator.share` is usually missing → our custom sheet opens instead.
 */
function devLogIfWebShareMissingDueToInsecureContext(): void {
  if (!import.meta.env.DEV) return
  if (typeof window === 'undefined') return
  if (window.isSecureContext) return
  if (isNavigatorShareSupported()) return
  console.info(
    '[Chinese Flash] Web Share is off: this URL is not a secure context (e.g. http://<LAN-ip>). ' +
      'Use https:// (tunnel/mkcert) or http://localhost to get the system share sheet.',
  )
}

export type NativeShareWordCallbacks = {
  onShared?: () => void
  /** Called when share is impossible or fails (not user dismiss). Open custom share UI. */
  onFallback: () => void
}

/**
 * Opens the OS share sheet (iOS/Android). Call directly from a click handler — do not await before this.
 */
export function tryNativeShareWordFromUserGesture(word: WordMetadata, callbacks: NativeShareWordCallbacks): boolean {
  if (!isNavigatorShareSupported()) {
    devLogIfWebShareMissingDueToInsecureContext()
    return false
  }
  const url = buildShareUrl(word.word_id)
  const text = buildChallengeShareText(word, url)
  void navigator
    .share({
      title: 'Chinese Flash',
      text,
      url,
    })
    .then(async () => {
      recordLocalShare(word.word_id)
      await engagementShareTap(word)
      await engagementShareSuccess(word, 'web_share')
      callbacks.onShared?.()
    })
    .catch((e: unknown) => {
      if ((e as { name?: string })?.name === 'AbortError') return
      callbacks.onFallback()
    })
  return true
}
