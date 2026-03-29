import { useCallback, useEffect, useState } from 'react'
import { getSupabaseClient } from '../lib/deckService'

type Phase = 'working' | 'done' | 'error'

/**
 * Minimal full-screen step after the user taps the email magic link.
 * Supabase exchanges `?code=` here; then we replace the URL with `/` and show the main app.
 */
export function AuthCallbackLanding({ onFinished }: { onFinished: () => void }) {
  const [phase, setPhase] = useState<Phase>('working')
  const [detail, setDetail] = useState<string | null>(null)

  const goHome = useCallback(() => {
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
      goHome()
    }

    const trySession = () => {
      void client.auth.getSession().then(({ data: { session } }) => {
        if (cancelled) return
        if (session?.user) finishOk()
      })
    }

    trySession()

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      if (cancelled) return
      if (session?.user && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        finishOk()
      }
    })

    const t = window.setTimeout(() => {
      if (cancelled || completedRef.current) return
      void client.auth.getSession().then(({ data: { session } }) => {
        if (cancelled || completedRef.current) return
        if (session?.user) finishOk()
        else {
          setDetail('We could not complete sign-in. Try the link again or request a new email from the app.')
          setPhase('error')
        }
      })
    }, 12000)

    return () => {
      cancelled = true
      window.clearTimeout(t)
      subscription.unsubscribe()
    }
  }, [goHome])

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-black px-6 text-center text-white">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">Chinese Flash</p>
      {phase === 'working' ? (
        <>
          <h1 className="mt-4 text-xl font-bold leading-snug">Signing you in…</h1>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/55">
            One moment while we connect your account. You’ll go to your learning feed next.
          </p>
          <div
            className="mt-8 h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-white/90"
            aria-hidden
          />
        </>
      ) : null}
      {phase === 'error' ? (
        <>
          <h1 className="mt-4 text-xl font-bold leading-snug text-rose-200">Couldn’t sign you in</h1>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/60">{detail}</p>
          <button
            type="button"
            onClick={goHome}
            className="mt-8 rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-zinc-900 active:opacity-90"
          >
            Back to app
          </button>
        </>
      ) : null}
    </div>
  )
}
