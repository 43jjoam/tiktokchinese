import { useCallback, useEffect, useState } from 'react'
import { syncCloudProfileAfterAuth } from '../lib/accountSync'
import { getSupabaseClient } from '../lib/deckService'
import { captureReferralFromUrl } from '../lib/referralLanding'

type Phase = 'working' | 'done' | 'error'

const EMAIL_OTP_TYPES = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'] as const
type EmailOtpType = (typeof EMAIL_OTP_TYPES)[number]

function parseEmailOtpType(raw: string | null): EmailOtpType {
  if (raw && (EMAIL_OTP_TYPES as readonly string[]).includes(raw)) return raw as EmailOtpType
  return 'magiclink'
}

/**
 * Full-screen step when the user opens the magic-link URL (path `/auth/callback`).
 * Completes sign-in via: (1) `token_hash` in query — best for Outlook / in-app browsers;
 * (2) tokens in hash or PKCE `code` in query — handled by `auth.initialize()`.
 */
export function AuthCallbackLanding({ onFinished }: { onFinished: () => void }) {
  const [phase, setPhase] = useState<Phase>('working')
  const [detail, setDetail] = useState<string | null>(null)

  /**
   * VideoFeed is not mounted on `/auth/callback`, so its `onAuthStateChange` handler is not active here.
   * Run cloud profile + referral sync before leaving this route; otherwise `referred_by` may never
   * be written (sync previously depended on VideoFeed's INITIAL_SESSION after `onFinished`).
   */
  const leaveCallbackAndFinish = useCallback(async () => {
    captureReferralFromUrl()
    const client = getSupabaseClient()
    if (client) {
      const {
        data: { session },
      } = await client.auth.getSession()
      if (session?.user?.id) {
        try {
          await syncCloudProfileAfterAuth(session.user.id)
        } catch (e) {
          console.warn('[auth-callback] syncCloudProfileAfterAuth failed', e)
        }
      }
    }
    try {
      window.history.replaceState({}, '', '/')
    } catch {
      /* ignore */
    }
    onFinished()
  }, [onFinished])

  useEffect(() => {
    const search = window.location.search
    if (/(^|[?&])error=/.test(search)) {
      const params = new URLSearchParams(search)
      const msg = params.get('error_description') || params.get('error') || 'Sign-in was cancelled or failed.'
      setDetail(msg)
      setPhase('error')
      return
    }

    const client = getSupabaseClient()
    if (!client) {
      setDetail('This build is not connected to the cloud.')
      setPhase('error')
      return
    }

    let cancelled = false
    const completedRef = { current: false }
    const finishOk = () => {
      if (cancelled || completedRef.current) return
      completedRef.current = true
      setPhase('done')
      void leaveCallbackAndFinish()
    }

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      if (cancelled) return
      if (session?.user && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        finishOk()
      }
    })

    void (async () => {
      try {
        const url = new URL(window.location.href)
        const tokenHash = url.searchParams.get('token_hash')
        if (tokenHash) {
          const type = parseEmailOtpType(url.searchParams.get('type'))
          const { data, error } = await client.auth.verifyOtp({ token_hash: tokenHash, type })
          if (cancelled) return
          if (error) {
            setDetail(error.message)
            setPhase('error')
            return
          }
          if (data.session?.user) {
            url.searchParams.delete('token_hash')
            url.searchParams.delete('type')
            const qs = url.searchParams.toString()
            window.history.replaceState({}, '', url.pathname + (qs ? `?${qs}` : '') + url.hash)
            finishOk()
            return
          }
          setDetail('Sign-in did not return a session. Request a new link from the app.')
          setPhase('error')
          return
        }

        const { error: initErr } = await client.auth.initialize()
        if (cancelled) return
        if (initErr) {
          setDetail(initErr.message)
          setPhase('error')
          return
        }
        const {
          data: { session },
        } = await client.auth.getSession()
        if (!cancelled && session?.user) finishOk()
      } catch (e) {
        if (cancelled) return
        try {
          const {
            data: { session: checkSession },
          } = await client.auth.getSession()
          if (!cancelled && checkSession?.user) {
            finishOk()
            return
          }
        } catch {
          /* ignore */
        }
        if (!cancelled) {
          setDetail(e instanceof Error ? e.message : 'Sign-in failed.')
          setPhase('error')
        }
      }
    })()

    const t = window.setTimeout(() => {
      if (cancelled || completedRef.current) return
      void client.auth.getSession().then(({ data: { session } }) => {
        if (cancelled || completedRef.current) return
        if (session?.user) finishOk()
        else {
          setDetail(
            "You're on the sign-in callback page (/auth/callback). Email apps often break magic links. Try “Open in Safari” (or Chrome), or request a new link. If it keeps failing, set the Magic link email template in Supabase to use token_hash — see env.example in the repo.",
          )
          setPhase('error')
        }
      })
    }, 20000)

    return () => {
      cancelled = true
      window.clearTimeout(t)
      subscription.unsubscribe()
    }
  }, [leaveCallbackAndFinish])

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-black px-6 text-center text-white">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">Chinese Flash</p>
      {phase === 'working' ? (
        <>
          <h1 className="mt-4 text-xl font-bold leading-snug">Signing you in…</h1>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/55">
            This is the email sign-in page. You'll continue to your learning feed in a moment.
          </p>
          <div
            className="mt-8 h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-white/90"
            aria-hidden
          />
        </>
      ) : null}
      {phase === 'error' ? (
        <>
          <h1 className="mt-4 text-xl font-bold leading-snug text-rose-200">Couldn't sign you in</h1>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/60">{detail}</p>
          <button
            type="button"
            onClick={() => void leaveCallbackAndFinish()}
            className="mt-8 rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-zinc-900 active:opacity-90"
          >
            Back to app
          </button>
        </>
      ) : null}
    </div>
  )
}
