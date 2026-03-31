import { AUTH_CALLBACK_SEGMENT } from './authCallbackRoute'
import { isRetryableSupabaseFailure, sleep } from './cloudRetries'
import { getDeviceHashForEngagement } from './deviceHash'
import { getSupabaseClient } from './deckService'
import { hydrateEngagementLocalListsFromCloud } from './engagementService'
import { getProfileDisplayName, setProfileDisplayNameFromCloud } from './profileDisplayName'
import {
  profileStatsColumnsForUpsert,
  remoteStatsFromDbRow,
  type RemoteProfileStats,
} from './profileStats'
import { getSupabaseFunctionsBaseUrl } from './supabaseFunctionsUrl'
import {
  clearCurrentWordId,
  DEFAULT_STUDY_META,
  loadCurrentWordId,
  loadPersistedState,
  saveCurrentWordId,
  PERSISTED_STATE_REPLACED_EVENT,
  savePersistedState,
  type PersistedState,
} from './storage'
import type { WordState } from './types'

export { PERSISTED_STATE_REPLACED_EVENT }

/** Fired after `user_learning_profiles` upload succeeds (e.g. magic link sign-in). */
export const CLOUD_PROFILE_SAVED_EVENT = 'tiktokchinese:cloud-profile-saved'

/** Shown on the feed toast and Profile header right after magic-link sync (keep wording in sync). */
export const SIGNED_IN_CLOUD_PROGRESS_MESSAGE =
  'Signed in — your learning progress is saved to the cloud.'

const LAST_ACCOUNT_EMAIL_KEY = 'tiktokchinese_last_account_email'
/** After sign-in, local progress wins until we successfully upload once for this user id (persists across refresh). */
const PROFILE_UPLOAD_DONE_USER_ID_KEY = 'tiktokchinese_profile_upload_done_user_id'

export function getProfileUploadDoneUserId(): string | null {
  try {
    const id = localStorage.getItem(PROFILE_UPLOAD_DONE_USER_ID_KEY)?.trim()
    return id || null
  } catch {
    return null
  }
}

export function setProfileUploadDoneUserId(userId: string): void {
  try {
    localStorage.setItem(PROFILE_UPLOAD_DONE_USER_ID_KEY, userId)
  } catch {
    /* ignore */
  }
}

export function clearProfileUploadDoneUserId(): void {
  try {
    localStorage.removeItem(PROFILE_UPLOAD_DONE_USER_ID_KEY)
  } catch {
    /* ignore */
  }
}

/** Email from last successful sign-in — used for one-tap “sync link” without retyping. */
export function getLastUsedAccountEmail(): string | null {
  try {
    const s = localStorage.getItem(LAST_ACCOUNT_EMAIL_KEY)?.trim().toLowerCase()
    return s && s.includes('@') ? s : null
  } catch {
    return null
  }
}

export function setLastUsedAccountEmail(email: string | null): void {
  try {
    if (!email?.trim()) {
      localStorage.removeItem(LAST_ACCOUNT_EMAIL_KEY)
    } else {
      localStorage.setItem(LAST_ACCOUNT_EMAIL_KEY, email.trim().toLowerCase())
    }
  } catch {
    /* ignore */
  }
}

export function notifyCloudProfileSaved(): void {
  try {
    window.dispatchEvent(new CustomEvent(CLOUD_PROFILE_SAVED_EVENT))
  } catch {
    /* ignore */
  }
}

const PROFILE_V = 1 as const

