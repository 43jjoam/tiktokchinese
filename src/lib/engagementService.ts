import type { WordMetadata } from './types'
import { getSupabaseClient } from './deckService'
import { clipKeyForWord } from './clipKey'
import { getDeviceHashForEngagement } from './deviceHash'
import { getGlobalEngagementCounts, invalidateEngagementCountCache } from './engagementCounts'
import { getSupabaseFunctionsBaseUrl } from './supabaseFunctionsUrl'
import { enqueueSyncOutboxJob } from './syncOutbox'

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

/** Server order first, then local-only ids (same device, not yet on server). */
function mergeServerAndLocalWordOrder(serverFirst: string[], localExisting: string[]): string[] {
  const seen = new Set<string>(serverFirst)
  const out = [...serverFirst]
  for (const id of localExisting) {
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out.slice(0, MAX_RECENT_IDS)
}

/**
 * After sign-in + merge-device-engagement, rebuild Profile liked/saved lists from `engagement_events`
 * so a fresh browser/device shows the same grid as the server (local lists are otherwise empty).
 */
export async function hydrateEngagementLocalListsFromCloud(): Promise<{ liked: number; saved: number }> {
  const supabase = getSupabaseClient()
  if (!supabase) return { liked: 0, saved: 0 }

  const {
    data: { session },
  } = await supabase.auth.getSession()
  const uid = session?.user?.id
  if (!uid) return { liked: 0, saved: 0 }

  const fetchOrdered = async (type: 'like' | 'save') => {
    const { data, error } = await supabase
      .from('engagement_events')
      .select('word_id, created_at')
      .eq('user_id', uid)
      .eq('type', type)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })

    if (error) {
      if (import.meta.env.DEV) console.warn('[engageHydrate]', type, error.message)
      return [] as string[]
    }
    const seen = new Set<string>()
    const out: string[] = []
    for (const row of data ?? []) {
      const w = typeof row.word_id === 'string' ? row.word_id : ''
      if (!w || seen.has(w)) continue
      seen.add(w)
      out.push(w)
    }
    return out
  }

  const [likedIds, savedIds] = await Promise.all([fetchOrdered('like'), fetchOrdered('save')])
  let liked = 0
  let saved = 0
  if (likedIds.length > 0) {
    persistIdList(LOCAL_LIKED, mergeServerAndLocalWordOrder(likedIds, parseIdList(LOCAL_LIKED)))
    liked = likedIds.length
  }
  if (savedIds.length > 0) {
    persistIdList(LOCAL_SAVED, mergeServerAndLocalWordOrder(savedIds, parseIdList(LOCAL_SAVED)))
    saved = savedIds.length
  }
  return { liked, saved }
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

async function queueRecordEngagement(body: Record<string, unknown>): Promise<void> {
  const url = getSupabaseFunctionsBaseUrl()
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!url || !anon) return
  await enqueueSyncOutboxJob('record-engagement', body)
}

const GIFT_SHARE_CACHE_MS = 10 * 60 * 1000
const giftShareUrlByWordId = new Map<string, { share_url: string; at: number }>()

export type RedeemGiftOk = {
  ok: true
  word_id: string
  signed_url: string
  character: string
  pinyin: string
  en_meaning: string
}

export type RedeemGiftFailureReason =
  | 'expired'
  | 'revoked'
  | 'daily_receive_cap'
  | 'not_found'
  | 'invalid_token'
  | 'config'
  | 'network'
  | 'unknown'

export type RedeemGiftFailure = {
  ok: false
  reason: RedeemGiftFailureReason
  /** Server cap when `reason === 'daily_receive_cap'`. */
  cap?: number
}

export type RedeemGiftResult = RedeemGiftOk | RedeemGiftFailure

