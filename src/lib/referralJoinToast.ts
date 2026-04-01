/** Persisted max referral_count seen — used to detect new successful referrals for the referrer. */
export const LAST_KNOWN_REFERRAL_COUNT_KEY = 'tiktokchinese_last_known_referral_count'

export const REFERRAL_JOIN_TOAST_EVENT = 'tiktokchinese:referral-join-toast'

export const REFERRAL_JOIN_TOAST_MESSAGE =
  'Your friend just joined \u2014 you both unlocked more cards. Keep going.'

// ─── Pre-login referral toast (invitee side, before sign-in) ─────────────────

export const REFERRAL_PRE_LOGIN_TOAST_MESSAGE =
  'Your friend gifted you 10 characters \u2014 sign in to claim them.'

// ─── Referral welcome toast (invitee side) ───────────────────────────────────

/** localStorage flag — set after the invitee welcome toast fires so it never repeats. */
export const REFERRAL_WELCOME_TOAST_KEY = 'tiktokchinese_referral_welcome_shown'

/**
 * Pending flag — set when attribution happens; consumed by VideoFeed on mount.
 * Survives the auth redirect so the toast still fires even if VideoFeed wasn't
 * mounted yet when tryShowReferralWelcomeToast() was first called.
 */
export const REFERRAL_WELCOME_TOAST_PENDING_KEY = 'tiktokchinese_referral_welcome_pending'

export const REFERRAL_WELCOME_TOAST_EVENT = 'tiktokchinese:referral-welcome-toast'

export const REFERRAL_WELCOME_TOAST_MESSAGE =
  'Welcome to ChineseFlash \u2014 your friend added 10 characters to your library as a gift.'

/**
 * After a successful referral attribution for the invitee, schedule a one-time welcome toast.
 * Sets a pending flag so VideoFeed can show it on mount even if this runs before the component
 * is listening (e.g. during the auth redirect). Also dispatches the event immediately in case
 * VideoFeed is already mounted.
 */
export function tryShowReferralWelcomeToast(): void {
  if (typeof window === 'undefined') return
  try {
    if (localStorage.getItem(REFERRAL_WELCOME_TOAST_KEY)) return
    localStorage.setItem(REFERRAL_WELCOME_TOAST_PENDING_KEY, 'true')
    window.dispatchEvent(new CustomEvent(REFERRAL_WELCOME_TOAST_EVENT))
  } catch {
    /* ignore */
  }
}

/**
 * Called by VideoFeed on mount. If a pending welcome toast is waiting, marks it as shown
 * and returns true so the component can display it.
 */
export function consumeReferralWelcomeToastPending(): boolean {
  try {
    if (!localStorage.getItem(REFERRAL_WELCOME_TOAST_PENDING_KEY)) return false
    if (localStorage.getItem(REFERRAL_WELCOME_TOAST_KEY)) {
      localStorage.removeItem(REFERRAL_WELCOME_TOAST_PENDING_KEY)
      return false
    }
    localStorage.removeItem(REFERRAL_WELCOME_TOAST_PENDING_KEY)
    localStorage.setItem(REFERRAL_WELCOME_TOAST_KEY, 'true')
    return true
  } catch {
    return false
  }
}

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