export type StoredLearningProfilePayload = {
  v: typeof PROFILE_V
  persisted: PersistedState
  currentWordId: string | null
  /** Profile header name; synced across devices with the same auth user. */
  displayName?: string
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function isPersistedState(x: unknown): x is PersistedState {
  if (!isRecord(x)) return false
  if (!isRecord(x.wordStates) || !isRecord(x.videoQuality) || !isRecord(x.meta)) return false
  return true
}

function normalizeProfilePayload(raw: unknown): StoredLearningProfilePayload | null {
  if (!isRecord(raw)) return null
  if (raw.v === PROFILE_V && isPersistedState(raw.persisted)) {
    const dn = raw.displayName
    return {
      v: PROFILE_V,
      persisted: raw.persisted,
      currentWordId: typeof raw.currentWordId === 'string' ? raw.currentWordId : null,
      displayName:
        typeof dn === 'string' && dn.trim().length > 0 ? dn.trim().slice(0, 48) : undefined,
    }
  }
  /* Legacy: entire blob was PersistedState */
  if (isPersistedState(raw)) {
    return {
      v: PROFILE_V,
      persisted: raw,
      currentWordId: null,
    }
  }
  return null
}

export function countWordsWithSessions(wordStates: Record<string, WordState>): number {
  return Object.values(wordStates).filter((w) => w.sessionsSeen > 0).length
}

/** Local study data that should be pushed before pulling remote (avoids wiping anonymous progress). */
export function localLearningProgressNeedsUploadFirst(): boolean {
  const local = loadPersistedState()
  if (countWordsWithSessions(local.wordStates) > 0) return true
  if (local.meta.first20Seen > 0) return true
  return false
}

function buildUploadPayload(): StoredLearningProfilePayload {
  return {
    v: PROFILE_V,
    persisted: loadPersistedState(),
    currentWordId: loadCurrentWordId(),
    displayName: getProfileDisplayName(),
  }
}

export function notifyPersistedStateReplaced(): void {
  try {
    window.dispatchEvent(new CustomEvent(PERSISTED_STATE_REPLACED_EVENT))
  } catch {
    /* ignore */
  }
}

function applyProfilePayload(p: StoredLearningProfilePayload): void {
  savePersistedState(p.persisted)
  if (p.currentWordId?.trim()) {
    saveCurrentWordId(p.currentWordId.trim())
  }
  if (p.displayName?.trim()) {
    setProfileDisplayNameFromCloud(p.displayName.trim())
  }
  notifyPersistedStateReplaced()
}

/** DB stats columns win over JSON `meta` for these fields (see `user_learning_profiles` migration). */
function applyRemoteStatsToLocal(stats: RemoteProfileStats): void {
  const prev = loadPersistedState()
  savePersistedState({
    ...prev,
    meta: {
      ...prev.meta,
      lastActiveDate: stats.lastActiveDate,
      currentStreak: stats.currentStreak,
      totalDaysActive: stats.totalDaysActive,
      bonusCardsUnlocked: stats.bonusCardsUnlocked,
    },
  })
  notifyPersistedStateReplaced()
}

/** Turn Supabase / SMTP errors into short copy for the sign-in modal (avoid raw API strings). */
function userFacingOtpEmailError(raw: string): string {
  const m = raw.toLowerCase()
  if (m.includes('rate limit') || m.includes('too many requests') || m.includes('over_email_send_rate')) {
    return 'Please wait a bit, then try again.'
  }
  if (m.includes('signups not allowed') || m.includes('signup_disabled')) {
    return 'New sign-ups are temporarily unavailable. Please try again later.'
  }
  if (m.includes('invalid') && m.includes('email')) {
    return 'That email address could not be used. Check for typos or try another address.'
  }
  if (m.includes('redirect') && (m.includes('not allowed') || m.includes('invalid'))) {
    return 'Sign-in could not start from this page. Open the app from its main site address and try again.'
  }
  if (
    m.includes('error sending') ||
    m.includes('confirmation email') ||
    m.includes('magic link') ||
    m.includes('smtp') ||
    m.includes('mailer')
  ) {
    return 'We could not send the sign-in email. Please try again later.'
  }
  return 'Could not send the email. Please try again in a few minutes.'
}

/** Maps raw upload / session errors to short Profile copy (avoid raw PostgREST strings). */
export function userFacingProfileUploadError(raw: string): string {
  const m = raw.toLowerCase()
  if (raw === 'no_client') return 'Cloud backup is not available in this build.'
  if (raw === 'no_session') return 'You are not signed in. Sign in again, then tap Sync now.'
  if (raw === 'no_timestamp') return 'Cloud saved but the server response was incomplete. Tap Sync now once more.'
  if (isRetryableSupabaseFailure(raw) || m.includes('fetch')) {
    return 'Network issue — check your connection and tap Sync now again.'
  }
  if (m.includes('jwt') || m.includes('expired') || m.includes('invalid token')) {
    return 'Session expired — sign out and sign in again, then tap Sync now.'
  }
  if (m.includes('row-level') || m.includes('rls') || m.includes('policy') || m.includes('permission')) {
    return 'Could not save (permissions). Try signing out and back in.'
  }
  return 'Could not save to the cloud. Try again in a moment.'
}

/**
 * URL Supabase puts in the magic-link email (`redirect_to`). Must match an entry under
 * Authentication → URL Configuration → Redirect URLs (e.g. `https://chineseflash.com/**`).
 * Set `VITE_AUTH_REDIRECT_URL` in production if users hit the site on www, IP, or preview
 * URLs that are not allow-listed — use your canonical site URL including `/auth/callback/`.
 */
function getMagicLinkRedirectUrl(): string | undefined {
  const withTrailingSlash = (base: string, pathname: string) => {
    const p = pathname === '' || pathname === '/' ? '/' : pathname.endsWith('/') ? pathname : `${pathname}/`
    return `${base.replace(/\/+$/, '')}${p}`
  }
  const fromEnv = (import.meta.env.VITE_AUTH_REDIRECT_URL as string | undefined)?.trim()
  if (fromEnv) {
    try {
      const u = new URL(fromEnv)
      return withTrailingSlash(u.origin, u.pathname)
    } catch {
      return fromEnv.endsWith('/') ? fromEnv : `${fromEnv}/`
    }
  }
  if (typeof window === 'undefined') return undefined
  /* Dedicated path: App shows AuthCallbackLanding first, then replaces URL with `/`. */
  return withTrailingSlash(window.location.origin, `/${AUTH_CALLBACK_SEGMENT}`)
}

export async function sendMagicLink(
  email: string,
): Promise<{ ok: true } | { ok: false; message: string; rawMessage?: string }> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return { ok: false, message: 'App is not connected to the cloud yet.' }
  }
  const trimmed = email.trim().toLowerCase()
  if (!trimmed || !trimmed.includes('@')) {
    return { ok: false, message: 'Enter a valid email address.' }
  }
  const redirect = getMagicLinkRedirectUrl()
  const { error } = await supabase.auth.signInWithOtp({
    email: trimmed,
    options: {
      emailRedirectTo: redirect,
    },
  })
  if (error) {
    const raw = error.message || String(error)
    const status =
      error && typeof error === 'object' && 'status' in error && typeof (error as { status?: unknown }).status === 'number'
        ? (error as { status: number }).status
        : undefined
    const code =
      error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
        ? (error as { code: string }).code
        : undefined
    const rawMessage = [raw, status != null ? `HTTP ${status}` : null, code ? `code: ${code}` : null]
      .filter(Boolean)
      .join(' · ')
    console.warn('[sendMagicLink] Supabase Auth error:', rawMessage, error)
    return {
      ok: false,
      message: userFacingOtpEmailError(raw),
      rawMessage,
    }
  }
  return { ok: true }
}

