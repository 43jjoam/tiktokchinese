import { AnimatePresence, motion } from 'framer-motion'

type Props = {
  open: boolean
}

/**
 * High-contrast pop-out notice while redirecting to Shopify checkout (same window).
 */
export function SecuringCheckoutToast({ open }: Props) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          initial={{ opacity: 0, y: 20, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-[200] w-[min(calc(100vw-1.5rem),24rem)] -translate-x-1/2 px-2"
        >
          <div className="flex items-start gap-3 rounded-2xl border-2 border-amber-400 bg-gradient-to-br from-zinc-900 to-zinc-950 px-4 py-4 shadow-[0_0_0_1px_rgba(251,191,36,0.35),0_20px_50px_rgba(0,0,0,0.75)] ring-1 ring-amber-300/30">
            <span
              className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/25 text-base"
              aria-hidden
            >
              🛒
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-[15px] font-bold leading-tight text-white">Opening checkout</p>
              <p className="mt-1 text-sm leading-snug text-amber-100/90">
                A new tab opens for payment — you stay here to activate in Library after.
              </p>
            </div>
            <span
              className="mt-1 inline-block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-amber-200/25 border-t-amber-300"
              aria-hidden
            />
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
