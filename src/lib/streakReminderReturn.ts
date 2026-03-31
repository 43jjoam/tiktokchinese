import { getSupabaseClient } from './deckService'
import { APP_EVENT, logAppEvent } from './appEvents'

const STORAGE_PREFIX = 'tiktokchinese_logged_return_after_reminder_'

/**
 * If the user opens the app within 4 hours of `streak_reminder_sent_at`, log once per send.
 */
export async function tryLogUserReturnedAfterReminder(): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) return
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const uid = session?.user?.id
  if (!uid) return

  const { data: row } = await supabase
    .from('user_learning_profiles')
    .select('streak_reminder_sent_at')
    .eq('user_id', uid)
    .maybeSingle()

  const sentAt = row?.streak_reminder_sent_at as string | null | undefined
  if (!sentAt) return

  const sentMs = new Date(sentAt).getTime()
  if (!Number.isFinite(sentMs)) return

  const fourHours = 4 * 3600 * 1000
  if (Date.now() - sentMs > fourHours) return

  const key = `${STORAGE_PREFIX}${sentAt}`
  try {
    if (localStorage.getItem(key) === '1') return
    localStorage.setItem(key, '1')
  } catch {
    return
  }

  logAppEvent(APP_EVENT.USER_RETURNED_AFTER_REMINDER, {
    streak_reminder_sent_at: sentAt,
  })
}