export async function signOutAccount(): Promise<void> {
  clearProfileUploadDoneUserId()
  const supabase = getSupabaseClient()
  if (!supabase) return
  await supabase.auth.signOut()
}

export async function uploadLearningProfileFromLocal(): Promise<
  { ok: true; updated_at: string } | { ok: false; error: string }
> {
  const supabase = getSupabaseClient()
  if (!supabase) return { ok: false, error: 'no_client' }
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.user?.id) return { ok: false, error: 'no_session' }

  const body = buildUploadPayload()
  const statsCols = profileStatsColumnsForUpsert(loadPersistedState().meta)
  const attempts = 3
  const baseMs = 450
  let lastMessage = 'unknown_error'

  for (let i = 0; i < attempts; i++) {
    const { data, error } = await supabase
      .from('user_learning_profiles')
      .upsert(
        {
          user_id: session.user.id,
          payload: body as unknown as Record<string, unknown>,
          ...statsCols,
        },
        { onConflict: 'user_id' },
      )
      .select('updated_at')
      .single()

    if (!error && data?.updated_at) {
      return { ok: true, updated_at: data.updated_at as string }
    }
    if (error) {
      lastMessage = error.message
      const code = typeof error.code === 'string' ? error.code : undefined
      const retry = i < attempts - 1 && isRetryableSupabaseFailure(error.message, code)
      if (!retry) return { ok: false, error: error.message }
    } else {
      lastMessage = 'no_timestamp'
      if (i === attempts - 1) return { ok: false, error: 'no_timestamp' }
    }
    await sleep(baseMs * Math.pow(2, i))
  }
  return { ok: false, error: lastMessage }
}

