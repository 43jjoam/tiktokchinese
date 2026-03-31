import { getSupabaseClient } from './deckService'

/**
 * Emails the referrer (Resend) via Edge Function `notify-referrer-join` after a successful
 * referral bonus. Idempotent (`referrer_join_email_sent_at` on invitee row). Safe to call often.
 */
export async function tryNotifyReferrerJoinEmail(): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) return

  for (let i = 0; i < 8; i++) {
    const { data, error } = await supabase.functions.invoke<{ ok?: boolean }>('notify-referrer-join', {
      body: {},
    })
    if (!error && data?.ok) return
    await new Promise((r) => setTimeout(r, 400))
  }
}
