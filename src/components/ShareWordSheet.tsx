import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { WordMetadata } from '../lib/types'
import {
  IconEmail,
  IconFacebook,
  IconInstagram,
  IconLink,
  IconSms,
  IconSystemShare,
  IconWhatsApp,
} from './ShareChannelIcons'
import {
  buildChallengeShareText,
  buildShareUrl,
  engagementShareSuccess,
  engagementShareTap,
  isNavigatorShareSupported,
  recordLocalShare,
  resolveShareUrlForWord,
  type ShareSuccessMethod,
} from '../lib/engagementService'

type Props = {
  open: boolean
  word: WordMetadata | null
  onClose: () => void
}

const sheetTransition = { type: 'tween' as const, duration: 0.28, ease: [0.32, 0.72, 0, 1] as const }

const INSTAGRAM_TOAST_MS = 3000

function ShareChannelTile({
  icon,
  label,
  onClick,
  muted,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
  muted?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex shrink-0 flex-col items-center gap-1.5 rounded-xl px-1.5 py-2 transition-colors active:bg-white/10 ${
        muted ? 'opacity-95' : ''
      }`}
      aria-label={label}
    >
      {icon}
      <span className="max-w-[4.85rem] text-center text-[10px] font-semibold leading-tight text-white/90">{label}</span>
    </button>
  )
}

function facebookSharerUrl(sharePageUrl: string): string {
  const u = encodeURIComponent(sharePageUrl)
  if (typeof navigator === 'undefined') {
    return `https://www.facebook.com/sharer/sharer.php?u=${u}`
  }
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  return mobile ? `https://m.facebook.com/sharer.php?u=${u}` : `https://www.facebook.com/sharer/sharer.php?u=${u}`
}

/**
 * Open a third-party URL in a new tab without replacing this SPA.
 * Use a single path: `window.open` + `<a click>` fallback caused two tabs when `open`
 * returned null even though a window had already opened.
 */