/** Upload then stamp `lastMergedRemoteUpdatedAt` so local ↔ cloud stay aligned. */
export async function uploadLearningProfileWithLocalMeta(): Promise<
  { ok: true; updated_at: string } | { ok: false; error: string }
> {
  const up = await uploadLearningProfileFromLocal()
  if (!up.ok) return up
  const supabase = getSupabaseClient()
  const next = loadPersistedState()
  const uid = supabase
    ? ((await supabase.auth.getSession()).data.session?.user?.id ?? '')
    : ''
  savePersistedState({
    ...next,
    meta: {
      ...next.meta,
      lastMergedRemoteUpdatedAt: up.updated_at,
      lastCloudProfileUserId: uid || next.meta.lastCloudProfileUserId,
      accountMagicLinkSentAt: undefined,
      accountSaveNotNowCount: 0,
    },
  })
  notifyPersistedStateReplaced()
  return up
}

/**
 * Pull newer `user_learning_profiles` from the server, then refresh engagement lists from the cloud.
 * For signed-in users on a new device with an empty local vault.
 */
export async function pullLearningProfileFromCloudForCurrentUser(): Promise<
  { ok: true; merged: boolean } | { ok: false; error: string }
> {
  const supabase = getSupabaseClient()
  if (!supabase) return { ok: false, error: 'no_client' }
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const uid = session?.user?.id
  if (!uid) return { ok: false, error: 'no_session' }
  try {
    const merged = await mergeRemoteProfileIfNewer(uid)
    try {
      await hydrateEngagementLocalListsFromCloud()
    } catch (e) {
      console.warn('[cloudSync] hydrate after manual pull failed', e)
    }
    return { ok: true, merged }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}

/**
 * Prefer local until the first successful upload after sign-in for this user id; then merge remote when newer.
 *
 * Binds `lastMergedRemoteUpdatedAt` to `lastCloudProfileUserId` so a cursor from another account or browser
 * profile cannot block downloading this user's cloud row (otherwise the feed stays "new" while Auth shows
 * the signed-in email).
 */
/**
 * Attach anonymous `device_hash` engagement rows to the signed-in user (idempotent).
 * Requires `merge_engagement_device_to_user` + Edge `merge-device-engagement` deployed.
 */
export async function mergeDeviceEngagementAfterSignIn(): Promise<void> {
  const base = getSupabaseFunctionsBaseUrl()
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  const supabase = getSupabaseClient()
  if (!base || !anon?.trim() || !supabase) return
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) return
  const device_hash = await getDeviceHashForEngagement()
  const url = `${base}/merge-device-engagement`
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
    apikey: anon,
  } as const
  const body = JSON.stringify({ device_hash })
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { method: 'POST', headers, body })
      if (res.ok) return
      const text = await res.text().catch(() => '')
      const retryable = res.status >= 502 || res.status === 408 || res.status === 429
      if (import.meta.env.DEV) {
        console.warn('[cloudSync] merge-device-engagement HTTP', res.status, text.slice(0, 200))
      }
      if (!retryable || attempt === 2) return
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[cloudSync] merge-device-engagement network error', e)
      if (attempt === 2) return
    }
    await sleep(400 * Math.pow(2, attempt))
  }
}

export type SyncCloudProfileAfterAuthResult = {
  uploaded: boolean
  merged: boolean
  uploadError?: string
  /** After sync: valid `user_learning_profiles` row for current session */
  hasRemoteProfile: boolean
  /** Whether local had study progress before this run (word sessions / first-20 meta) */
  hadLocalStudyProgressAtStart: boolean
}

/**
 * After sign-in: pull engagement rows (by `user_id`) into local lists, then merge learning profile
 * if the server copy is newer than the local cursor. Safe to call after upload (merge no-ops when cursors match).
 */
export async function restoreCloudDataToLocalAfterSignIn(userId: string): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) return
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.user?.id || session.user.id !== userId) return

  try {
    const { liked, saved, shared } = await hydrateEngagementLocalListsFromCloud()
    if (import.meta.env.DEV && (liked > 0 || saved > 0 || shared > 0)) {
      console.log('[restore] engagement lists hydrated from cloud', { liked, saved, shared })
    }
  } catch (e) {
    console.warn('[restore] hydrateEngagementLocalListsFromCloud failed', e)
  }

  try {
    const merged = await mergeRemoteProfileIfNewer(userId)
    if (merged) console.log('[restore] learning profile merged from cloud')
  } catch (e) {
    console.warn('[restore] mergeRemoteProfileIfNewer failed', e)
  }
}

