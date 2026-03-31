import { getSupabaseClient } from './deckService'

/**
 * Stable event names (ChineseFlash Referral Completion Spec §5 + User Journey).
 * `payload` is JSON; use `value` for unlock_path_selected / simple enums.
 */
export const APP_EVENT = {
  UNLOCK_SCREEN_SHOWN: 'unlock_screen_shown',
  UNLOCK_PATH_SELECTED: 'unlock_path_selected',
  BUY_BUTTON_TAPPED: 'buy_button_tapped',
  INVITE_LINK_COPIED: 'invite_link_copied',
  DECK_UNLOCKED: 'deck_unlocked',
  /** Logged server-side (see app_events_referral_triggers.sql); listed for queries only. */
  REFERRAL_ATTRIBUTED: 'referral_attributed',
  REFERRAL_BONUS_AWARDED: 'referral_bonus_awarded',
  MANUAL_CODE_APPLIED: 'manual_code_applied',
  /** Not in spec table; use for failed apply attempts. */
  MANUAL_CODE_APPLY_FAILED: 'manual_code_apply_failed',
  TOMORROW_SELECTED: 'tomorrow_selected',
  REMINDER_EMAIL_SENT: 'reminder_email_sent',
  USER_RETURNED_AFTER_REMINDER: 'user_returned_after_reminder',
} as const

/**
 * Fire-and-forget insert into `app_events` (requires signed-in user). Never throws to callers.
 */
export function logAppEvent(name: string, payload?: Record<string, unknown>): void {
  const supabase = getSupabaseClient()
  if (!supabase) return
  void (async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) return
      const { error } = await supabase.from('app_events').insert({
        user_id: uid,
        name,
        payload: payload ?? {},
      })
      if (error && import.meta.env.DEV) {
        console.warn('[appEvents]', name, error.message)
      }
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[appEvents]', name, e)
    }
  })()
}
