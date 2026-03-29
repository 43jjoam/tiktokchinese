import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useState } from 'react'
import { sendMagicLink } from '../lib/accountSync'

type Props = {
  open: boolean
  /** Corner “Sign in” flow: different copy and button labels. */
  welcomeBack?: boolean
  /** Words the learner has started (sessions in progress). */
  wordsInProgress: number
  /** When opening “use another email”, leave empty; otherwise optional pre-fill */
  initialEmail?: string
  /** Third prompt: user must enter email (no snooze). */
  allowNotNow?: boolean
  onDismissWithoutAccount: () => void
  /** Called as soon as the magic link email is sent — persists state so the prompt does not reopen. */
  onMagicLinkSent: () => void
  /** Called after a short delay so the user can read the success message; parent closes the modal. */
  onCloseAfterSuccess: () => void
}

export function SaveProgressModal({
  open,
  welcomeBack = false,
  wordsInProgress,
  initialEmail = '',
  allowNotNow = true,
  onDismissWithoutAccount,
  onMagicLinkSent,
  onCloseAfterSuccess,
}: Props) {
  const [email, setEmail] = useState(initialEmail)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorDetail, setErrorDetail] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (!open) {
      setEmail(initialEmail)
      setBusy(false)
      setError(null)
      setErrorDetail(null)
      setSent(false)
    } else {
      setEmail(initialEmail)
    }
  }, [open, initialEmail])

  useEffect(() => {
    if (!open || !sent) return
    const t = window.setTimeout(() => onCloseAfterSuccess(), 4200)
    return () => window.clearTimeout(t)
  }, [open, sent, onCloseAfterSuccess])

  const submit = useCallback(async () => {
    setError(null)
    setErrorDetail(null)
    setBusy(true)
    const r = await sendMagicLink(email)
    setBusy(false)
    if (!r.ok) {
      setError(r.message)
      setErrorDetail(r.rawMessage ?? null)
      return
    }
    onMagicLinkSent()
    setSent(true)
  }, [email, onMagicLinkSent])

  const goBackToEmail = useCallback(() => {
    setSent(false)
    setError(null)
    setErrorDetail(null)
    setEmail('')
  }, [])

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="save-progress-root"
          className="fixed inset-0 z-[120] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={undefined}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={
              sent
                ? welcomeBack
                  ? 'save-progress-welcome-sent'
                  : 'save-progress-link-sent'
                : 'save-progress-title'
            }
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="relative z-[1] w-full max-w-[380px] rounded-2xl border border-white/12 bg-zinc-950 px-5 py-6 shadow-[0_24px_64px_rgba(0,0,0,0.65)]"
            onClick={(e) => e.stopPropagation()}
          >
            <AnimatePresence mode="wait" initial={false}>
              {!sent ? (
                <motion.div
                  key="email-step"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                >
                  <h2 id="save-progress-title" className="text-center text-lg font-bold leading-snug text-white">
                    {welcomeBack ? 'Welcome back!' : 'Keep your progress'}
                  </h2>
                  {welcomeBack ? (
                    <p className="mt-3 text-center text-sm leading-relaxed text-white/80">
                      Please enter your email address to continue from last time.
                    </p>
                  ) : (
                    <>
                      <p className="mt-3 text-center text-sm leading-relaxed text-white/80">
                        You&apos;ve already learned{' '}
                        <span className="font-semibold text-white">{wordsInProgress}</span> word
                        {wordsInProgress === 1 ? '' : 's'} today! Sign in or create an account to preserve your
                        progress.
                      </p>
                      {!allowNotNow ? (
                        <p className="mt-2 text-center text-xs font-medium leading-snug text-amber-200/90">
                          Please add your email to continue.
                        </p>
                      ) : null}
                    </>
                  )}
                  <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-white/45">
                    Email
                  </label>
                  <input
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-3 text-[16px] text-white outline-none ring-0 placeholder:text-white/35 focus:border-white/35"
                  />
                  {error ? (
                    <div className="mt-2 space-y-2">
                      <p className="text-center text-xs font-medium text-rose-300">{error}</p>
                      {errorDetail ? (
                        <p className="break-words text-center font-mono text-[10px] leading-snug text-rose-200/70">
                          {errorDetail}
                        </p>
                      ) : null}
                      <p className="text-center text-[10px] leading-snug text-white/35">
                        Also check the browser console (F12) for a line starting with{' '}
                        <span className="text-white/50">[sendMagicLink]</span>.
                      </p>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void submit()}
                    className="mt-5 w-full rounded-xl bg-white py-3.5 text-sm font-bold text-zinc-950 transition-opacity disabled:opacity-50"
                  >
                    {busy ? 'Sending…' : welcomeBack ? 'Continue the journey' : 'Preserve my progress'}
                  </button>
                  {allowNotNow && !welcomeBack ? (
                    <button
                      type="button"
                      onClick={onDismissWithoutAccount}
                      className="mt-4 w-full py-2 text-center text-sm font-semibold text-white/50 transition-colors hover:text-white/70"
                    >
                      Not now
                    </button>
                  ) : null}
                </motion.div>
              ) : (
                <motion.div
                  key={welcomeBack ? 'link-sent-welcome' : 'link-sent-step'}
                  initial={{ opacity: 0, scale: 0.97, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-5 ring-1 ring-emerald-400/20"
                  role="status"
                  aria-live="polite"
                >
                  {welcomeBack ? (
                    <>
                      <h2 id="save-progress-welcome-sent" className="sr-only">
                        Link sent
                      </h2>
                      <p className="text-center text-sm font-medium leading-relaxed text-emerald-50/95">
                        We&apos;ve sent you a link. Enter through the link and continue your Chinese master journey.
                      </p>
                    </>
                  ) : (
                    <>
                      <h2 id="save-progress-link-sent" className="text-center text-base font-bold leading-snug text-white">
                        Link sent
                      </h2>
                      <p className="mt-3 text-center text-sm leading-relaxed text-emerald-50/95">
                        We&apos;ve sent you a link to preserve your progress. Enter through the link and continue your
                        Chinese master journey.
                      </p>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={goBackToEmail}
                    className="mt-5 w-full rounded-xl border border-white/20 bg-transparent py-3 text-sm font-semibold text-white/90 transition-colors hover:bg-white/10"
                  >
                    Log in another account
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