async function finalizeCloudProfileSync(
  userId: string,
  hadLocalStudyProgressAtStart: boolean,
  partial: Pick<SyncCloudProfileAfterAuthResult, 'uploaded' | 'merged' | 'uploadError'>,
): Promise<SyncCloudProfileAfterAuthResult> {
  await restoreCloudDataToLocalAfterSignIn(userId)

  let remoteRow = await fetchRemoteLearningProfile()
  if (partial.uploaded && !remoteRow) {
    for (let i = 0; i < 5; i++) {
      await sleep(400)
      remoteRow = await fetchRemoteLearningProfile()
      if (remoteRow) break
    }
  }
  const hasRemoteProfile = remoteRow !== null
  if (hasRemoteProfile) {
    console.log('[restore] cloud profile row present for user')
  } else if (!partial.uploadError) {
    console.warn('[restore] no cloud profile found for this user (after sync)')
  }
  if (import.meta.env.DEV) {
    console.log('[cloudSync] syncCloudProfileAfterAuth finished', userId, {
      ...partial,
      hasRemoteProfile,
      hadLocalStudyProgressAtStart,
    })
  }
  if (partial.uploadError) {
    console.warn('[cloudSync] profile upload error:', partial.uploadError)
  }
  return {
    uploaded: partial.uploaded,
    merged: partial.merged,
    uploadError: partial.uploadError,
    hasRemoteProfile,
    hadLocalStudyProgressAtStart,
  }
}

export async function syncCloudProfileAfterAuth(userId: string): Promise<SyncCloudProfileAfterAuthResult> {
  const hadLocalStudyProgressAtStart = localLearningProgressNeedsUploadFirst()
  await mergeDeviceEngagementAfterSignIn()
  let local = loadPersistedState()
  const prevCloudUid = local.meta.lastCloudProfileUserId

  if (prevCloudUid && prevCloudUid !== userId) {
    const remote = await fetchRemoteLearningProfile()
    if (remote) {
      applyProfilePayload(remote.payload)
      applyRemoteStatsToLocal(remote.stats)
      const next = loadPersistedState()
      savePersistedState({
        ...next,
        meta: {
          ...next.meta,
          lastMergedRemoteUpdatedAt: remote.updated_at,
          lastCloudProfileUserId: userId,
          accountSaveNotNowCount: 0,
        },
      })
      notifyPersistedStateReplaced()
      setProfileUploadDoneUserId(userId)
      return await finalizeCloudProfileSync(userId, hadLocalStudyProgressAtStart, { uploaded: false, merged: true })
    }
    /**
     * No `user_learning_profiles` row for this auth user. Previously we wiped local storage here.
     * That produced “empty new user” UX when the same person had two Auth rows (e.g. historical
     * email casing) or a new uuid with no row yet — local still had progress from the old binding.
     * If this device has study progress, keep it and fall through so we upsert to the signed-in user.
     */
    if (localLearningProgressNeedsUploadFirst()) {
      savePersistedState({
        ...local,
        meta: {
          ...local.meta,
          lastCloudProfileUserId: undefined,
          lastMergedRemoteUpdatedAt: undefined,
        },
      })
      notifyPersistedStateReplaced()
      local = loadPersistedState()
    } else {
      savePersistedState({
        wordStates: {},
        videoQuality: {},
        meta: {
          ...DEFAULT_STUDY_META,
          lastCloudProfileUserId: userId,
          accountMagicLinkSentAt: local.meta.accountMagicLinkSentAt,
          accountSaveNotNowCount: local.meta.accountSaveNotNowCount,
        },
      })
      clearCurrentWordId()
      notifyPersistedStateReplaced()
      local = loadPersistedState()
    }
  }

  if (local.meta.lastMergedRemoteUpdatedAt && !local.meta.lastCloudProfileUserId) {
    savePersistedState({
      ...local,
      meta: {
        ...local.meta,
        lastMergedRemoteUpdatedAt: undefined,
      },
    })
    notifyPersistedStateReplaced()
    local = loadPersistedState()
  }

  const hasLocalStudy = localLearningProgressNeedsUploadFirst()
  let uploadDone = getProfileUploadDoneUserId() === userId
  let remoteProfile = await fetchRemoteLearningProfile()

  if (uploadDone && !remoteProfile && hasLocalStudy) {
    clearProfileUploadDoneUserId()
    uploadDone = false
  }

  if (!uploadDone) {
    /* First time for this uid on this device: always upsert when there is no server row so
     * `user_learning_profiles` exists (empty payload is valid). If the server already has a row
     * and local is empty, pull remote only. */
    if (hasLocalStudy || remoteProfile === null) {
      const up = await uploadLearningProfileWithLocalMeta()
      if (!up.ok) {
        console.error('[sync] profile upload FAILED:', up.error)
        return await finalizeCloudProfileSync(userId, hadLocalStudyProgressAtStart, {
          uploaded: false,
          merged: false,
          uploadError: up.error,
        })
      }
      console.log('[sync] profile upload succeeded')
      setProfileUploadDoneUserId(userId)
      return await finalizeCloudProfileSync(userId, hadLocalStudyProgressAtStart, { uploaded: true, merged: false })
    }
    const merged = await mergeRemoteProfileIfNewer(userId)
    setProfileUploadDoneUserId(userId)
    return await finalizeCloudProfileSync(userId, hadLocalStudyProgressAtStart, { uploaded: false, merged })
  }

  const merged = await mergeRemoteProfileIfNewer(userId)
  return await finalizeCloudProfileSync(userId, hadLocalStudyProgressAtStart, { uploaded: false, merged })
}