/** User-facing copy for gift redeem failures (matches `redeem-gift` Edge errors). */
export function redeemGiftFailureMessage(f: RedeemGiftFailure): string {
  switch (f.reason) {
    case 'expired':
      return 'This gift link has expired — ask your friend to send a new one.'
    case 'revoked':
      return 'This gift is no longer available.'
    case 'daily_receive_cap': {
      const n = f.cap ?? 3
      return `You've received ${n} gift${n === 1 ? '' : 's'} today — come back tomorrow.`
    }
    case 'not_found':
      return "We couldn't find that gift link. Check the link or ask your friend to resend it."
    case 'invalid_token':
      return "That gift link doesn't look valid."
    case 'config':
      return 'Gifts are temporarily unavailable in this app build.'
    case 'network':
      return "Couldn't reach the server. Check your connection and try again."
    default:
      return "Something went wrong opening this gift. Please try again."
  }
}

function parseRedeemErrorBody(raw: unknown): { code: string; cap?: number } {
  if (!raw || typeof raw !== 'object') return { code: '' }
  const o = raw as { error?: unknown; cap?: unknown }
  const code = typeof o.error === 'string' ? o.error : ''
  const cap = typeof o.cap === 'number' && Number.isFinite(o.cap) ? Math.max(1, Math.floor(o.cap)) : undefined
  return { code, cap }
}

/**
 * Redeem a gift token from `?g=` / `/g/<token>`; returns a short-lived signed Storage URL for playback.
 */
export async function redeemGiftToken(token: string): Promise<RedeemGiftResult> {
  const t = token.trim()
  if (!/^[0-9a-f]{32}$/i.test(t)) return { ok: false, reason: 'invalid_token' }

  const url = getSupabaseFunctionsBaseUrl()
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!url || !anon) return { ok: false, reason: 'config' }

  const device_hash = await getDeviceHashForEngagement()
  try {
    const res = await fetch(`${url}/redeem-gift`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anon}`,
        apikey: anon,
      },
      body: JSON.stringify({ token: t, device_hash }),
    })

    let parsed: unknown = null
    try {
      parsed = await res.json()
    } catch {
      parsed = null
    }

    if (!res.ok) {
      const { code, cap } = parseRedeemErrorBody(parsed)
      if (res.status === 410 && code === 'expired') return { ok: false, reason: 'expired' }
      if (res.status === 403 && code === 'revoked') return { ok: false, reason: 'revoked' }
      if (res.status === 429 && code === 'daily_receive_cap') {
        return { ok: false, reason: 'daily_receive_cap', cap }
      }
      if (res.status === 404 && code === 'not_found') return { ok: false, reason: 'not_found' }
      return { ok: false, reason: 'unknown' }
    }

    const j = parsed as {
      ok?: boolean
      word_id?: string
      signed_url?: string
      character?: string
      pinyin?: string
      en_meaning?: string
    }
    if (!j?.ok || !j.word_id || !j.signed_url) return { ok: false, reason: 'unknown' }
    return {
      ok: true,
      word_id: j.word_id,
      signed_url: j.signed_url,
      character: j.character ?? '',
      pinyin: j.pinyin ?? '',
      en_meaning: j.en_meaning ?? '',
    }
  } catch {
    return { ok: false, reason: 'network' }
  }
}

/**
 * Prefer canonical gift link from `create-gift`; fall back to `?w=` when functions or metadata are unavailable.
 */
export async function resolveShareUrlForWord(word: WordMetadata): Promise<string> {
  if (import.meta.env.VITE_DISABLE_GIFT_SHARE === 'true') {
    return buildShareUrl(word.word_id)
  }

  const cached = giftShareUrlByWordId.get(word.word_id)
  if (cached && Date.now() - cached.at < GIFT_SHARE_CACHE_MS) {
    return cached.share_url
  }

  const url = getSupabaseFunctionsBaseUrl()
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!url || !anon) {
    return buildShareUrl(word.word_id)
  }

  const device_hash = await getDeviceHashForEngagement()
  try {
    const res = await fetch(`${url}/create-gift`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anon}`,
        apikey: anon,
      },
      body: JSON.stringify({ word_id: word.word_id, device_hash }),
    })
    if (!res.ok) {
      return buildShareUrl(word.word_id)
    }
    const j = (await res.json()) as { ok?: boolean; share_url?: string }
    if (!j?.ok || !j.share_url?.trim()) {
      return buildShareUrl(word.word_id)
    }
    giftShareUrlByWordId.set(word.word_id, { share_url: j.share_url, at: Date.now() })
    return j.share_url
  } catch {
    return buildShareUrl(word.word_id)
  }
}

