import { AnimatePresence, motion } from 'framer-motion'
import { useCallback } from 'react'
import {
  CONVERSION_HSK1_TOTAL_VIDEOS_CHARS,
  getCc1PoolSize,
  getHsk1ShopUrl,
} from '../lib/conversionUnlock'

type Props = {
  open: boolean
  /** 20 cold user, 30 if this account was referred — drives headline “X characters”. */
  gateThreshold: number
  /** At unique CC1 cap (50): only Buy + Invite; no “tomorrow”. */
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
  onCopyInviteCode: () => void
  onRemindTomorrow: () => void
}

export function ConversionUnlockModal({
  open,
  gateThreshold,
  hardPaywallOnly = false,
  finalGateOnly = false,
  referredInvitee = false,
  inviteUrl,
  inviteCode,
  onBuyNow,
  onCopyInvite,
  onCopyInviteCode,
  onRemindTomorrow,
}: Props) {
  const pool = getCc1PoolSize()
  const shopUrl = getHsk1ShopUrl()

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
    onCopyInvite()
  }, [inviteUrl, onCopyInvite])

  const copyCodeOnly = useCallback(async () => {
    const code = inviteCode?.trim()
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      try {
        const ta = document.createElement('textarea')
        ta.value = code
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
    onCopyInviteCode()
  }, [inviteCode, onCopyInviteCode])

  const openShop = useCallback(() => {
    window.open(shopUrl, '_blank', 'noopener,noreferrer')
    onBuyNow()
  }, [onBuyNow, shopUrl])

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
          <div
            aria-hidden
            className="absolute inset-0 bg-black/75"
          />
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
                {finalGateOnly ? (
                  <>
                    You&apos;ve used all your free Character 1 videos ({pool} in the full deck).
                  </>
                ) : hardPaywallOnly ? (
                  <>
                    You&apos;ve reached your free Character 1 limit ({pool} videos in the full deck).
                  </>
                ) : (
                  <>
                    You&apos;ve learned {gateThreshold} characters out of {pool}. Keep going — choose how:
                  </>
                )}
              </h2>
              <p className="mt-2 text-center text-sm text-white/50">
                {finalGateOnly
                  ? "Buy the bundle to keep learning — that's the one remaining path."
                  : hardPaywallOnly
                  ? "Buy the bundle or invite a friend — that's how you keep learning past this point."
                  : "Pick what feels right. No pressure."}
              </p>

              <div className="mt-6 flex flex-col gap-3">
                {/* Paid — recommended */}
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
                      <h3 className="text-base font-bold text-white">Unlock HSK 1 — {CONVERSION_HSK1_TOTAL_VIDEOS_CHARS} videos &amp; characters</h3>
                      <p className="mt-1 text-sm leading-snug text-white/60">
                        Cinematic vocab across HSK 1. Includes the Chinese Characters 1 deck — yours forever with this
                        purchase.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={openShop}
                    className="mt-4 w-full rounded-xl bg-black py-3.5 text-sm font-bold text-white transition-opacity hover:opacity-95 active:opacity-90"
                  >
                    Buy now · AUD $4.99
                  </button>
                </div>

                {/* Invite — hidden at final gate */}
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
                          {referredInvitee
                            ? 'Invite someone — you unlock 20 more cards; they get 10 when they join.'
                            : 'Share your link or code. When your friend signs up, you get 20 more cards and they get 10 — free.'}
                        </p>
                      </div>
                    </div>
                    {inviteCode?.trim() ? (
                      <div className="mt-3 rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-center">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/45">Your invite code</p>
                        <p className="mt-1 font-mono text-lg font-bold tracking-[0.2em] text-sky-100">
                          {inviteCode.trim().toUpperCase()}
                        </p>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void copyInvite()}
                      className="mt-4 w-full rounded-xl bg-black py-3.5 text-sm font-bold text-white transition-opacity hover:opacity-95 active:opacity-90"
                    >
                      Copy my invite link
                    </button>
                    {inviteCode?.trim() ? (
                      <button
                        type="button"
                        onClick={() => void copyCodeOnly()}
                        className="mt-2 w-full rounded-xl border border-white/15 bg-white/[0.06] py-3 text-sm font-bold text-white/90 transition-colors hover:bg-white/[0.09] active:opacity-95"
                      >
                        Copy invite code only
                      </button>
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
                          Your streak continues. The feed stays paused until tomorrow — then +10 more cards unlock.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onRemindTomorrow}
                      className="mt-4 w-full rounded-xl bg-black py-3.5 text-sm font-bold text-white transition-opacity hover:opacity-95 active:opacity-90"
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
