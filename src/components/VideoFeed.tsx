import { AnimatePresence, motion } from 'framer-motion'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SessionSignals, SwipeDirection, TapTiming, WordMetadata, WordState } from '../lib/types'
import { classifyTapTiming, computeTapRateAdaptiveAlpha, loopsElapsedFromMs, updateWordState } from '../lib/memoryEngine'
import {
  loadCurrentWordId,
  loadPersistedState,
  saveCurrentWordId,
  savePersistedState,
  type AppMeta,
} from '../lib/storage'
import { getSupabaseClient } from '../lib/deckService'
import { getLikeStatus, toggleLike } from '../lib/likeService'
import {
  createLessonVideoSignedUrl,
  peekCachedLessonVideoSignedUrl,
  prefetchLessonVideoSignedUrls,
} from '../lib/storageVideoUrl'
import { words as wordDataset } from '../data/words'
import { getSwipeEncouragementBundle, resolveSwipeEncouragementLang } from '../lib/swipeEncouragement'

const LOOP_MS = 5000

/** At least ~1.5s; if the next clip is slower, the layer stays until it can play. */
const SWIPE_ENCOURAGEMENT_MIN_MS = 1500

function randomEncouragementIndex(length: number, lastIdx: number | null): number {
  if (length <= 1) return 0
  if (lastIdx == null) return Math.floor(Math.random() * length)
  let i = Math.floor(Math.random() * length)
  let guard = 0
  while (i === lastIdx && guard++ < 12) {
    i = Math.floor(Math.random() * length)
  }
  if (i === lastIdx) i = (lastIdx + 1) % length
  return i
}

const swipeEncFont = "'Outfit', system-ui, sans-serif"

const swipeEncBackdropVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] },
  },
  exit: { opacity: 0, transition: { duration: 0.2 } },
} as const

const swipeEncCardVariants = {
  hidden: { opacity: 0, scale: 0.92, y: 12 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 420, damping: 32, mass: 0.85 },
  },
  exit: { opacity: 0, scale: 0.98, y: -6, transition: { duration: 0.18 } },
} as const

const swipeEncWordsContainer = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.045, delayChildren: 0.06 },
  },
} as const

const swipeEncWordItem = {
  hidden: { opacity: 0, y: 18, rotateX: -35, filter: 'blur(8px)' },
  show: {
    opacity: 1,
    y: 0,
    rotateX: 0,
    filter: 'blur(0px)',
    transition: { type: 'spring', stiffness: 380, damping: 26 },
  },
} as const

const assetBase = import.meta.env.BASE_URL
const SWIPE_LEFT_MASCOT_PNG = `${assetBase}images/swipe-left-mascot.png`
const SWIPE_LEFT_MASCOT_WEBM = `${assetBase}images/swipe-left-mascot.webm`
const SWIPE_LEFT_MASCOT_MP4 = `${assetBase}images/swipe-left-mascot.mp4`

/** Optional: full HTTPS URL if the file is too large for git or you host on Supabase/CDN. */
const REMOTE_SWIPE_LEFT_MASCOT_WEBM = (
  import.meta.env.VITE_SWIPE_LEFT_MASCOT_WEBM_URL as string | undefined
)?.trim()
const REMOTE_SWIPE_LEFT_MASCOT_MP4 = (
  import.meta.env.VITE_SWIPE_LEFT_MASCOT_VIDEO_URL as string | undefined
)?.trim()

/** Left-swipe encouragement clips in public/images/ (spaces OK — URL-encoded when loaded). */
const TACO_ENCOURAGEMENT_VIDEOS = [
  'taco encouraging A.mp4',
  'taco encouraging B.mp4',
  'taco encouraging C.mp4',
  'taco encouraging D.mp4',
] as const

function publicImagesVideoUrl(fileName: string) {
  return `${assetBase}images/${encodeURIComponent(fileName)}`
}

const CONFETTI_COLORS = [
  '#fcd34d',
  '#f472b6',
  '#38bdf8',
  '#c084fc',
  '#fb7185',
  '#4ade80',
  '#fb923c',
  '#fef08a',
  '#ffffff',
  '#facc15',
  '#e879f9',
] as const

function PaperFlashBursts() {
  const flashes = useMemo(
    () => [
      { x: '14%', y: '24%', c: 'rgba(253, 224, 71, 0.55)', delay: 0 },
      { x: '86%', y: '20%', c: 'rgba(244, 114, 182, 0.5)', delay: 0.06 },
      { x: '50%', y: '12%', c: 'rgba(255, 255, 255, 0.45)', delay: 0.1 },
      { x: '22%', y: '72%', c: 'rgba(56, 189, 248, 0.45)', delay: 0.14 },
      { x: '78%', y: '68%', c: 'rgba(192, 132, 252, 0.5)', delay: 0.18 },
      { x: '48%', y: '88%', c: 'rgba(251, 191, 36, 0.4)', delay: 0.22 },
    ],
    [],
  )

  return (
    <>
      {flashes.map((f, i) => (
        <motion.div
          key={i}
          aria-hidden
          className="absolute inset-0 mix-blend-screen"
          style={{
            background: `radial-gradient(ellipse 65% 50% at ${f.x} ${f.y}, ${f.c}, transparent 70%)`,
          }}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{
            opacity: [0, 1, 0.25, 0.75, 0.15, 0],
            scale: [0.85, 1.12, 1, 1.06, 1.02, 1],
          }}
          transition={{
            duration: 1.35,
            delay: f.delay,
            times: [0, 0.12, 0.28, 0.45, 0.65, 1],
            ease: 'easeOut',
          }}
        />
      ))}
    </>
  )
}

function RightSwipeConfettiBurst() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 72 }, (_, i) => {
        const golden = ((i + 1) * 0.6180339887) % 1
        const angle = golden * Math.PI * 2 + (i % 5) * 0.31
        const dist = 95 + (i % 13) * 19 + (i % 7) * 11
        const delay = (i % 12) * 0.012
        const w = 4 + (i % 6)
        const h = 5 + (i % 8)
        const rot = (i * 47) % 360
        return { i, angle, dist, delay, w, h, rot, color: CONFETTI_COLORS[i % CONFETTI_COLORS.length] }
      }),
    [],
  )

  return (
    <div
      className="pointer-events-none absolute left-1/2 top-[40%] h-0 w-0 overflow-visible"
      aria-hidden
    >
      {pieces.map((p) => (
        <motion.div
          key={p.i}
          className="absolute rounded-[1px] shadow-sm"
          style={{
            width: p.w,
            height: p.h,
            left: -p.w / 2,
            top: -p.h / 2,
            backgroundColor: p.color,
            boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
          }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: p.rot, scale: 1 }}
          animate={{
            x: Math.cos(p.angle) * p.dist,
            y: Math.sin(p.angle) * p.dist * 0.52 + Math.abs(Math.sin(p.angle * 2)) * 55 + 35,
            opacity: [1, 1, 0],
            rotate: p.rot + (p.i % 2 === 0 ? 280 : -260),
            scale: [1, 1.15, 0.35],
          }}
          transition={{
            duration: 1.05 + (p.i % 5) * 0.08,
            delay: p.delay,
            ease: [0.22, 0.61, 0.36, 1],
          }}
        />
      ))}
    </div>
  )
}

/**
 * Taco encouragement: sharp clip centered on top. Blurred frosted feed + glass accents match right-swipe
 * (see SwipeEncouragementFrostedBackdrop / SwipeEncouragementGlassAccents). Random local taco or remote URLs.
 */
