import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getLastUsedAccountEmail, sendMagicLink, setLastUsedAccountEmail } from '../lib/accountSync'

type Props = {
  open: boolean
  /** “Welcome back” copy when we already know their email (e.g. last session). */
  welcomeBack?: boolean
  /** Completed learning swipes (increments each finalized swipe — matches prompt milestones). */
  sessionsCompleted: number
  /** When opening “use another email”, leave empty; otherwise optional pre-fill */
  initialEmail?: string
  /** Third prompt: user must enter email (no snooze). */
  allowNotNow?: boolean
  /** Open directly on the “link sent” step (e.g. guest hit swipe cap with link already sent). */
  forceLinkSentStep?: boolean
  /**
   * When true on the link-sent step: no backdrop dismiss, no OK dismiss — user must open the magic link.
   * Parent should set when anonymous swipe cap is reached and a link was already sent.
   */
  linkSentHardLocked?: boolean
  onDismissWithoutAccount: () => void
  /** Called as soon as the magic link email is sent — persists state so the prompt does not reopen. */
  onMagicLinkSent: () => void
  /** User acknowledged the link-sent message and may continue (until cap / lock). */
  onAcknowledgeLinkSent: () => void
}

export function SaveProgressModal({
  open,
  welcomeBack = false,
  sessionsCompleted,
  initialEmail = '',
  allowNotNow = true,
  forceLinkSentStep = false,
  linkSentHardLocked = false,
  onDismissWithoutAccount,
  onMagicLinkSent,
  onAcknowledgeLinkSent,
}: Props) {
  const [email, setEmail] = useState(initialEmail)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorDetail, setErrorDetail] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  /** Unix ms when resend is allowed again (hard lock only). */
  const [resendCooldownUntil, setResendCooldownUntil] = useState(0)
  const [, setResendTick] = useState(0)
  const [resendBusy, setResendBusy] = useState(false)
  const [resendError, setResendError] = useState<string | null>(null)
  const [resendOkFlash, setResendOkFlash] = useState(false)

  /** Avoid resetting `sent` when `initialEmail` updates after a successful send (parent reads last-used email). */
  const saveProgressWasOpenRef = useRef(false)

  useEffect(() => {
    if (!open) {
      saveProgressWasOpenRef.current = false
      setEmail(initialEmail)
      setBusy(false)
      setError(null)
      setErrorDetail(null)
      setSent(false)
      setResendCooldownUntil(0)
      setResendBusy(false)
      setResendError(null)
      setResendOkFlash(false)
      return
    }

    if (!saveProgressWasOpenRef.current) {
      saveProgressWasOpenRef.current = true
      setEmail(initialEmail)
      setSent(Boolean(forceLinkSentStep))
      return
    }

    if (forceLinkSentStep) {
      setSent(true)
    } else if (!sent) {
      setEmail(initialEmail)
    }
  }, [open, initialEmail, forceLinkSentStep, sent])

  useEffect(() => {
    if (!open || !linkSentHardLocked) return
    if (Date.now() >= resendCooldownUntil) return
    const id = window.setInterval(() => setResendTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [open, linkSentHardLocked, resendCooldownUntil])

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
    const trimmed = email.trim().toLowerCase()
    if (trimmed) setLastUsedAccountEmail(trimmed)
    onMagicLinkSent()
    setSent(true)
  }, [email, onMagicLinkSent])

  const goBackToEmail = useCallback(() => {
    setSent(false)
    setError(null)
    setErrorDetail(null)
    setEmail('')
  }, [])

  const magicLinkTargetEmail = (email.trim() || getLastUsedAccountEmail() || '').trim()

  const resendSecondsLeft =
    linkSentHardLocked && resendCooldownUntil > Date.now()
      ? Math.max(0, Math.ceil((resendCooldownUntil - Date.now()) / 1000))
      : 0

  const resendMagicLink = useCallback(async () => {
    setResendError(null)
    setResendOkFlash(false)
    const to = magicLinkTargetEmail.toLowerCase()
    if (!to || !to.includes('@')) {
      setResendError('We couldn’t find the email you used. Please contact support if you’re stuck.')
      return
    }
    if (Date.now() < resendCooldownUntil) return
    setResendBusy(true)
    const r = await sendMagicLink(to)
    setResendBusy(false)
    if (!r.ok) {
      setResendError(r.message)
      return
    }
    setLastUsedAccountEmail(to)
    onMagicLinkSent()
    setResendCooldownUntil(Date.now() + 60_000)
    setResendOkFlash(true)
    window.setTimeout(() => setResendOkFlash(false), 5000)
  }, [magicLinkTargetEmail, resendCooldownUntil, onMagicLinkSent])

  const backdropDismissible =
    !linkSentHardLocked && (sent ? true : allowNotNow)

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
            onClick={() => {
              if (!backdropDismissible) return
              if (sent) onAcknowledgeLinkSent()
              else onDismissWithoutAccount()
            }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={
              sent
                ? linkSentHardLocked && !welcomeBack
                  ? 'save-progress-unlock-gate'
                  : welcomeBack
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
                        You&apos;ve already completed{' '}
                        <span className="font-semibold text-white">{sessionsCompleted}</span> learning swipe
                        {sessionsCompleted === 1 ? '' : 's'}! Sign in or create an account to preserve your progress.
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
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  role="status"
                  aria-live="polite"
                >
                  {linkSentHardLocked && !welcomeBack ? (
                    <>
                      <h2
                        id="save-progress-unlock-gate"
                        className="text-center text-lg font-bold leading-snug text-white"
                      >
                        Unlimited learning is one tap away
                      </h2>
                      <p className="mt-3 text-center text-sm leading-relaxed text-white/85">
                        Your progress is saved and waiting. Click the link in your email to unlock unlimited learning.
                      </p>
                      {magicLinkTargetEmail ? (
                        <p className="mt-3 text-center text-xs text-white/40">
                          Sent to <span className="text-white/55">{magicLinkTargetEmail}</span>
                        </p>
                      ) : null}
                      {resendOkFlash ? (
                        <p className="mt-4 text-center text-sm font-medium text-emerald-300/95">
                          Another link is on its way.
                        </p>
                      ) : null}
                      {resendError ? (
                        <p className="mt-3 text-center text-xs font-medium text-rose-300">{resendError}</p>
                      ) : null}
                      <button
                        type="button"
                        disabled={resendBusy || resendSecondsLeft > 0 || !magicLinkTargetEmail}
                        onClick={() => void resendMagicLink()}
                        className="mt-5 w-full rounded-xl border border-white/25 bg-white/10 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {resendBusy
                          ? 'Sending…'
                          : resendSecondsLeft > 0
                            ? `Resend link (${resendSecondsLeft}s)`
                            : 'Resend link'}
                      </button>
                      <p className="mt-4 text-center text-xs leading-relaxed text-white/50">
                        Emails can take a few minutes—check spam or promotions.
                      </p>
                    </>
                  ) : (
                    <>
                      <h2
                        id={welcomeBack ? 'save-progress-welcome-sent' : 'save-progress-link-sent'}
                        className="text-center text-lg font-bold leading-snug text-white"
                      >
                        Link sent
                      </h2>
                      {welcomeBack ? (
                        <p className="mt-3 text-center text-sm leading-relaxed text-white/80">
                          We&apos;ve sent you a link. Enter through the link and continue your Chinese master journey.
                        </p>
                      ) : (
                        <p className="mt-3 text-center text-sm leading-relaxed text-white/80">
                          We&apos;ve sent you a link to preserve your progress. Enter through the link and continue your
                          Chinese master journey.
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={onAcknowledgeLinkSent}
                        className="mt-5 w-full rounded-xl border border-white/20 bg-transparent py-3 text-sm font-semibold text-white/90 transition-colors hover:bg-white/10"
                      >
                        OK, I will continue through the email link.
                      </button>
                      <button
                        type="button"
                        onClick={goBackToEmail}
                        className="mt-4 w-full py-2 text-center text-sm font-semibold text-white/45 transition-colors hover:text-white/65"
                      >
                        Use a different email
                      </button>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
