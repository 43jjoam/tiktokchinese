/** Persisted max referral_count seen — used to detect new successful referrals for the referrer. */
export const LAST_KNOWN_REFERRAL_COUNT_KEY = 'tiktokchinese_last_known_referral_count'

export const REFERRAL_JOIN_TOAST_EVENT = 'tiktokchinese:referral-join-toast'

export const REFERRAL_JOIN_TOAST_MESSAGE =
  'Your friend just joined \u2014 you both unlocked more cards. Keep going.'

/**
 * After merge updates `referralCount` from Supabase, show a toast when the count increased.
 * `prevCount` / `newCount` are from before/after this merge (avoids false positives on first
 * sync of an existing high count; still toasts first friend when newCount === 1 and key was absent).
 */
export function tryShowReferralJoinToast(prevCount: number, newCount: number): void {
  if (typeof window === 'undefined') return
  if (newCount <= prevCount) return
  try {
    const raw = localStorage.getItem(LAST_KNOWN_REFERRAL_COUNT_KEY)
    let last = raw != null && raw !== '' ? parseInt(raw, 10) : NaN
    if (!Number.isFinite(last)) last = 0

    if (raw == null || raw === '') {
      localStorage.setItem(LAST_KNOWN_REFERRAL_COUNT_KEY, String(newCount))
      // First-time key: only toast a single-step increase from this merge (not bulk import on first sign-in).
      if (newCount === prevCount + 1) {
        window.dispatchEvent(new CustomEvent(REFERRAL_JOIN_TOAST_EVENT))
      }
      return
    }

    if (newCount > last) {
      localStorage.setItem(LAST_KNOWN_REFERRAL_COUNT_KEY, String(newCount))
      window.dispatchEvent(new CustomEvent(REFERRAL_JOIN_TOAST_EVENT))
    }
  } catch {
    /* ignore */
  }
}