function SwipeLeftTacoEncouragementBlock({
  variantKey,
  text,
  wordGradient,
}: {
  variantKey: string
  text: string
  wordGradient: string
}) {
  const [useImageFallback, setUseImageFallback] = useState(false)
  const fgRef = useRef<HTMLVideoElement>(null)

  const useRemote = Boolean(REMOTE_SWIPE_LEFT_MASCOT_MP4 || REMOTE_SWIPE_LEFT_MASCOT_WEBM)

  const localTacoSrc = useMemo(() => {
    const idx = Math.floor(Math.random() * TACO_ENCOURAGEMENT_VIDEOS.length)
    return publicImagesVideoUrl(TACO_ENCOURAGEMENT_VIDEOS[idx])
  }, [variantKey])

  useEffect(() => {
    if (useImageFallback) return
    const playFg = () => {
      const v = fgRef.current
      if (!v) return
      try {
        void v.play()
      } catch {
        /* autoplay */
      }
    }
    playFg()
    const id = window.setTimeout(playFg, 120)
    return () => window.clearTimeout(id)
  }, [useImageFallback, useRemote, localTacoSrc])

  if (useImageFallback) {
    return (
      <div className="relative z-10 flex min-h-full w-full flex-col items-center justify-center gap-3 overflow-hidden sm:gap-4">
        <div className="relative z-10 flex max-w-[min(22rem,94vw)] flex-col items-center gap-3 sm:gap-4">
          <motion.img
            src={SWIPE_LEFT_MASCOT_PNG}
            alt=""
            aria-hidden
            className="h-auto max-h-[min(34vh,220px)] w-auto max-w-[min(78vw,260px)] object-contain [filter:drop-shadow(0_12px_28px_rgba(0,0,0,0.5))]"
            initial={{ scale: 0.55, opacity: 0, y: 16 }}
            animate={{
              scale: 1,
              opacity: 1,
              y: [0, -6, 0],
            }}
            transition={{
              scale: { type: 'spring', stiffness: 380, damping: 22, mass: 0.9 },
              opacity: { duration: 0.35 },
              y: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' },
            }}
          />
          <EncouragementWordCard text={text} wordGradient={wordGradient} compact />
        </div>
      </div>
    )
  }

  const videoKey = useRemote ? 'remote-mascot' : localTacoSrc

  return (
    <div className="relative z-10 flex min-h-full w-full flex-col items-center justify-center overflow-hidden">
      <div className="relative z-10 flex max-w-[min(22rem,94vw)] flex-col items-center gap-3 px-4 sm:gap-4 sm:px-6">
        <motion.div
          initial={{ scale: 0.55, opacity: 0, y: 16 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 22, mass: 0.9 }}
        >
          <video
            ref={fgRef}
            key={`fg-${videoKey}`}
            src={useRemote ? undefined : localTacoSrc}
            className="mx-auto block h-auto max-h-[min(34vh,220px)] w-auto max-w-[min(78vw,260px)] object-contain [filter:drop-shadow(0_12px_28px_rgba(0,0,0,0.55))]"
            poster={SWIPE_LEFT_MASCOT_PNG}
            muted
            playsInline
            loop
            autoPlay
            preload="auto"
            aria-hidden
            onError={() => setUseImageFallback(true)}
          >
            {useRemote ? (
              <>
                {REMOTE_SWIPE_LEFT_MASCOT_WEBM ? (
                  <source src={REMOTE_SWIPE_LEFT_MASCOT_WEBM} type="video/webm" />
                ) : null}
                {REMOTE_SWIPE_LEFT_MASCOT_MP4 ? (
                  <source src={REMOTE_SWIPE_LEFT_MASCOT_MP4} type="video/mp4" />
                ) : null}
              </>
            ) : null}
          </video>
        </motion.div>
        <EncouragementWordCard text={text} wordGradient={wordGradient} compact />
      </div>
    </div>
  )
}

function EncouragementWordCard({
  text,
  wordGradient,
  compact,
}: {
  text: string
  wordGradient: string
  compact?: boolean
}) {
  const words = text.split(/\s+/).filter(Boolean)
  return (
    <motion.div
      aria-hidden
      variants={swipeEncCardVariants}
      initial="hidden"
      animate="show"
      exit="exit"
      className={`relative rounded-2xl border border-white/45 bg-white/35 shadow-[0_12px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl backdrop-saturate-150 ${
        compact
          ? 'max-w-[min(20rem,90vw)] px-4 py-4 sm:px-5 sm:py-5'
          : 'max-w-[min(22rem,92vw)] px-5 py-6 sm:px-7 sm:py-7'
      }`}
      style={{
        fontFamily: swipeEncFont,
        perspective: 640,
      }}
    >
      <motion.div
        variants={swipeEncWordsContainer}
        initial="hidden"
        animate="show"
        className={`flex flex-wrap justify-center gap-x-[0.35em] gap-y-1 text-center font-semibold leading-snug ${
          compact ? 'text-[0.98rem] sm:text-lg' : 'text-[1.05rem] sm:text-xl sm:leading-snug'
        }`}
      >
        {words.map((w, i) => (
          <motion.span key={`${text}-${i}-${w}`} variants={swipeEncWordItem} className={wordGradient}>
            {w}
          </motion.span>
        ))}
      </motion.div>
      <motion.div
        aria-hidden
        className="mx-auto mt-3 h-0.5 max-w-[4.5rem] rounded-full bg-gradient-to-r from-transparent via-white/55 to-transparent sm:mt-4"
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={{ delay: 0.35, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      />
    </motion.div>
  )
}

/** Full-screen frosted whitish glass over the feed (both swipe directions). */
function SwipeEncouragementFrostedBackdrop() {
  return (
    <div
      className="pointer-events-none absolute inset-0 bg-white/[0.2] ring-1 ring-inset ring-white/35 backdrop-blur-2xl backdrop-saturate-150"
      aria-hidden
    />
  )
}

/** Same soft gradient + pulsing blur orb as right-swipe encouragement (shared left/right). */
function SwipeEncouragementGlassAccents() {
  return (
    <>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.12] via-transparent to-amber-50/25"
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[min(28rem,85vw)] w-[min(28rem,85vw)] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40 blur-3xl"
        animate={{
          scale: [1, 1.08, 1],
          opacity: [0.28, 0.42, 0.28],
        }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          background:
            'radial-gradient(circle, rgba(255,255,255,0.55) 0%, rgba(253,230,138,0.22) 38%, rgba(251,207,232,0.18) 55%, transparent 68%)',
        }}
      />
    </>
  )
}