/** Session telemetry — queued and flushed with backoff (same pipeline as engagement). */
export function recordSessionSummaryFireAndForget(payload: Record<string, unknown>): void {
  const url = getSupabaseFunctionsBaseUrl()
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!url || !anon) return

  void getDeviceHashForEngagement().then((device_hash) => {
    void enqueueSyncOutboxJob('record-session-summary', { device_hash, payload })
  })
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
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const uid = session?.user?.id ?? null

    const pickRow = async (type: 'like' | 'save') => {
      const q = () => supabase.from('engagement_events').select('id').eq('word_id', wid).eq('type', type)
      if (uid) {
        const u = await q().eq('user_id', uid).maybeSingle()
        if (u.data) return u
        return q().eq('device_hash', dh).is('user_id', null).maybeSingle()
      }
      return q().eq('device_hash', dh).is('user_id', null).maybeSingle()
    }

    const [myLike, mySave, counts] = await Promise.all([
      pickRow('like'),
      pickRow('save'),
      getGlobalEngagementCounts(wid),
    ])

    const me = myLike.error
    const mse = mySave.error
    const L = readLocal()
    if (me || mse) {
      return {
        likeCount: counts.ok ? counts.likes : null,
        saveCount: counts.ok ? counts.saves : null,
        liked: L.liked,
        saved: L.saved,
        backendCountsOk: counts.ok,
      }
    }

    return {
      likeCount: counts.ok ? counts.likes : null,
      saveCount: counts.ok ? counts.saves : null,
      liked: !!myLike.data || L.liked,
      saved: !!mySave.data || L.saved,
      backendCountsOk: counts.ok,
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
  invalidateEngagementCountCache(wid)

  const clip = clipKeyForWord(word)
  const dh = await getDeviceHashForEngagement()
  await queueRecordEngagement({
    op: on ? 'like_set' : 'like_clear',
    word_id: wid,
    clip_key: clip,
    device_hash: dh,
  })
}

export async function engagementSetSave(word: WordMetadata, on: boolean): Promise<void> {
  const wid = word.word_id
  let ids = getSavedIdsOrdered().filter((x) => x !== wid)
  if (on) ids.unshift(wid)
  persistIdList(LOCAL_SAVED, ids)
  invalidateEngagementCountCache(wid)

  const clip = clipKeyForWord(word)
  const dh = await getDeviceHashForEngagement()
  await queueRecordEngagement({
    op: on ? 'save_set' : 'save_clear',
    word_id: wid,
    clip_key: clip,
    device_hash: dh,
  })
}

export async function engagementShareTap(word: WordMetadata): Promise<void> {
  const dh = await getDeviceHashForEngagement()
  await queueRecordEngagement({
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
  await queueRecordEngagement({
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
  void (async () => {
    const url = await resolveShareUrlForWord(word)
    const text = buildChallengeShareText(word, url)
    try {
      await navigator.share({
        title: 'Chinese Flash',
        text,
        url,
      })
      recordLocalShare(word.word_id)
      await engagementShareTap(word)
      await engagementShareSuccess(word, 'web_share')
      callbacks.onShared?.()
    } catch (e: unknown) {
      if ((e as { name?: string })?.name === 'AbortError') return
      callbacks.onFallback()
    }
  })()
  return true
}
