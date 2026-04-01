import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useState } from 'react'
import { HSK1_CHECKOUT_URL } from '../lib/hsk1Checkout'

/** Re-export for callers that import from the paywall module. */
export { HSK1_CHECKOUT_URL } from '../lib/hsk1Checkout'

type Props = {
  open: boolean
  /** Unique CC1 seen — drives "You've met X characters" headline. */
  uniqueCc1Seen: number
  /** At unique CC1 cap (50): only Buy + Invite; no "tomorrow". */
  hardPaywallOnly?: boolean
  /** At 66 cards: Buy only — no Invite, no Tomorrow. */
  finalGateOnly?: boolean
  /** Copy tweak for invitee (referred_by set). */
  referredInvitee?: boolean
  /** Invite URL (e.g. `origin/?ref=CODE`); if empty, copy still uses origin. */
  inviteUrl: string
  /** Your 8-character referral code for friends who type it in Library. */
  inviteCode: string | null
  onBuyNow: () => void
  onCopyInvite: () => void
  onRemindTomorrow: () => void
}

export function ConversionUnlockModal({
  open,
  uniqueCc1Seen,
  hardPaywallOnly = false,
  finalGateOnly = false,
  inviteUrl,
  inviteCode,
  onBuyNow,
  onCopyInvite,
  onRemindTomorrow,
}: Props) {
  const [inviteCopied, setInviteCopied] = useState(false)
  const [checkoutBusy, setCheckoutBusy] = useState(false)

  const copyInvite = useCallback(async () => {
    const text = inviteUrl.trim() || window.location.origin + '/'
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.setAttribute('readonly', '')
        ta.style.position = 'fixed'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      } catch {
        /* ignore */
      }
    }
    setInviteCopied(true)
    window.setTimeout(() => setInviteCopied(false), 2000)
    onCopyInvite()
  }, [inviteUrl, onCopyInvite])

  const goToHsk1Checkout = useCallback(() => {
    if (checkoutBusy) return
    setCheckoutBusy(true)
    onBuyNow()
    window.setTimeout(() => {
      window.location.href = HSK1_CHECKOUT_URL
    }, 50)
  }, [onBuyNow, checkoutBusy])

  const headline = finalGateOnly
    ? "You've seen everything free. HSK 1 is next \u2014 AUD $4.99."
    : hardPaywallOnly
    ? "You've met all the free characters. Keep going \u2014 choose how:"
    : `You've met ${uniqueCc1Seen} characters. Keep going \u2014 choose how:`

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="conversion-unlock-root"
          className="fixed inset-0 z-[125] flex flex-col items-center justify-end sm:justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div aria-hidden className="absolute inset-0 bg-black/75" />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="conversion-unlock-title"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className="relative z-[1] flex max-h-[min(92dvh,40rem)] w-full max-w-[min(100vw-2rem,26rem)] flex-col overflow-y-auto rounded-2xl border border-white/12 bg-zinc-950 shadow-[0_24px_64px_rgba(0,0,0,0.65)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pb-4 pt-6 sm:px-6 sm:pt-8">
              <h2
                id="conversion-unlock-title"
                className="text-center text-lg font-bold leading-snug text-white sm:text-xl"
              >
                {headline}
              </h2>
              {!finalGateOnly ? (
                <p className="mt-2 text-center text-sm text-white/50">
                  Pick what feels right. No pressure.
                </p>
              ) : null}

              <div className="mt-6 flex flex-col gap-3">
                {/* Buy — recommended */}
                <div className="relative rounded-2xl border border-amber-500/45 bg-gradient-to-br from-amber-950/50 to-zinc-950/80 p-4 shadow-[0_0_0_1px_rgba(245,158,11,0.12)]">
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full border border-amber-500/40 bg-amber-950/95 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200/95">
                    Recommended
                  </div>
                  <div className="flex gap-3">
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-800/80 text-lg"
                      aria-hidden
                    >
                      🛒
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-bold text-white">
                        Unlock HSK 1 \u2014 100 cinematic vocab videos
                      </h3>
                      <p className="mt-1 text-sm leading-snug text-white/60">
                        100 cinematic vocab videos. The 150 most essential Mandarin words. Yours forever.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={goToHsk1Checkout}
                    disabled={checkoutBusy}
                    className="mt-4 w-full rounded-2xl bg-amber-500 py-3 text-sm font-semibold text-white shadow-[0_4px_20px_rgba(245,158,11,0.3)] transition-all hover:bg-amber-400 active:scale-[0.98] active:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {checkoutBusy ? 'Securing Checkout...' : 'Buy now \u00b7 AUD $4.99'}
                  </button>
                </div>

                {/* Invite — hidden at final gate */}
                {!finalGateOnly ? (
                  <div className="rounded-2xl border border-sky-500/30 bg-gradient-to-br from-sky-950/35 to-zinc-950/80 p-4">
                    <div className="flex gap-3">
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-700/70 text-lg"
                        aria-hidden
                      >
                        🔗
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-base font-bold text-white">Invite a friend</h3>
                        <p className="mt-1 text-sm leading-snug text-white/60">
                          Share your link \u2014 when your friend joins, you unlock 20 more cards and they get 10 free.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyInvite()}
                      className="mt-4 w-full rounded-2xl bg-black py-3 text-sm font-semibold text-white ring-1 ring-white/15 shadow-[0_4px_20px_rgba(0,0,0,0.45)] transition-all hover:bg-zinc-900 active:scale-[0.98] active:opacity-90"
                    >
                      {inviteCopied ? 'Link copied!' : 'Copy my invite link'}
                    </button>
                    {inviteCode?.trim() ? (
                      <p className="mt-2 text-center text-xs text-white/35">
                        Your code: {inviteCode.trim().toUpperCase()}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {/* Come back tomorrow — soft gate only */}
                {!hardPaywallOnly && !finalGateOnly ? (
                  <div className="rounded-2xl border border-emerald-500/28 bg-gradient-to-br from-emerald-950/35 to-zinc-950/80 p-4">
                    <div className="flex gap-3">
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-800/70 text-lg"
                        aria-hidden
                      >
                        🕐
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-base font-bold text-white">Come back tomorrow</h3>
                        <p className="mt-1 text-sm leading-snug text-white/60">
                          Your streak continues. 10 more characters unlock free when you return tomorrow.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onRemindTomorrow}
                      className="mt-4 w-full rounded-2xl bg-black py-3 text-sm font-semibold text-white ring-1 ring-white/15 shadow-[0_4px_20px_rgba(0,0,0,0.45)] transition-all hover:bg-zinc-900 active:scale-[0.98] active:opacity-90"
                    >
                      Remind me tomorrow
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
