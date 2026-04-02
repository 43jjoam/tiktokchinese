import { getSupabaseClient } from './deckService'
import { loadPersistedState, PERSISTED_STATE_REPLACED_EVENT, savePersistedState } from './storage'

/** Same alphabet as `generateReferralCodeCandidate` (8 chars). */
const REF_CODE_CHARS = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/

export const PENDING_REFERRAL_CODE_KEY = 'tiktokchinese_pending_referral_code'

export function normalizeReferralCodeParam(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  const s = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!REF_CODE_CHARS.test(s)) return null
  return s
}

export function getPendingReferralCode(): string | null {
  try {
    const s = localStorage.getItem(PENDING_REFERRAL_CODE_KEY)?.trim().toUpperCase()
    return s && REF_CODE_CHARS.test(s) ? s : null
  } catch {
    return null
  }
}

function clearPendingReferralCode(): void {
  try {
    localStorage.removeItem(PENDING_REFERRAL_CODE_KEY)
  } catch {
    /* ignore */
  }
}

function stripRefParamFromUrl(): void {
  try {
    const u = new URL(window.location.href)
    if (!u.searchParams.has('ref')) return
    u.searchParams.delete('ref')
    const qs = u.searchParams.toString()
    window.history.replaceState({}, '', u.pathname + (qs ? `?${qs}` : '') + u.hash)
  } catch {
    /* ignore */
  }
}

/**
 * Read `?ref=CODE`, store for attribution after sign-in, remove `ref` from the address bar.
 * Safe to call on every load (e.g. before stripping OAuth params).
 */
export function captureReferralFromUrl(): void {
  if (typeof window === 'undefined') return
  try {
    const raw = new URLSearchParams(window.location.search).get('ref')
    const normalized = normalizeReferralCodeParam(raw)
    if (normalized) {
      try {
        localStorage.setItem(PENDING_REFERRAL_CODE_KEY, normalized)
      } catch {
        /* ignore */
      }
    }
    stripRefParamFromUrl()
  } catch {
    /* ignore */
  }
}

function persistReferredByUserId(referrerId: string, userId: string): boolean {
  if (referrerId === userId) {
    console.log('[referral] persistReferredBy: self-referral, referrerId === userId', referrerId)
    clearPendingReferralCode()
    return false
  }

  const next = loadPersistedState()
  if (next.meta.referredByUserId?.trim()) {
    console.log('[referral] persistReferredBy: already attributed in local state', next.meta.referredByUserId)
    clearPendingReferralCode()
    return false
  }

  savePersistedState({
    ...next,
    meta: {
      ...next.meta,
      referredByUserId: referrerId,
    },
  })
  clearPendingReferralCode()
  try {
    window.dispatchEvent(new CustomEvent(PERSISTED_STATE_REPLACED_EVENT))
  } catch {
    /* ignore */
  }
  return true
}

async function fetchReferrerIdForCode(code: string): Promise<
  { ok: true; referrerId: string } | { ok: false; reason: 'rpc' | 'not_found' }
> {
  const supabase = getSupabaseClient()
  if (!supabase) return { ok: false, reason: 'rpc' }

  const { data: referrerId, error } = await supabase.rpc('user_id_for_referral_code', {
    code,
  })

  if (error) {
    if (import.meta.env.DEV) {
      console.warn('[referral] user_id_for_referral_code failed:', error.message)
    }
    return { ok: false, reason: 'rpc' }
  }

  if (!referrerId || typeof referrerId !== 'string') {
    return { ok: false, reason: 'not_found' }
  }

  return { ok: true, referrerId }
}

/**
 * Resolve pending `?ref=` via `user_id_for_referral_code` RPC and set `meta.referredByUserId`.
 * Returns true if local state was updated — caller should run `uploadLearningProfileWithLocalMeta()`.
 * No-op if already attributed, no pending code, invalid code, or self-referral.
 */
export async function applyPendingReferralAttribution(userId: string): Promise<boolean> {
  const supabase = getSupabaseClient()
  if (!supabase) { console.log('[referral] applyPending: no supabase'); return false }

  const prev = loadPersistedState()
  if (prev.meta.referredByUserId?.trim()) {
    console.log('[referral] applyPending: already attributed', prev.meta.referredByUserId)
    clearPendingReferralCode()
    return false
  }

  const pending = getPendingReferralCode()
  console.log('[referral] applyPending: pending code =', pending)
  if (!pending) return false

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.user?.id || session.user.id !== userId) {
    console.log('[referral] applyPending: session mismatch', session?.user?.id, userId)
    return false
  }

  const resolved = await fetchReferrerIdForCode(pending)
  console.log('[referral] applyPending: resolved =', JSON.stringify(resolved), 'userId =', userId)
  if (!resolved.ok) {
    if (resolved.reason === 'not_found') clearPendingReferralCode()
    return false
  }

  return persistReferredByUserId(resolved.referrerId, userId)
}

export type ApplyManualReferralResult =
  | { ok: true }
  | { ok: false; message: string }

/**
 * Library / manual entry: resolve an 8-character invite code and attribute this account to the referrer.
 * Call only when signed in. On success, caller should run `uploadLearningProfileWithLocalMeta()`.
 */
export async function applyReferralCodeFromManualEntry(
  rawInput: string,
  userId: string,
): Promise<ApplyManualReferralResult> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return { ok: false, message: 'Cloud is not available.' }
  }

  const normalized = normalizeReferralCodeParam(rawInput)
  if (!normalized) {
    return {
      ok: false,
      message: 'Use an 8-character code (letters A–Z and digits, no 0/O or 1/I).',
    }
  }

  const prev = loadPersistedState()
  if (prev.meta.referredByUserId?.trim()) {
    return { ok: false, message: 'You already connected an invite from a friend.' }
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.user?.id || session.user.id !== userId) {
    return { ok: false, message: 'Sign in to use a friend invite code.' }
  }

  const resolved = await fetchReferrerIdForCode(normalized)
  if (!resolved.ok) {
    if (resolved.reason === 'rpc') {
      return { ok: false, message: 'Could not look up that code. Try again in a moment.' }
    }
    return { ok: false, message: 'No account matches that code. Check for typos.' }
  }

  if (!persistReferredByUserId(resolved.referrerId, userId)) {
    return { ok: false, message: 'You cannot use your own invite code.' }
  }

  return { ok: true }
}
