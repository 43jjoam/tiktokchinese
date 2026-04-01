import { AnimatePresence, motion } from 'framer-motion'

type Props = {
  open: boolean
}

/**
 * Shown after HSK 1 checkout opens in a new tab so the user knows to stay in-app and use Library.
 */
export function PostCheckoutLibraryHint({ open }: Props) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
          className="pointer-events-none fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 z-[150] w-[min(calc(100vw-1.5rem),24rem)] -translate-x-1/2 px-2"
        >
          <div className="rounded-2xl border border-sky-400/50 bg-zinc-950/95 px-4 py-3.5 shadow-[0_12px_40px_rgba(0,0,0,0.55)] ring-1 ring-sky-500/20 backdrop-blur-sm">
            <p className="text-sm font-semibold text-white">Checkout opened in a new tab</p>
            <p className="mt-1.5 text-xs leading-relaxed text-sky-100/90">
              Finish payment there. After you pay, tap <span className="font-semibold text-white">Library</span>{' '}
              in the bar below and enter your activation code to unlock HSK 1.
            </p>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