export async function fetchRemoteLearningProfile(): Promise<
  { payload: StoredLearningProfilePayload; updated_at: string; stats: RemoteProfileStats } | null
> {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.user?.id) return null

  const uid = session.user.id
  const attempts = 3
  const baseMs = 450

  for (let i = 0; i < attempts; i++) {
    const { data, error } = await supabase
      .from('user_learning_profiles')
      .select(
        'payload, updated_at, last_active_date, current_streak, total_days_active, bonus_cards_unlocked',
      )
      .eq('user_id', uid)
      .maybeSingle()

    if (!error && data?.payload) {
      const normalized = normalizeProfilePayload(data.payload)
      if (!normalized) return null
      return {
        payload: normalized,
        updated_at: data.updated_at as string,
        stats: remoteStatsFromDbRow(data),
      }
    }
    if (error) {
      const code = typeof error.code === 'string' ? error.code : undefined
      const retry = i < attempts - 1 && isRetryableSupabaseFailure(error.message, code)
      if (!retry) return null
    } else {
      return null
    }
    await sleep(baseMs * Math.pow(2, i))
  }
  return null
}

function remoteIsNotNewerThanCursor(remoteUpdatedAt: string, localCursor: string): boolean {
  const r = Date.parse(remoteUpdatedAt)
  const l = Date.parse(localCursor)
  if (!Number.isNaN(r) && !Number.isNaN(l)) return r <= l
  return remoteUpdatedAt <= localCursor
}

/**
 * If the server copy is newer than `local.meta.lastMergedRemoteUpdatedAt` (for this user), replace local storage and notify.
 */
export async function mergeRemoteProfileIfNewer(expectedUserId: string): Promise<boolean> {
  const local = loadPersistedState()
  const remote = await fetchRemoteLearningProfile()
  if (!remote) return false

  const prev = local.meta.lastMergedRemoteUpdatedAt ?? ''
  const boundUid = local.meta.lastCloudProfileUserId
  if (prev && boundUid === expectedUserId && remoteIsNotNewerThanCursor(remote.updated_at, prev)) {
    return false
  }

  applyProfilePayload(remote.payload)
  applyRemoteStatsToLocal(remote.stats)
  const next = loadPersistedState()
  savePersistedState({
    ...next,
    meta: {
      ...next.meta,
      lastMergedRemoteUpdatedAt: remote.updated_at,
      lastCloudProfileUserId: expectedUserId,
      accountSaveNotNowCount: 0,
    },
  })
  notifyPersistedStateReplaced()
  return true
}

export async function getAuthEmail(): Promise<string | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.user?.email ?? null
}