function openExternalUrlInNewTab(url: string): void {
  const a = document.createElement('a')
  a.href = url
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

async function copyTextForShare(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

export function ShareWordSheet({ open, word, onClose }: Props) {
  const [canWebShare, setCanWebShare] = useState(false)
  const [instagramToast, setInstagramToast] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState('')

  useEffect(() => {
    setCanWebShare(isNavigatorShareSupported())
  }, [open])

  useEffect(() => {
    if (!open || !word) {
      setShareUrl('')
      return
    }
    let cancelled = false
    const fallback = buildShareUrl(word.word_id)
    setShareUrl(fallback)
    void resolveShareUrlForWord(word).then((u) => {
      if (!cancelled) setShareUrl(u)
    })
    return () => {
      cancelled = true
    }
  }, [open, word])

  useEffect(() => {
    if (!open) setInstagramToast(null)
  }, [open])

  const close = useCallback(() => {
    onClose()
  }, [onClose])

  const afterChannel = useCallback(
    async (method: ShareSuccessMethod) => {
      if (!word) return
      await engagementShareSuccess(word, method)
      close()
    },
    [word, close],
  )

  const primeChannel = useCallback(async () => {
    if (!word) return
    recordLocalShare(word.word_id)
    await engagementShareTap(word)
  }, [word])

  /** Open share target in the same user gesture (no await before open) so popups are not blocked. */
  const runFacebook = useCallback(() => {
    if (!word) return
    const pageUrl = shareUrl || buildShareUrl(word.word_id)
    const fbUrl = facebookSharerUrl(pageUrl)
    openExternalUrlInNewTab(fbUrl)
    void (async () => {
      await primeChannel()
      await afterChannel('facebook')
    })()
  }, [word, shareUrl, primeChannel, afterChannel])

  const runWhatsApp = useCallback(() => {
    if (!word) return
    const pageUrl = shareUrl || buildShareUrl(word.word_id)
    const text = buildChallengeShareText(word, pageUrl)
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`
    openExternalUrlInNewTab(waUrl)
    void (async () => {
      await primeChannel()
      await afterChannel('whatsapp')
    })()
  }, [word, shareUrl, primeChannel, afterChannel])

  const runSms = useCallback(() => {
    if (!word) return
    const pageUrl = shareUrl || buildShareUrl(word.word_id)
    const body = buildChallengeShareText(word, pageUrl)
    window.location.href = `sms:?&body=${encodeURIComponent(body)}`
    void (async () => {
      await primeChannel()
      await afterChannel('sms')
    })()
  }, [word, shareUrl, primeChannel, afterChannel])

  const runEmail = useCallback(() => {
    if (!word) return
    const pageUrl = shareUrl || buildShareUrl(word.word_id)
    const subject = `Chinese Flash — ${word.character}`
    const body = buildChallengeShareText(word, pageUrl)
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    void (async () => {
      await primeChannel()
      await afterChannel('email')
    })()
  }, [word, shareUrl, primeChannel, afterChannel])

  /**
   * Instagram does not offer a stable web URL to hand off text into feed/DM.
   * We copy the challenge message; user pastes inside the app.
   * Clipboard must run before any other await (e.g. analytics) or the browser blocks copy.
   */
  const runInstagramPaste = useCallback(() => {
    if (!word) return
    setInstagramToast(null)
    const url = shareUrl || buildShareUrl(word.word_id)
    const text = buildChallengeShareText(word, url)
    void copyTextForShare(text).then((ok) => {
      if (!ok) {
        setInstagramToast(
          'Couldn’t copy. Try “More” (system share), “Copy link”, or allow clipboard access for this site.',
        )
        window.setTimeout(() => setInstagramToast(null), INSTAGRAM_TOAST_MS)
        return
      }
      setInstagramToast('Copied. Open Instagram and paste in a chat.')
      // Dismiss on a fixed delay from *now* — do not wait on analytics or the timer never
      // starts (or starts late) if the network is slow or a request hangs on mobile.
      window.setTimeout(() => setInstagramToast(null), INSTAGRAM_TOAST_MS)
      void (async () => {
        try {
          await primeChannel()
          await engagementShareSuccess(word, 'instagram')
        } catch {
          /* analytics must not block toast timing */
        }
      })()
    })
  }, [word, shareUrl, primeChannel])

  const runCopyLink = useCallback(async () => {
    if (!word) return
    await primeChannel()
    const url = shareUrl || buildShareUrl(word.word_id)
    try {
      await navigator.clipboard.writeText(url)
      await engagementShareSuccess(word, 'copy')
    } catch {
      /* */
    }
    close()
  }, [word, shareUrl, primeChannel, close])

  const runSystemShare = useCallback(async () => {
    if (!word) return
    const url = shareUrl || buildShareUrl(word.word_id)
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({
          title: 'Chinese Flash',
          text: buildChallengeShareText(word, url),
          url,
        })
        await primeChannel()
        await engagementShareSuccess(word, 'web_share')
        close()
        return
      }
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') {
        close()
        return
      }
    }
    try {
      await navigator.clipboard.writeText(buildChallengeShareText(word, url))
      await primeChannel()
      await engagementShareSuccess(word, 'copy')
    } catch {
      /* */
    }
    close()
  }, [word, shareUrl, primeChannel, close])

  return (
    <AnimatePresence>
      {open && word ? (
        <>
          <motion.button
            key="share-backdrop"
            type="button"
            aria-label="Close share menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] bg-black/60"
            onClick={close}
          />
          <AnimatePresence>
            {instagramToast ? (
              <motion.div
                key="instagram-toast"
                role="status"
                aria-live="polite"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="pointer-events-none fixed inset-0 z-[110] flex items-center justify-center px-5"
              >
                <div className="w-full max-w-xs rounded-2xl bg-zinc-900/95 px-5 py-4 text-center text-sm font-semibold leading-snug text-white shadow-[0_16px_48px_rgba(0,0,0,0.55)] ring-1 ring-white/15 backdrop-blur-sm">
                  {instagramToast}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
          <motion.div
            key="share-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-sheet-title"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={sheetTransition}
            className="fixed inset-x-0 bottom-0 z-[101] max-h-[min(88vh,720px)] overflow-y-auto overscroll-contain rounded-t-3xl border border-white/10 border-b-0 bg-zinc-950 px-4 shadow-[0_-12px_40px_rgba(0,0,0,0.55)]"
            style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-white/20" />
            <h2
              id="share-sheet-title"
              className="mt-5 px-2 text-center text-base font-bold leading-snug text-white"
            >
              Ask a family or a friend to guess the meaning of{' '}
              <span lang="zh-Hans" className="inline-block text-2xl font-bold tracking-tight text-white">
                {word.character}
              </span>
            </h2>

            <div className="mt-8 pb-1">
              <div className="-mx-1 flex flex-nowrap gap-1 overflow-x-auto overscroll-x-contain px-1 pb-2 [-webkit-overflow-scrolling:touch]">
                <ShareChannelTile icon={<IconFacebook />} label="Facebook" onClick={runFacebook} />
                <ShareChannelTile icon={<IconInstagram />} label="Instagram" onClick={runInstagramPaste} />
                <ShareChannelTile icon={<IconSms />} label="Messages" onClick={runSms} />
                <ShareChannelTile icon={<IconWhatsApp />} label="WhatsApp" onClick={runWhatsApp} />
                <ShareChannelTile icon={<IconEmail />} label="Email" onClick={runEmail} />
                {canWebShare ? (
                  <ShareChannelTile icon={<IconSystemShare />} label="More" onClick={() => void runSystemShare()} />
                ) : null}
                <ShareChannelTile icon={<IconLink />} label="Copy link" muted onClick={() => void runCopyLink()} />
              </div>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  )
}
