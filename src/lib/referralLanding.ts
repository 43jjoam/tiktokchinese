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

/**
 * Resolve pending `?ref=` via `user_id_for_referral_code` RPC and set `meta.referredByUserId`.
 * Returns true if local state was updated — caller should run `uploadLearningProfileWithLocalMeta()`.
 * No-op if already attributed, no pending code, invalid code, or self-referral.
 */
export async function applyPendingReferralAttribution(userId: string): Promise<boolean> {
  const supabase = getSupabaseClient()
  if (!supabase) return false

  const prev = loadPersistedState()
  if (prev.meta.referredByUserId?.trim()) {
    clearPendingReferralCode()
    return false
  }

  const pending = getPendingReferralCode()
  if (!pending) return false

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.user?.id || session.user.id !== userId) return false

  const { data: referrerId, error } = await supabase.rpc('user_id_for_referral_code', {
    code: pending,
  })

  if (error) {
    if (import.meta.env.DEV) {
      console.warn('[referral] user_id_for_referral_code failed:', error.message)
    }
    return false
  }

  if (!referrerId || typeof referrerId !== 'string') {
    clearPendingReferralCode()
    return false
  }

  if (referrerId === userId) {
    clearPendingReferralCode()
    return false
  }

  const next = loadPersistedState()
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