function SwipeTransitionEncouragement({
  dir,
  text,
}: {
  dir: SwipeDirection
  text: string
}) {
  const wordGradientLeft = 'inline-block text-white'
  const wordGradientRight = 'inline-block text-white'

  if (dir === 'right') {
    return (
      <motion.div
        role="status"
        variants={swipeEncBackdropVariants}
        initial="hidden"
        animate="show"
        exit="exit"
        className="pointer-events-none absolute inset-0 z-[4] flex items-center justify-center overflow-hidden px-5 sm:px-8"
        aria-label={text}
      >
        <p className="sr-only">{text}</p>
        <SwipeEncouragementFrostedBackdrop />
        <SwipeEncouragementGlassAccents />
        <PaperFlashBursts />
        <RightSwipeConfettiBurst />
        <div className="relative z-10 flex flex-col items-center">
          <EncouragementWordCard text={text} wordGradient={wordGradientRight} />
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      role="status"
      variants={swipeEncBackdropVariants}
      initial="hidden"
      animate="show"
      exit="exit"
      className="pointer-events-none absolute inset-0 z-[4] flex items-center justify-center overflow-hidden px-5 sm:px-8"
      aria-label={text}
    >
      <p className="sr-only">{text}</p>
      <SwipeEncouragementFrostedBackdrop />
      <SwipeEncouragementGlassAccents />
      <SwipeLeftTacoEncouragementBlock variantKey={text} text={text} wordGradient={wordGradientLeft} />
    </motion.div>
  )
}

/* ── Audio: Chinese TTS ── */
function speakChinese(text: string) {
  try {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = 'zh-CN'
    utter.rate = 0.85
    utter.volume = 1.0
    const voices = window.speechSynthesis.getVoices()
    const zhVoice = voices.find((v) => v.lang.startsWith('zh'))
    if (zhVoice) utter.voice = zhVoice
    window.speechSynthesis.speak(utter)
  } catch {}
}

type SupportedLocale = 'en' | 'zh-TW' | 'th'

function detectSupportedLocale(): SupportedLocale {
  const lang = (navigator.language || '').toLowerCase()
  if (lang.startsWith('th')) return 'th'
  if (lang.includes('zh-hant') || lang.includes('zh-tw')) return 'zh-TW'
  if (lang.startsWith('zh')) return 'zh-TW'
  return 'en'
}

function getRawLangCode(): string {
  const lang = (navigator.language || 'en').toLowerCase()
  return lang.split('-')[0]
}

function langDisplayName(code: string): string {
  try {
    return new Intl.DisplayNames([code], { type: 'language' }).of(code) || code.toUpperCase()
  } catch {
    return code.toUpperCase()
  }
}

const translationCache: Record<string, string> = {}

async function fetchTranslation(text: string, targetLang: string): Promise<string | null> {
  const cacheKey = `${targetLang}::${text}`
  if (translationCache[cacheKey]) return translationCache[cacheKey]
  try {
    const resp = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${targetLang}`
    )
    const data = await resp.json()
    const translated = data?.responseData?.translatedText
    if (translated && translated.toLowerCase() !== text.toLowerCase()) {
      translationCache[cacheKey] = translated
      return translated
    }
    return null
  } catch {
    return null
  }
}

function makeWordStateSeed(word: WordMetadata): WordState {
  return {
    word_id: word.word_id,
    mScore: 0,
    masteryConfirmed: false,
    consecutiveLoop1NoTapSessions: 0,
    lastLoop1NoTapAt: null,
    lastSeenAt: null,
    sessionsSeen: 0,
  }
}

function pickRandomWord(ws: WordMetadata[]): WordMetadata {
  const list = ws.length ? ws : wordDataset
  return list[Math.floor(Math.random() * list.length)]
}

function pickNextWord(args: {
  words: WordMetadata[]
  wordStates: Record<string, WordState>
  roll: number
  /** Total swipe sessions (from meta); used for early onboarding mix */
  sessionsServed: number
}): WordMetadata {
  const { words, wordStates, roll, sessionsServed } = args

  const MASTERY_THRESHOLD = 3.0
  const fallback = () => pickRandomWord(words)

  const isDepsMastered = (w: WordMetadata) => {
    if (!w.dependencies.length) return true
    return w.dependencies.every((depId) => wordStates[depId]?.masteryConfirmed)
  }

  const bucketA: WordMetadata[] = []
  const bucketB: WordMetadata[] = []
  const bucketC: WordMetadata[] = []

  for (const w of words) {
    const st = wordStates[w.word_id]
    const depsOk = isDepsMastered(w)
    if (!depsOk) continue

    if (!st || st.sessionsSeen === 0) bucketA.push(w)
    else if (st.masteryConfirmed || st.mScore >= MASTERY_THRESHOLD) bucketC.push(w)
    else bucketB.push(w)
  }

  const pickFrom = (arr: WordMetadata[]) => {
    if (arr.length === 0) return null
    return arr[Math.floor(Math.random() * arr.length)]
  }

  // Cold start: every eligible word is still "new" (PRD bucket A only). 10/65/25 has no B/C to
  // target — use uniform picks from new words only.
  const coldStart =
    bucketA.length > 0 && bucketB.length === 0 && bucketC.length === 0
  if (coldStart) {
    return pickFrom(bucketA) ?? fallback()
  }

  // First 10 swipe sessions: only never-seen words while bucket A is non-empty, so the feed feels
  // like pure discovery; revision (B/C) starts after session 10.
  if (sessionsServed < 10 && bucketA.length > 0) {
    return pickFrom(bucketA) ?? fallback()
  }

  // Sessions 10–39: bias toward A vs B/C so exploration stays higher than PRD 10% "new" slice.
  const earlyOnboarding =
    sessionsServed >= 10 && sessionsServed < 40 && bucketA.length > 0
  const aFirstThreshold = earlyOnboarding ? 0.35 : 0.1
  const bFirstThreshold = earlyOnboarding ? 0.82 : 0.75

  if (roll < aFirstThreshold) {
    return pickFrom(bucketA) ?? pickFrom(bucketB) ?? pickFrom(bucketC) ?? fallback()
  }
  if (roll < bFirstThreshold) {
    return pickFrom(bucketB) ?? pickFrom(bucketC) ?? pickFrom(bucketA) ?? fallback()
  }
  return pickFrom(bucketC) ?? pickFrom(bucketB) ?? pickFrom(bucketA) ?? fallback()
}

function avatarGradient(wordId: string) {
  let hash = 0
  for (let i = 0; i < wordId.length; i++) hash = (hash * 31 + wordId.charCodeAt(i)) >>> 0
  const h1 = hash % 360
  const h2 = (h1 + 60) % 360
  return `radial-gradient(1200px 800px at 20% 20%, hsla(${h1} 90% 60% / 0.35), transparent 50%), radial-gradient(900px 700px at 70% 60%, hsla(${h2} 85% 55% / 0.28), transparent 55%), linear-gradient(180deg, rgba(0,0,0,0.3), rgba(0,0,0,0.7))`
}

/** Line arrows for swipe hints — not ‹ › so they are not mistaken for buttons. */
function SwipeHintArrowLeft({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? 'text-white'}
      width={44}
      height={44}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden
      style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.85))' }}
    >
      <path
        d="M30 24H10M18 16l-8 8 8 8"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SwipeHintArrowRight({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? 'text-white'}
      width={44}
      height={44}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden
      style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.85))' }}
    >
      <path
        d="M18 24h20M30 16l8 8-8 8"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/shorts/')[1]?.split('/')[0] ?? null
    const v = u.searchParams.get('v')
    if (v) return v
    const parts = u.pathname.split('/').filter(Boolean)
    return parts.length ? parts[parts.length - 1] : null
  } catch {
    return null
  }
}

/* ── YouTube IFrame Player API loader ── */
let ytApiLoaded = false
const ytApiQueue: (() => void)[] = []

function suggestedYoutubeQuality(): string {
  if (typeof window === 'undefined') return 'medium'
  try {
    return window.matchMedia('(max-width: 480px)').matches ? 'small' : 'medium'
  } catch {
    return 'medium'
  }
}

/** Single-short infinite loop (TikTok-style) — IFrame API + ENDED fallback. */
function applyYoutubeLoop(player: any) {
  try {
    if (typeof player.setLoop === 'function') player.setLoop(true)
  } catch {}
  try {
    if (suggestedYoutubeQuality() === 'small' && typeof player.setPlaybackQuality === 'function') {
      player.setPlaybackQuality('small')
    }
  } catch {}
}

function ensureYouTubeAPI(): Promise<void> {
  const YT = (window as any).YT
  if (YT?.Player) {
    ytApiLoaded = true
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    ytApiQueue.push(resolve)
    if (document.querySelector('script[src*="youtube.com/iframe_api"]')) return
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(s)
    const prev = (window as any).onYouTubeIframeAPIReady
    ;(window as any).onYouTubeIframeAPIReady = () => {
      try {
        prev?.()
      } catch {}
      ytApiLoaded = true
      for (const cb of ytApiQueue) cb()
      ytApiQueue.length = 0
    }
  })
}

function YouTubePlayer({
  videoId,
  onPlaying,
}: {
  videoId: string
  onPlaying: () => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<any>(null)
  const onPlayingRef = useRef(onPlaying)
  onPlayingRef.current = onPlaying
  const videoIdRef = useRef(videoId)
  videoIdRef.current = videoId
  const firedRef = useRef(false)

  useEffect(
    () => () => {
      if (playerRef.current) {
        try { playerRef.current.destroy() } catch {}
        playerRef.current = null
      }
    },
    [],
  )

  useEffect(() => {
    let cancelled = false
    let playingFallbackTimer: number | null = null
    let endedPollId: number | null = null

    const clearEndedPoll = () => {
      if (endedPollId !== null) {
        window.clearInterval(endedPollId)
        endedPollId = null
      }
    }

    const startEndedPoll = () => {
      if (endedPollId !== null) return
      endedPollId = window.setInterval(() => {
        if (cancelled || !playerRef.current) return
        try {
          const YT = (window as any).YT
          const p = playerRef.current
          if (p.getPlayerState?.() === YT.PlayerState.ENDED) {
            applyYoutubeLoop(p)
            p.seekTo(0, true)
            p.playVideo()
          }
        } catch {}
      }, 700)
    }

    const clearFallback = () => {
      if (playingFallbackTimer !== null) {
        window.clearTimeout(playingFallbackTimer)
        playingFallbackTimer = null
      }
    }

    const styleIframe = () => {
      const iframe = hostRef.current?.querySelector('iframe')
      if (iframe) {
        iframe.style.pointerEvents = 'none'
        iframe.style.width = '100%'
        iframe.style.height = '100%'
        iframe.style.border = '0'
      }
    }

    const firePlayingOnce = () => {
      if (cancelled || firedRef.current) return
      firedRef.current = true
      clearFallback()
      onPlayingRef.current()
    }

    const armFallback = () => {
      clearFallback()
      firedRef.current = false
      playingFallbackTimer = window.setTimeout(() => firePlayingOnce(), 1500)
    }

    const matchesCurrentVideo = (player: any) => {
      try {
        const vid = player?.getVideoData?.()?.video_id
        return !vid || vid === videoIdRef.current
      } catch {
        return true
      }
    }

    ;(async () => {
      await ensureYouTubeAPI()
      if (cancelled || !hostRef.current) return

      if (!playerRef.current) {
        const holder = document.createElement('div')
        hostRef.current.innerHTML = ''
        hostRef.current.appendChild(holder)

        const origin =
          typeof window !== 'undefined' && window.location?.origin
            ? window.location.origin
            : undefined

        playerRef.current = new (window as any).YT.Player(holder, {
          videoId,
          playerVars: {
            autoplay: 1,
            mute: 1,
            controls: 0,
            playsinline: 1,
            modestbranding: 1,
            rel: 0,
            fs: 0,
            iv_load_policy: 3,
            // loop=1 requires playlist with the same id for a single Short to repeat like TikTok.
            loop: 1,
            playlist: videoId,
            ...(origin ? { origin } : {}),
          },
          events: {
            onReady: (e: any) => {
              if (cancelled) return
              try {
                applyYoutubeLoop(e.target)
                e.target.mute()
                e.target.playVideo()
              } catch {}
              armFallback()
              styleIframe()
            },
            onStateChange: (e: any) => {
              if (cancelled) return
              const YT = (window as any).YT
              const st = e.data
              // PRD: clip loops until the user swipes (TikTok-style). Only gate PLAYING on
              // getVideoData — Shorts often mismatch ids after the first loop and would block ENDED.
              if (st === YT.PlayerState.PLAYING && matchesCurrentVideo(e.target)) {
                firePlayingOnce()
              }
              if (st === YT.PlayerState.ENDED) {
                try {
                  applyYoutubeLoop(e.target)
                  e.target.seekTo(0, true)
                  e.target.playVideo()
                } catch {}
              }
            },
            onError: () => {
              if (!cancelled) firePlayingOnce()
            },
          },
        })
        styleIframe()
        startEndedPoll()
      } else {
        armFallback()
        try {
          playerRef.current.loadVideoById({
            videoId,
            suggestedQuality: suggestedYoutubeQuality(),
          })
          applyYoutubeLoop(playerRef.current)
          playerRef.current.mute()
          playerRef.current.playVideo()
        } catch {
          firePlayingOnce()
        }
        styleIframe()
        startEndedPoll()
      }
    })()

    return () => {
      cancelled = true
      clearFallback()
      clearEndedPoll()
    }
  }, [videoId])

  return <div ref={hostRef} className="h-full w-full" />
}

export default function VideoFeed() {
  const words: WordMetadata[] = wordDataset

  useEffect(() => {
    void ensureYouTubeAPI()
  }, [])

  const prefetchBootPath = useMemo(() => {
    const id = loadCurrentWordId()
    const w = id ? words.find((x) => x.word_id === id) : undefined
    return w?.video_storage_path
  }, [words])

  useEffect(() => {
    prefetchLessonVideoSignedUrls(words, { prioritizePath: prefetchBootPath })
  }, [words, prefetchBootPath])

  const locale = useMemo(() => detectSupportedLocale(), [])
  const rawLang = useMemo(() => getRawLangCode(), [])
  const encouragementUiLang = useMemo(() => resolveSwipeEncouragementLang(), [])
  const swipeEncouragementBundle = useMemo(
    () => getSwipeEncouragementBundle(encouragementUiLang),
    [encouragementUiLang],
  )
  const isNativelySupported = useMemo(
    () => rawLang === 'en' || rawLang === 'th' || rawLang === 'zh',
    [rawLang],
  )
  const userLangLabel = useMemo(() => langDisplayName(rawLang), [rawLang])

  const [persisted, setPersisted] = useState(() => loadPersistedState())

  useEffect(() => {
    savePersistedState(persisted)
  }, [persisted])

  const { wordStates, videoQuality, meta } = persisted

  const [sessionVideoIndex, setSessionVideoIndex] = useState(0)
  const sessionVideoIndexRef = useRef(sessionVideoIndex)
  sessionVideoIndexRef.current = sessionVideoIndex
  const [currentWordId, setCurrentWordId] = useState(() => {
    const saved = loadCurrentWordId()
    if (saved && words.some((w) => w.word_id === saved)) return saved
    return pickRandomWord(words).word_id
  })
  const currentWord = useMemo(() => {
    const found = words.find((w) => w.word_id === currentWordId)
    if (found) return found
    return pickRandomWord(words)
  }, [words, currentWordId])

  useEffect(() => {
    if (currentWordId && !words.some((w) => w.word_id === currentWordId)) {
      setCurrentWordId(pickRandomWord(words).word_id)
    }
  }, [words, currentWordId])

  useEffect(() => {
    if (currentWordId) saveCurrentWordId(currentWordId)
  }, [currentWordId])

  const currentWordRef = useRef(currentWord)
  currentWordRef.current = currentWord

  const extractedYoutubeId = useMemo(() => {
    if (!currentWord.youtube_url) return null
    return extractYouTubeId(currentWord.youtube_url)
  }, [currentWord.youtube_url])

  /** After native Storage + video_url both error, play youtube_url (Shorts) if present. */
  const [youtubeFallback, setYoutubeFallback] = useState(false)

  const ytId = useMemo(() => {
    if (!extractedYoutubeId) return null
    if (currentWord.use_video_url) return youtubeFallback ? extractedYoutubeId : null
    return extractedYoutubeId
  }, [currentWord.use_video_url, extractedYoutubeId, youtubeFallback])

  /** Private Supabase Storage: native <video> uses a time-limited signed URL. */
  const needsSignedNativeUrl = Boolean(
    currentWord.use_video_url && currentWord.video_storage_path?.trim(),
  )

  /** Signed Storage URL, or same-origin video_url fallback if Supabase/signing fails. */
  const [nativePlaybackSrc, setNativePlaybackSrc] = useState<string | null>(null)

  useEffect(() => {
    setYoutubeFallback(false)
    if (!needsSignedNativeUrl || !currentWord.video_storage_path) {
      setNativePlaybackSrc(null)
      return
    }

    const fallback = currentWord.video_url
    const client = getSupabaseClient()
    if (!client) {
      console.warn('[VideoFeed] No Supabase client — playing video_url fallback:', fallback)
      setNativePlaybackSrc(fallback)
      return
    }

    const cached = peekCachedLessonVideoSignedUrl(
      currentWord.video_storage_path,
      currentWord.video_storage_bucket,
    )
    if (cached) {
      setNativePlaybackSrc(cached)
      return
    }

    let cancelled = false
    setNativePlaybackSrc(null)

    void (async () => {
      const result = await createLessonVideoSignedUrl(
        currentWord.video_storage_path!,
        currentWord.video_storage_bucket,
      )
      if (cancelled) return
      if ('url' in result) {
        setNativePlaybackSrc(result.url)
      } else {
        console.warn('[VideoFeed] Signed URL failed, using video_url fallback:', result.error)
        setNativePlaybackSrc(fallback)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    currentWord.word_id,
    currentWord.video_url,
    needsSignedNativeUrl,
    currentWord.video_storage_path,
    currentWord.video_storage_bucket,
  ])

  const videoLikeKey = useMemo(
    () =>
      currentWord.youtube_url ||
      currentWord.video_storage_path ||
      currentWord.video_url,
    [currentWord.youtube_url, currentWord.video_storage_path, currentWord.video_url],
  )

  const qualityVideoId = useMemo(
    () =>
      currentWord.video_storage_path
        ? `storage:${currentWord.video_storage_path}`
        : currentWord.video_url,
    [currentWord.video_storage_path, currentWord.video_url],
  )

  const elapsedMsRef = useRef(0)
  const sessionStartMsRef = useRef<number>(Date.now())
  const rafRef = useRef<number | null>(null)
  const lastRenderMsRef = useRef(0)

  const gestureRef = useRef<HTMLDivElement>(null)

  const touchStateRef = useRef<{
    startX: number
    startY: number
    startTime: number
    longPressTimer: number | null
    longPressFired: boolean
  } | null>(null)

  const [uiTick, setUiTick] = useState(0)
  const tapSingleTimeoutRef = useRef<number | null>(null)
  const lastTapUpTimeRef = useRef<number | null>(null)

  const tapOccurredRef = useRef(false)
  const tapTimingRef = useRef<TapTiming | undefined>(undefined)
  const tapLoopAtRef = useRef<number>(0)

  const [l1Visible, setL1Visible] = useState(false)
  const [l1LockKey, setL1LockKey] = useState(0)
  const [likeBurstKey, setLikeBurstKey] = useState(0)
  const [likeBurstVisible, setLikeBurstVisible] = useState(false)
  const likeBurstTimerRef = useRef<number | null>(null)
  const triggerLikeBurst = useCallback(() => {
    setLikeBurstKey((k) => k + 1)
    setLikeBurstVisible(true)
    if (likeBurstTimerRef.current) window.clearTimeout(likeBurstTimerRef.current)
    likeBurstTimerRef.current = window.setTimeout(() => setLikeBurstVisible(false), 600)
  }, [])
  const [longPressVisible, setLongPressVisible] = useState(false)
  const [showPrimerTapHint, setShowPrimerTapHint] = useState(false)
  /** After first tap-for-meaning on video 0, show swipe guidance (tap always comes first). */
  const [firstVideoSwipeRevealed, setFirstVideoSwipeRevealed] = useState(false)
  const tapPrimerConsumedRef = useRef(false)
  const [videoReady, setVideoReady] = useState(false)

  const lastLeftEncIdxRef = useRef<number | null>(null)
  const lastRightEncIdxRef = useRef<number | null>(null)
  const [swipeTransitionLine, setSwipeTransitionLine] = useState<{
    dir: SwipeDirection
    text: string
  } | null>(null)

  const swipeTransitionLineRef = useRef(swipeTransitionLine)
  swipeTransitionLineRef.current = swipeTransitionLine

  const encouragementStartedAtRef = useRef<number | null>(null)
  const feedBufferedRef = useRef(false)

  const tryCompleteSwipeEncouragement = useCallback(() => {
    if (!swipeTransitionLineRef.current) return
    if (!feedBufferedRef.current) return
    const t0 = encouragementStartedAtRef.current
    if (t0 == null) return
    if (Date.now() - t0 < SWIPE_ENCOURAGEMENT_MIN_MS) return
    setSwipeTransitionLine(null)
    setVideoReady(true)
    encouragementStartedAtRef.current = null
    feedBufferedRef.current = false
  }, [])

  const markFeedPlayable = useCallback(() => {
    if (!swipeTransitionLineRef.current) {
      setVideoReady(true)
      return
    }
    feedBufferedRef.current = true
    tryCompleteSwipeEncouragement()
  }, [tryCompleteSwipeEncouragement])

  useEffect(() => {
    if (!swipeTransitionLine) return
    const id = window.setInterval(() => tryCompleteSwipeEncouragement(), 64)
    return () => window.clearInterval(id)
  }, [swipeTransitionLine, tryCompleteSwipeEncouragement])

  useEffect(() => {
    if (!ytId && !needsSignedNativeUrl) return
    const t = window.setTimeout(() => {
      markFeedPlayable()
    }, 12000)
    return () => window.clearTimeout(t)
  }, [currentWord.word_id, ytId, needsSignedNativeUrl, markFeedPlayable])

  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const likedRef = useRef(false)
  likedRef.current = liked

  const finalizedRef = useRef(false)

  const resetSessionSignals = () => {
    finalizedRef.current = false
    tapOccurredRef.current = false
    tapTimingRef.current = undefined
    tapLoopAtRef.current = 0
    setL1Visible(false)
    setLongPressVisible(false)
    setShowPrimerTapHint(false)
    setFirstVideoSwipeRevealed(false)
    tapPrimerConsumedRef.current = false
    setVideoReady(false)
    if (tapSingleTimeoutRef.current) window.clearTimeout(tapSingleTimeoutRef.current)
    tapSingleTimeoutRef.current = null
    lastTapUpTimeRef.current = null
  }

  useEffect(() => {
    resetSessionSignals()
    sessionStartMsRef.current = Date.now()
    elapsedMsRef.current = 0
    lastRenderMsRef.current = 0
    const startSessionMs = sessionStartMsRef.current

    let primerTimer: number | null = null
    if (sessionVideoIndex === 0) {
      primerTimer = window.setTimeout(() => {
        if (!tapPrimerConsumedRef.current) setShowPrimerTapHint(true)
      }, 3000)
    }

    const tick = () => {
      const now = Date.now()
      const elapsed = now - startSessionMs
      elapsedMsRef.current = elapsed

      if (now - lastRenderMsRef.current > 200) {
        setUiTick((x) => x + 1)
        lastRenderMsRef.current = now
      }

      rafRef.current = window.requestAnimationFrame(tick)
    }

    rafRef.current = window.requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      if (primerTimer) window.clearTimeout(primerTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWordId])

  useEffect(() => {
    let cancelled = false
    getLikeStatus(videoLikeKey).then((s) => {
      if (cancelled) return
      setLiked(s.liked)
      setLikeCount(s.count)
    })
    return () => { cancelled = true }
  }, [currentWord.word_id, videoLikeKey])

  const chooseNextWordFromBuckets = (excludeWordId?: string) => {
    const roll = Math.random()
    const candidates = excludeWordId ? words.filter((w) => w.word_id !== excludeWordId) : words
    if (candidates.length === 0) return pickRandomWord(words)
    const next = pickNextWord({
      words: candidates,
      wordStates,
      roll,
      sessionsServed: meta.sessionsServed,
    })
    return next
  }

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') return
      const now = Date.now()
      const gap = now - sessionStartMsRef.current
      if (gap > 60000 && !finalizedRef.current) {
        finalizedRef.current = true
        resetSessionSignals()
        sessionStartMsRef.current = Date.now()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const englishMeaning = currentWord.l1_meanings.en ?? ''
  const staticMeaning = currentWord.l1_meanings[locale] ?? englishMeaning
  const allMeanings = currentWord.l1_meanings

  const [translatedMeaning, setTranslatedMeaning] = useState<string | null>(null)

  useEffect(() => {
    if (isNativelySupported) {
      setTranslatedMeaning(null)
      return
    }
    if (!englishMeaning) return

    let cancelled = false
    setTranslatedMeaning(translationCache[`${rawLang}::${englishMeaning}`] || null)

    fetchTranslation(englishMeaning, rawLang).then((t) => {
      if (!cancelled && t) setTranslatedMeaning(t)
    })
    return () => { cancelled = true }
  }, [currentWord.word_id, rawLang, isNativelySupported, englishMeaning])

  const recordTap = (loopsElapsed: number) => {
    if (tapOccurredRef.current) return
    tapOccurredRef.current = true
    const timing = classifyTapTiming(loopsElapsed)
    tapTimingRef.current = timing
    tapLoopAtRef.current = loopsElapsed
  }

  // We use useCallback + a ref-based approach so the touch handler always sees fresh state
  // without needing to re-register the native listener on every render.
  const finalizeSessionRef = useRef<(dir: SwipeDirection) => void>(() => {})

  finalizeSessionRef.current = (swipeDirection: SwipeDirection) => {
    if (finalizedRef.current) return
    finalizedRef.current = true

    encouragementStartedAtRef.current = Date.now()
    feedBufferedRef.current = false
    if (swipeDirection === 'left') {
      const lines = swipeEncouragementBundle.left
      const i = randomEncouragementIndex(lines.length, lastLeftEncIdxRef.current)
      lastLeftEncIdxRef.current = i
      setSwipeTransitionLine({ dir: 'left', text: lines[i] })
    } else {
      const lines = swipeEncouragementBundle.right
      const i = randomEncouragementIndex(lines.length, lastRightEncIdxRef.current)
      lastRightEncIdxRef.current = i
      setSwipeTransitionLine({ dir: 'right', text: lines[i] })
    }
    setVideoReady(false)

    if (tapSingleTimeoutRef.current) {
      window.clearTimeout(tapSingleTimeoutRef.current)
      tapSingleTimeoutRef.current = null
    }
    lastTapUpTimeRef.current = null
    setL1Visible(false)

    const nowMs = Date.now()
    const elapsed = nowMs - sessionStartMsRef.current
    const loopsElapsed = loopsElapsedFromMs(elapsed)

    const tapOccurred = tapOccurredRef.current
    const tapTiming = tapTimingRef.current

    const signals: SessionSignals = {
      word_id: currentWord.word_id,
      video_id: qualityVideoId,
      swipeDirection,
      loopsElapsed,
      tapOccurred,
      tapTiming,
    }

    const prevWord = wordStates[currentWord.word_id] ?? makeWordStateSeed(currentWord)
    const first20SeenNext = meta.first20Seen + 1
    const first20TappedNext = meta.first20Tapped + (tapOccurred ? 1 : 0)
    const tapRate = first20TappedNext / Math.max(1, first20SeenNext)

    const alphaCandidate = computeTapRateAdaptiveAlpha(tapRate)
    const alpha = meta.alphaFrozen ? meta.alphaValue : alphaCandidate

    const alphaFrozenNext = meta.alphaFrozen || first20SeenNext >= 20
    const alphaValueNext = alphaFrozenNext ? alphaCandidate : meta.alphaValue

    const updatedWordState = updateWordState({
      word: currentWord,
      prev: prevWord,
      signals,
      alpha,
      nowMs,
    })

    const prevQuality = videoQuality[qualityVideoId] ?? {
      video_id: qualityVideoId,
      views: 0,
      left_swipes_no_tap: 0,
      quality_flag: false,
    }

    let nextQuality = { ...prevQuality, views: prevQuality.views + 1 }
    if (swipeDirection === 'left' && !tapOccurred) {
      nextQuality = {
        ...nextQuality,
        left_swipes_no_tap: nextQuality.left_swipes_no_tap + 1,
      }
      const rate = nextQuality.left_swipes_no_tap / Math.max(1, nextQuality.views)
      nextQuality.quality_flag = rate > 0.2
    }

    setPersisted((prev) => ({
      ...prev,
      wordStates: { ...prev.wordStates, [currentWord.word_id]: updatedWordState },
      videoQuality: { ...prev.videoQuality, [qualityVideoId]: nextQuality },
      meta: {
        ...prev.meta,
        sessionsServed: prev.meta.sessionsServed + 1,
        first20Seen: first20SeenNext,
        first20Tapped: first20TappedNext,
        alphaFrozen: alphaFrozenNext,
        alphaValue: alphaValueNext,
      },
    }))

    const currentId = currentWord.word_id
    setTimeout(() => {
      setSessionVideoIndex((i) => i + 1)
      const nextWord = chooseNextWordFromBuckets(currentId)
      setCurrentWordId(nextWord.word_id)
      // Safety net: if the word ID happens to be the same (shouldn't happen now),
      // reset finalizedRef so gestures keep working.
      finalizedRef.current = false
    }, 120)
  }

  const doLikeRef = useRef<() => void>(() => {})
  doLikeRef.current = () => {
    if (likedRef.current) return
    setLiked(true)
    setLikeCount((c) => c + 1)
    toggleLike(videoLikeKey).then((s) => { setLiked(s.liked); setLikeCount(s.count) })
  }

  const handleHeartToggle = useCallback(() => {
    const wasLiked = likedRef.current
    setLiked(!wasLiked)
    setLikeCount((c) => wasLiked ? Math.max(0, c - 1) : c + 1)
    if (!wasLiked) triggerLikeBurst()
    toggleLike(videoLikeKey).then((s) => { setLiked(s.liked); setLikeCount(s.count) })
  }, [videoLikeKey, triggerLikeBurst])

  const handleTapGesture = useCallback((loopsElapsed: number) => {
    recordTap(loopsElapsed)

    const now = Date.now()
    const lastTapUpTime = lastTapUpTimeRef.current
    const DOUBLE_GAP_MS = 280

    if (lastTapUpTime && now - lastTapUpTime < DOUBLE_GAP_MS) {
      if (tapSingleTimeoutRef.current) window.clearTimeout(tapSingleTimeoutRef.current)
      tapSingleTimeoutRef.current = null
      lastTapUpTimeRef.current = null
      triggerLikeBurst()
      doLikeRef.current()
    } else {
      lastTapUpTimeRef.current = now
      tapSingleTimeoutRef.current = window.setTimeout(() => {
        if (sessionVideoIndexRef.current === 0) {
          tapPrimerConsumedRef.current = true
          setShowPrimerTapHint(false)
          setFirstVideoSwipeRevealed(true)
        }
        setL1LockKey((k) => k + 1)
        setL1Visible(true)
        speakChinese(currentWordRef.current.character)
        window.setTimeout(() => setL1Visible(false), 2000)
        tapSingleTimeoutRef.current = null
      }, DOUBLE_GAP_MS)
    }
  }, [])

  // Native touch event listeners registered with { passive: false } so preventDefault() works.
  // This is the critical fix: React registers touch handlers as passive, which silently ignores
  // preventDefault() and lets the browser perform native scroll/swipe gestures that steal input.
  useEffect(() => {
    const el = gestureRef.current
    if (!el) return

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      e.preventDefault()
      e.stopPropagation()

      const t = e.touches[0]
      const startX = t.clientX
      const startY = t.clientY
      const startTime = Date.now()

      const longPressTimer = window.setTimeout(() => {
        const st = touchStateRef.current
        if (!st) return
        if (finalizedRef.current) return
        // Only fire long press if finger hasn't moved much
        st.longPressFired = true
        const loopsElapsed = loopsElapsedFromMs(elapsedMsRef.current)
        recordTap(loopsElapsed)
        setLongPressVisible(true)
        window.setTimeout(() => setLongPressVisible(false), 2500)
      }, 550)

      touchStateRef.current = {
        startX,
        startY,
        startTime,
        longPressTimer,
        longPressFired: false,
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const st = touchStateRef.current
      if (!st || e.touches.length !== 1) return
      const t = e.touches[0]
      const dx = Math.abs(t.clientX - st.startX)
      const dy = Math.abs(t.clientY - st.startY)
      // If finger moved significantly, cancel long press
      if ((dx > 15 || dy > 15) && st.longPressTimer) {
        window.clearTimeout(st.longPressTimer)
        st.longPressTimer = null
      }
    }

    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const st = touchStateRef.current
      if (!st) return
      touchStateRef.current = null

      if (st.longPressTimer) window.clearTimeout(st.longPressTimer)
      if (st.longPressFired) return

      const touch = e.changedTouches[0]
      const dx = touch.clientX - st.startX
      const dy = touch.clientY - st.startY
      const absDx = Math.abs(dx)
      const absDy = Math.abs(dy)
      const duration = Date.now() - st.startTime

      const loopsElapsed = loopsElapsedFromMs(elapsedMsRef.current)

      // Horizontal swipe only (vertical swipes are ignored — avoids confusion with left/right)
      if (absDx > 30 && absDx > absDy * 0.6 && duration < 1200) {
        const dir: SwipeDirection = dx < 0 ? 'left' : 'right'
        finalizeSessionRef.current(dir)
        return
      }

      // Tap
      if (absDx < 15 && absDy < 15 && duration < 400) {
        handleTapGesture(loopsElapsed)
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: false })

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [handleTapGesture])

  // Mouse-only pointer handlers (touch is handled natively above)
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)

    const startX = e.clientX
    const startY = e.clientY
    const startTime = Date.now()

    const longPressTimer = window.setTimeout(() => {
      if (finalizedRef.current) return
      const loopsElapsed = loopsElapsedFromMs(elapsedMsRef.current)
      recordTap(loopsElapsed)
      setLongPressVisible(true)
      window.setTimeout(() => setLongPressVisible(false), 2500)
    }, 550)

    ;(e.currentTarget as any).__ptrState = { startX, startY, startTime, longPressTimer }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    const ps = (e.currentTarget as any).__ptrState
    if (!ps) return
    const dx = Math.abs(e.clientX - ps.startX)
    const dy = Math.abs(e.clientY - ps.startY)
    if ((dx > 15 || dy > 15) && ps.longPressTimer) {
      window.clearTimeout(ps.longPressTimer)
      ps.longPressTimer = null
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    const ps = (e.currentTarget as any).__ptrState
    if (!ps) return
    ;(e.currentTarget as any).__ptrState = null

    if (ps.longPressTimer) window.clearTimeout(ps.longPressTimer)

    const dx = e.clientX - ps.startX
    const dy = e.clientY - ps.startY
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)
    const duration = Date.now() - ps.startTime

    const loopsElapsed = loopsElapsedFromMs(elapsedMsRef.current)

    if (absDx > 30 && absDx > absDy * 0.6 && duration < 1200) {
      const dir: SwipeDirection = dx < 0 ? 'left' : 'right'
      finalizeSessionRef.current(dir)
      return
    }

    if (absDx < 15 && absDy < 15 && duration < 400) {
      handleTapGesture(loopsElapsed)
    }
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-black">
      <div
        className="absolute inset-0 z-0"
        style={{ backgroundImage: avatarGradient(currentWord.word_id) }}
      />

      {/* Video background layer — visible (blurred) under encouragement overlay like before. */}
      <div className="absolute inset-0 z-[1]" style={{ pointerEvents: 'none' }}>
        {ytId ? (
          <YouTubePlayer
            videoId={ytId}
            onPlaying={() => markFeedPlayable()}
          />
        ) : needsSignedNativeUrl ? (
          nativePlaybackSrc ? (
            <video
              key={currentWord.word_id}
              src={nativePlaybackSrc}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              className="h-full w-full object-cover"
              style={{ pointerEvents: 'none' }}
              onLoadedData={() => markFeedPlayable()}
              onCanPlay={() => markFeedPlayable()}
              onError={() => {
                const w = currentWordRef.current
                const fb = w.video_url
                setNativePlaybackSrc((prev) => {
                  if (prev !== fb) {
                    console.warn('[VideoFeed] Video error — switching to video_url:', fb)
                    return fb
                  }
                  const yid = w.youtube_url ? extractYouTubeId(w.youtube_url) : null
                  if (yid) {
                    queueMicrotask(() => setYoutubeFallback(true))
                  } else {
                    console.warn('[VideoFeed] Native video failed and no youtube_url fallback')
                  }
                  return prev
                })
              }}
              onEnded={(ev) => {
                const v = ev.currentTarget
                try {
                  v.currentTime = 0
                  void v.play()
                } catch {}
              }}
            />
          ) : null
        ) : (
          <video
            key={currentWord.video_url}
            src={currentWord.video_url}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            className="h-full w-full object-cover"
            style={{ pointerEvents: 'none' }}
            onLoadedData={() => markFeedPlayable()}
            onCanPlay={() => markFeedPlayable()}
            onEnded={(ev) => {
              const v = ev.currentTarget
              try {
                v.currentTime = 0
                void v.play()
              } catch {}
            }}
          />
        )}
      </div>

      {/* Between-swipe encouragement while the next clip buffers (signed URL + decode). */}
      <AnimatePresence>
        {swipeTransitionLine && !videoReady && (
          <SwipeTransitionEncouragement
            key={swipeTransitionLine.text}
            dir={swipeTransitionLine.dir}
            text={swipeTransitionLine.text}
          />
        )}
      </AnimatePresence>

      {/* No extra YouTube embed preloads: several concurrent embeds break playback on many phones after 1–2 videos. */}

      {/* Gesture capture surface — sits on top of video, captures all touch/pointer input */}
      <div
        ref={gestureRef}
        className="absolute inset-0 z-[5] flex items-center justify-center"
        style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        role="application"
        aria-label="Character feed. Swipe right if you know the word; swipe left if it is too hard or not for you. Tap for meaning. Long-press for breakdown."
      >
        {/* Center via flex on full-screen layer — framer `y` on same node as translate-x-50% was killing horizontal center */}
        <AnimatePresence>
          {showPrimerTapHint && sessionVideoIndex === 0 && (
            <motion.div
              key="primer-tap"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center px-6"
            >
              <div className="max-w-[min(18rem,88vw)] text-center">
                <p
                  className="text-lg font-semibold leading-snug text-white"
                  style={{
                    textShadow:
                      '0 1px 3px rgba(0,0,0,0.95), 0 0 20px rgba(0,0,0,0.88), 0 0 1px rgba(0,0,0,1)',
                  }}
                >
                  Tap for meaning
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* L1 meaning overlay is rendered at root level for correct viewport centering */}

        {/* Like heart burst */}
        <AnimatePresence>
          {likeBurstVisible && (
            <motion.div
              key={likeBurstKey}
              initial={{ opacity: 1, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1.3 }}
              exit={{ opacity: 0, scale: 1.6, y: -30 }}
              transition={{ duration: 0.4 }}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            >
              <div className="text-6xl" style={{ color: '#ff2d55' }}>&#x2764;</div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Long-press breakdown overlay (2.5s) */}
        <AnimatePresence>
          {longPressVisible && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur"
            >
              <motion.div
                initial={{ scale: 0.97, y: 6 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.97, y: 6 }}
                className="w-[min(520px,92vw)] rounded-2xl bg-white/10 p-5"
              >
                <div className="text-sm font-semibold opacity-90">Pinyin breakdown</div>
                <div className="mt-2 text-2xl font-bold">{currentWord.pinyin}</div>
                <div className="mt-3 text-sm opacity-85">
                  Radical details are demo-only in this MVP.
                </div>
                <div className="mt-5 text-xs opacity-70">
                  Swipe right = you know it. Swipe left = too hard or not interested. Tap for meaning.
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {/* Swipe guidance — plain text + arrows (no frosted cards). Video 0: only after tap-for-meaning. */}
      {videoReady &&
        sessionVideoIndex < 3 &&
        (sessionVideoIndex > 0 || firstVideoSwipeRevealed) && (
        <div
          className="pointer-events-none absolute inset-0 z-[6]"
          aria-hidden
        >
          <div className="absolute left-2 top-[36%] -translate-y-1/2 sm:left-4 sm:top-[38%]">
            <div className="flex max-w-[7rem] flex-col items-center gap-2 text-center">
              <SwipeHintArrowLeft />
              <span
                className="text-xs font-semibold leading-tight text-white"
                style={{
                  textShadow:
                    '0 1px 3px rgba(0,0,0,0.95), 0 0 16px rgba(0,0,0,0.9), 0 0 1px rgba(0,0,0,1)',
                }}
              >
                Too hard / skip
              </span>
            </div>
          </div>
          <div className="absolute right-2 top-[36%] -translate-y-1/2 sm:right-4 sm:top-[38%] pr-1">
            <div className="flex max-w-[7rem] flex-col items-center gap-2 text-center">
              <SwipeHintArrowRight />
              <span
                className="text-xs font-semibold leading-tight text-white"
                style={{
                  textShadow:
                    '0 1px 3px rgba(0,0,0,0.95), 0 0 16px rgba(0,0,0,0.9), 0 0 1px rgba(0,0,0,1)',
                }}
              >
                Know it
              </span>
            </div>
          </div>
        </div>
      )}

      {/* L1 meaning overlay — absolutely centered within the h-dvh root container */}
      <AnimatePresence>
        {l1Visible && (
          <motion.div
            key={l1LockKey}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none"
          >
            <div className="w-[min(85vw,360px)] rounded-2xl bg-black/65 px-6 py-5 text-center shadow-2xl backdrop-blur-md">
              <div className="text-2xl font-bold">{currentWord.character}</div>
              <div className="mt-1 text-sm text-white/70">{currentWord.pinyin}</div>
              <div className="mt-3 h-px w-full bg-white/15" />

              {isNativelySupported ? (
                <div className="mt-3 text-base font-semibold">{staticMeaning}</div>
              ) : (
                <>
                  {translatedMeaning && (
                    <div className="mt-3 text-base font-semibold">
                      <span className="text-white/50 text-xs mr-1.5">{userLangLabel}</span>
                      {translatedMeaning}
                    </div>
                  )}
                  <div className={translatedMeaning ? 'mt-2 text-sm text-white/80' : 'mt-3 text-base font-semibold'}>
                    <span className="text-white/50 text-xs mr-1.5">EN</span>
                    {englishMeaning}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Permanent word overlay (top-center) — hidden when meaning overlay is showing */}
      <AnimatePresence>
        {videoReady && !l1Visible && (
          <motion.div
            key={currentWord.word_id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute left-1/2 top-10 z-20 -translate-x-1/2 text-center pointer-events-none"
          >
            <div className="inline-block rounded-2xl bg-black/20 px-6 py-3 backdrop-blur-sm">
              <div className="text-4xl font-semibold tracking-tight text-white">
                {currentWord.character}
              </div>
              <div className="mt-1 text-lg text-white/85">{currentWord.pinyin}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* TikTok-style right sidebar — raised above bottom nav */}
      <div className="absolute right-3 z-10 flex flex-col items-center" style={{ bottom: 'calc(28% + 56px)' }}>
        <button
          onClick={handleHeartToggle}
          className="flex flex-col items-center gap-1 active:scale-110 transition-transform"
          aria-label={liked ? 'Unlike' : 'Like'}
        >
          <motion.div
            key={liked ? 'liked' : 'unliked'}
            initial={{ scale: 0.7 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 15 }}
          >
            <svg viewBox="0 0 24 24" width="36" height="36" className="drop-shadow-lg">
              <path
                d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                fill={liked ? '#ff2d55' : 'rgba(255,255,255,0.15)'}
                stroke={liked ? '#ff2d55' : 'rgba(255,255,255,0.9)'}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </motion.div>
          <span className="text-xs font-semibold text-white/90 drop-shadow">
            {likeCount}
          </span>
        </button>
      </div>

    </div>
  )
}
