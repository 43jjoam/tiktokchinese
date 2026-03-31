import { getSupabaseClient } from './deckService'

/** Default delay after “Remind tomorrow” before the streak nudge email (~20h per product spec). */
export const STREAK_REMINDER_DELAY_HOURS = 20

/**
 * Schedules a server-side streak reminder email (Resend) via `send-streak-reminders` Edge cron.
 * Writes `user_learning_profiles.streak_reminder_scheduled_at` / clears `streak_reminder_sent_at`.
 */
export async function scheduleStreakReminderEmail(delayHours = STREAK_REMINDER_DELAY_HOURS): Promise<boolean> {
  const supabase = getSupabaseClient()
  if (!supabase) return false
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const uid = session?.user?.id
  if (!uid) return false

  const at = new Date(Date.now() + delayHours * 3600 * 1000).toISOString()
  const { error } = await supabase
    .from('user_learning_profiles')
    .update({
      streak_reminder_scheduled_at: at,
      streak_reminder_sent_at: null,
    })
    .eq('user_id', uid)

  if (error) {
    if (import.meta.env.DEV) {
      console.warn('[streakReminder] schedule failed', error.message)
    }
    return false
  }
  return true
}
