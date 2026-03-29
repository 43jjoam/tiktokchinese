import type { Session } from '@supabase/supabase-js'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
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
import { BUILTIN_CHINESE_CHARACTERS_1, getActivatedDecks, getSupabaseClient } from '../lib/deckService'
import {
  engagementSetLike,
  engagementSetSave,
  fetchEngagementSnapshot,
  getLocalLikedWordIds,
  getLocalSavedWordIds,
  recordSessionSummaryFireAndForget,
  redeemGiftToken,
  tryNativeShareWordFromUserGesture,
} from '../lib/engagementService'
import {
  createLessonVideoSignedUrl,
  peekCachedLessonVideoSignedUrl,
  prefetchLessonVideoSignedUrls,
} from '../lib/storageVideoUrl'
import {
  ACTIVATED_DECKS_CHANGED_EVENT,
  buildHomeFeedWords,
  getWordsForDeck,
} from '../lib/deckWords'
import { getSwipeEncouragementBundle, resolveSwipeEncouragementLang } from '../lib/swipeEncouragement'
import { resolveCharacterCompounds } from '../lib/characterCompounds'
import { getWordContentKind } from '../lib/wordContentKind'
import { extractYouTubeVideoId } from '../lib/youtubeUrl'
import {
  clearProfileUploadDoneUserId,
  countWordsWithSessions,
  getLastUsedAccountEmail,
  notifyCloudProfileSaved,
  PERSISTED_STATE_REPLACED_EVENT,
  setLastUsedAccountEmail,
  setProfileUploadDoneUserId,
  syncCloudProfileAfterAuth,
  uploadLearningProfileWithLocalMeta,
} from '../lib/accountSync'
import { MeaningTapOverlayCard } from './MeaningTapOverlay'
import { SaveProgressModal } from './SaveProgressModal'
import { ShareWordSheet } from './ShareWordSheet'
import { prefetchYouTubeIframeApi, YouTubeEmbedPlayer } from './YouTubeEmbedPlayer'

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
  const preferReducedMotion = useReducedMotion()
  const [isMdUp, setIsMdUp] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const sync = () => setIsMdUp(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  /** Full-screen mix-blend + confetti repaints the whole viewport on many GPUs — skip on laptop (md+) and reduced-motion. */
  const heavyRightCelebration = preferReducedMotion !== true && !isMdUp

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
        {heavyRightCelebration ? <PaperFlashBursts /> : null}
        {heavyRightCelebration ? <RightSwipeConfettiBurst /> : null}
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
  if (ws.length) return ws[Math.floor(Math.random() * ws.length)]
  const fb = getWordsForDeck(BUILTIN_CHINESE_CHARACTERS_1)
  return fb[Math.floor(Math.random() * fb.length)]
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

type VideoFeedProps = {
  /** When false (e.g. another tab is visible), arrow keys do not advance the feed. */
  keyboardShortcutsActive?: boolean
}

/**
 * Magic-link / OAuth PKCE returns `?code=` (and `state`). Our gift/deep-link effect used to call
 * `replaceState` and drop the query before `@supabase/supabase-js` exchanged the code — session
 * never stuck and the corner CTA stayed visible.
 */
function urlHasSupabaseAuthCallback(): boolean {
  const search = window.location.search
  if (search.length > 1) {
    if (/(^|[?&])code=/.test(search)) return true
    if (/(^|[?&])error=/.test(search)) return true
  }
  const hash = window.location.hash.replace(/^#/, '')
  if (!hash) return false
  return (
    hash.includes('access_token=') ||
    hash.includes('refresh_token=') ||
    /(^|[?&#])code=/.test(hash)
  )
}

function stripSupabaseOAuthParamsFromUrl(): void {
  try {
    const u = new URL(window.location.href)
    if (u.search.length <= 1) return
    const keys = ['code', 'state', 'error', 'error_description', 'error_code']
    let changed = false
    for (const k of keys) {
      if (u.searchParams.has(k)) {
        u.searchParams.delete(k)
        changed = true
      }
    }
    if (!changed) return
    const qs = u.searchParams.toString()
    window.history.replaceState({}, '', u.pathname + (qs ? `?${qs}` : '') + u.hash)
  } catch {
    /* ignore */
  }
}

export default function VideoFeed({ keyboardShortcutsActive = true }: VideoFeedProps) {
  /** Chinese Characters 1 by default; + purchased decks (e.g. HSK 1) after activation. */
  const [words, setWords] = useState<WordMetadata[]>(() => buildHomeFeedWords([]))

  useEffect(() => {
    let cancelled = false
    const refreshFeedWords = () => {
      void getActivatedDecks().then((decks) => {
        if (cancelled) return
        setWords(buildHomeFeedWords(decks))
      })
    }
    refreshFeedWords()
    window.addEventListener(ACTIVATED_DECKS_CHANGED_EVENT, refreshFeedWords)
    return () => {
      cancelled = true
      window.removeEventListener(ACTIVATED_DECKS_CHANGED_EVENT, refreshFeedWords)
    }
  }, [])

  const wordsRef = useRef(words)
  wordsRef.current = words

  useEffect(() => {
    void prefetchYouTubeIframeApi()
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
  const swipeHintsReduceMotion = useReducedMotion()
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
  const [saveProgressOpen, setSaveProgressOpen] = useState(false)
  /** True when opened from “Welcome back” entry (e.g. last-used email hint) — distinct modal copy. */
  const [saveProgressWelcomeBack, setSaveProgressWelcomeBack] = useState(false)
  const [cloudSavedToast, setCloudSavedToast] = useState(false)
  const [signedInUserId, setSignedInUserId] = useState<string | null>(null)

  useEffect(() => {
    savePersistedState(persisted)
  }, [persisted])

  const { wordStates, videoQuality, meta } = persisted

  const runAuthCloudSync = useCallback(async (session: Session) => {
    const user = session.user
    if (!user?.id) return
    stripSupabaseOAuthParamsFromUrl()
    if (user.email) setLastUsedAccountEmail(user.email)
    const r = await syncCloudProfileAfterAuth(user.id)
    if (r.uploaded) {
      setSaveProgressOpen(false)
      notifyCloudProfileSaved()
      setCloudSavedToast(true)
      window.setTimeout(() => setCloudSavedToast(false), 9000)
    }
  }, [])

  useEffect(() => {
    const client = getSupabaseClient()
    if (!client) return
    void client.auth.getSession().then(({ data: { session } }) => {
      setSignedInUserId(session?.user?.id ?? null)
    })
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange(async (event, session) => {
      setSignedInUserId(session?.user?.id ?? null)
      if (event === 'SIGNED_OUT') {
        clearProfileUploadDoneUserId()
        return
      }
      if (event === 'INITIAL_SESSION') {
        if (session?.user) await runAuthCloudSync(session)
        return
      }
      if (event === 'SIGNED_IN' && session?.user) {
        await runAuthCloudSync(session)
      }
    })
    return () => subscription.unsubscribe()
  }, [runAuthCloudSync])

  /** While signed in, push learning profile to the cloud shortly after local state changes. */
  useEffect(() => {
    const client = getSupabaseClient()
    if (!client) return
    let timer: number | undefined
    const tick = async () => {
      const {
        data: { session },
      } = await client.auth.getSession()
      if (!session?.user?.id) return
      const up = await uploadLearningProfileWithLocalMeta()
      if (up.ok) setProfileUploadDoneUserId(session.user.id)
    }
    const schedule = () => {
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => void tick(), 2500)
    }
    schedule()
    return () => {
      if (timer) window.clearTimeout(timer)
    }
  }, [persisted])

  useEffect(() => {
    const client = getSupabaseClient()
    if (!client) return
    if (meta.accountMagicLinkSentAt) return

    const seen = meta.first20Seen
    const notNow = meta.accountSaveNotNowCount ?? 0
    const shouldPrompt =
      (notNow === 0 && seen >= 10) ||
      (notNow === 1 && seen >= 15) ||
      (notNow === 2 && seen >= 20)
    if (!shouldPrompt) return

    void client.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setSaveProgressOpen(false)
        return
      }
      setSaveProgressWelcomeBack(Boolean(getLastUsedAccountEmail()))
      setSaveProgressOpen(true)
    })
  }, [meta.first20Seen, meta.accountSaveNotNowCount, meta.accountMagicLinkSentAt])

  useEffect(() => {
    if (!saveProgressOpen) setSaveProgressWelcomeBack(false)
  }, [saveProgressOpen])

  const [sessionVideoIndex, setSessionVideoIndex] = useState(0)
  const sessionVideoIndexRef = useRef(sessionVideoIndex)
  sessionVideoIndexRef.current = sessionVideoIndex
  const [currentWordId, setCurrentWordId] = useState(() => {
    const saved = loadCurrentWordId()
    if (saved && words.some((w) => w.word_id === saved)) return saved
    return pickRandomWord(words).word_id
  })
  /** Signed URL from `redeem-gift` when opening `?g=<token>` (same clip as sender). */
  const [giftPlayback, setGiftPlayback] = useState<{ wordId: string; url: string } | null>(null)
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

  useEffect(() => {
    const onReplace = () => {
      setPersisted(loadPersistedState())
      const id = loadCurrentWordId()
      if (id && wordsRef.current.some((w) => w.word_id === id)) {
        setCurrentWordId(id)
      }
    }
    window.addEventListener(PERSISTED_STATE_REPLACED_EVENT, onReplace)
    return () => window.removeEventListener(PERSISTED_STATE_REPLACED_EVENT, onReplace)
  }, [])

  useEffect(() => {
    if (!words.length) return
    const params = new URLSearchParams(window.location.search)
    const path = window.location.pathname || '/'
    const pathGiftMatch = path.match(/^\/g\/([0-9a-f]{32})\/?$/i)
    const g = (params.get('g')?.trim() ?? pathGiftMatch?.[1] ?? '').trim()
    const w = params.get('w')?.trim() ?? ''
    const clearQuery = () => {
      if (urlHasSupabaseAuthCallback()) return
      const p = window.location.pathname || '/'
      const hasSearch = window.location.search.length > 1
      const isGiftPath = /^\/g\/[0-9a-f]{32}\/?$/i.test(p)
      if (isGiftPath || hasSearch) {
        window.history.replaceState({}, '', '/' + window.location.hash)
      }
    }

    const giftTokenRe = /^[0-9a-f]{32}$/i
    if (g && giftTokenRe.test(g)) {
      void redeemGiftToken(g).then((r) => {
        if (!r.ok) {
          clearQuery()
          return
        }
        setGiftPlayback({ wordId: r.word_id, url: r.signed_url })
        if (words.some((x) => x.word_id === r.word_id)) {
          setCurrentWordId(r.word_id)
        }
        clearQuery()
      })
      return
    }

    if (w && words.some((x) => x.word_id === w)) {
      setCurrentWordId(w)
    }
    clearQuery()
  }, [words])

  useEffect(() => {
    setGiftPlayback((prev) => {
      if (!prev) return null
      if (prev.wordId !== currentWordId) return null
      return prev
    })
  }, [currentWordId])

  const currentWordRef = useRef(currentWord)
  currentWordRef.current = currentWord

  const extractedYoutubeId = useMemo(() => {
    if (!currentWord.youtube_url) return null
    return extractYouTubeVideoId(currentWord.youtube_url)
  }, [currentWord.youtube_url])

  /**
   * When `use_video_url` is true: primary = Supabase signed URL (per-word bucket, e.g. Chinese
   * Characters 1 or HSK_1). If signing fails or is unavailable and `youtube_url` exists, we switch
   * here immediately (same as Characters 1 intent). Otherwise secondary = static `video_url`.
   * Tertiary: native `<video>` onError after signed URL then `video_url` both fail → YouTube Shorts.
   */
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

  /** Signed Storage URL, or static `video_url` when no YouTube backup is configured. */
  const [nativePlaybackSrc, setNativePlaybackSrc] = useState<string | null>(null)

  const displayNativePlaybackSrc = useMemo(() => {
    if (giftPlayback?.wordId === currentWord.word_id) return giftPlayback.url
    return nativePlaybackSrc
  }, [giftPlayback, currentWord.word_id, nativePlaybackSrc])

  useEffect(() => {
    setYoutubeFallback(false)
    if (!needsSignedNativeUrl || !currentWord.video_storage_path) {
      setNativePlaybackSrc(null)
      return
    }

    const fallback = currentWord.video_url
    const canUseYoutubeBackup = Boolean(extractedYoutubeId)

    const goYoutubeBackup = () => {
      setNativePlaybackSrc(null)
      queueMicrotask(() => setYoutubeFallback(true))
    }

    const client = getSupabaseClient()
    if (!client) {
      if (canUseYoutubeBackup) {
        console.warn('[VideoFeed] No Supabase client — using YouTube backup (youtube_url).')
        goYoutubeBackup()
      } else {
        console.warn('[VideoFeed] No Supabase client — playing video_url fallback:', fallback)
        setNativePlaybackSrc(fallback)
      }
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
      } else if (canUseYoutubeBackup) {
        console.warn('[VideoFeed] Signed URL failed — using YouTube backup:', result.error)
        goYoutubeBackup()
      } else {
        console.warn('[VideoFeed] Signed URL failed, using video_url (no youtube_url on word):', result.error)
        setNativePlaybackSrc(fallback)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    currentWord.word_id,
    currentWord.video_url,
    currentWord.youtube_url,
    needsSignedNativeUrl,
    currentWord.video_storage_path,
    currentWord.video_storage_bucket,
    extractedYoutubeId,
  ])

  const qualityVideoId = useMemo(
    () =>
      currentWord.video_storage_path
        ? `storage:${currentWord.video_storage_path}`
        : currentWord.video_url,
    [currentWord.video_storage_path, currentWord.video_url],
  )

  const elapsedMsRef = useRef(0)
  const sessionStartMsRef = useRef<number>(Date.now())
  const sessionWordsSeenRef = useRef<Set<string>>(new Set())
  const sessionSummaryLastFlushRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const lastRenderMsRef = useRef(0)

  useEffect(() => {
    sessionWordsSeenRef.current.add(currentWordId)
  }, [currentWordId])

  const currentWordIdForSessionRef = useRef(currentWordId)
  currentWordIdForSessionRef.current = currentWordId

  useEffect(() => {
    const flush = () => {
      const now = Date.now()
      if (now - sessionSummaryLastFlushRef.current < 4000) return
      sessionSummaryLastFlushRef.current = now
      recordSessionSummaryFireAndForget({
        started_at: sessionStartMsRef.current,
        ended_at: now,
        word_ids: [...sessionWordsSeenRef.current],
      })
      sessionStartMsRef.current = now
      sessionWordsSeenRef.current = new Set([currentWordIdForSessionRef.current])
    }
    const onVis = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  const gestureRef = useRef<HTMLDivElement>(null)
  const feedRootRef = useRef<HTMLDivElement>(null)

  const touchStateRef = useRef<{
    startX: number
    startY: number
    startTime: number
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
  const [showPrimerTapHint, setShowPrimerTapHint] = useState(false)
  /** After first tap-for-meaning on video 0, show swipe guidance (tap always comes first). */
  const [firstVideoSwipeRevealed, setFirstVideoSwipeRevealed] = useState(false)
  const tapPrimerConsumedRef = useRef(false)
  const [videoReady, setVideoReady] = useState(false)
  const [shareSheetOpen, setShareSheetOpen] = useState(false)

  const dismissSaveProgress = useCallback(() => {
    setSaveProgressOpen(false)
    setPersisted((p) => ({
      ...p,
      meta: {
        ...p.meta,
        accountSaveNotNowCount: Math.min(2, (p.meta.accountSaveNotNowCount ?? 0) + 1),
      },
    }))
  }, [])

  const recordMagicLinkSent = useCallback(() => {
    setPersisted((p) => ({
      ...p,
      meta: { ...p.meta, accountMagicLinkSentAt: Date.now() },
    }))
  }, [])

  const closeSaveProgressAfterSuccess = useCallback(() => {
    setSaveProgressOpen(false)
  }, [])

  useEffect(() => {
    setShareSheetOpen(false)
  }, [currentWord.word_id])

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

  const [liked, setLiked] = useState(false)
  const [saved, setSaved] = useState(false)
  /** Global like count from backend; never show a stale/local number as global (PRD). */
  const [likeCount, setLikeCount] = useState<number | null>(null)
  const [backendCountsOk, setBackendCountsOk] = useState(false)

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

  const likedRef = useRef(false)
  likedRef.current = liked
  const savedRef = useRef(false)
  savedRef.current = saved
  const backendCountsOkRef = useRef(false)
  backendCountsOkRef.current = backendCountsOk

  const finalizedRef = useRef(false)

  const resetSessionSignals = () => {
    finalizedRef.current = false
    tapOccurredRef.current = false
    tapTimingRef.current = undefined
    tapLoopAtRef.current = 0
    setL1Visible(false)
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

  const refreshEngagement = useCallback(async (word?: WordMetadata) => {
    const w = word ?? currentWordRef.current
    const wid = w.word_id
    const snap = await fetchEngagementSnapshot(w)
    if (wid !== currentWordRef.current.word_id) return
    setLiked(snap.liked)
    setSaved(snap.saved)
    setLikeCount(snap.likeCount)
    setBackendCountsOk(snap.backendCountsOk)
  }, [])

  useEffect(() => {
    const wid = currentWordId
    setLiked(getLocalLikedWordIds().includes(wid))
    setSaved(getLocalSavedWordIds().includes(wid))
    setLikeCount(null)
    setBackendCountsOk(false)
    void refreshEngagement(currentWordRef.current)
  }, [currentWordId, refreshEngagement])

  useEffect(() => {
    const root = feedRootRef.current
    if (!root) return
    let pollId: number | null = null
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.2)
        if (pollId !== null) {
          window.clearInterval(pollId)
          pollId = null
        }
        if (vis) {
          pollId = window.setInterval(() => void refreshEngagement(), 30_000)
        }
      },
      { threshold: [0, 0.2, 0.5] },
    )
    obs.observe(root)
    return () => {
      obs.disconnect()
      if (pollId !== null) window.clearInterval(pollId)
    }
  }, [refreshEngagement])

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
  const illustrativeEn = currentWord.illustrative_sentence?.l1_meanings?.en?.trim() ?? ''

  const [illustrativeGlossTranslated, setIllustrativeGlossTranslated] = useState<string | null>(null)

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

  useEffect(() => {
    if (isNativelySupported || !illustrativeEn) {
      setIllustrativeGlossTranslated(null)
      return
    }
    const cacheKey = `${rawLang}::ill::${illustrativeEn}`
    const hit = translationCache[cacheKey]
    if (hit) {
      setIllustrativeGlossTranslated(hit)
      return
    }
    let cancelled = false
    setIllustrativeGlossTranslated(null)
    void fetchTranslation(illustrativeEn, rawLang).then((t) => {
      if (!cancelled && t) {
        translationCache[cacheKey] = t
        setIllustrativeGlossTranslated(t)
      }
    })
    return () => {
      cancelled = true
    }
  }, [currentWord.word_id, rawLang, isNativelySupported, illustrativeEn])

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
    if (backendCountsOkRef.current) {
      setLikeCount((c) => (c != null ? c + 1 : c))
    }
    void engagementSetLike(currentWordRef.current, true).then(() => refreshEngagement())
  }

  const handleHeartToggle = useCallback(() => {
    const wasLiked = likedRef.current
    const next = !wasLiked
    setLiked(next)
    if (backendCountsOkRef.current) {
      setLikeCount((c) => (c != null ? (next ? c + 1 : Math.max(0, c - 1)) : c))
    }
    if (!wasLiked) triggerLikeBurst()
    void engagementSetLike(currentWordRef.current, next).then(() => refreshEngagement())
  }, [triggerLikeBurst, refreshEngagement])

  const handleSaveToggle = useCallback(() => {
    const next = !savedRef.current
    setSaved(next)
    void engagementSetSave(currentWordRef.current, next).then(() => refreshEngagement())
  }, [refreshEngagement])

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

  useEffect(() => {
    if (!keyboardShortcutsActive) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      if (e.repeat) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target
      if (el instanceof HTMLElement && el.closest('input, textarea, select, [contenteditable="true"]')) {
        return
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        e.stopPropagation()
        finalizeSessionRef.current(e.key === 'ArrowLeft' ? 'left' : 'right')
        return
      }
      if (e.code === 'Space') {
        e.preventDefault()
        const loopsElapsed = loopsElapsedFromMs(elapsedMsRef.current)
        handleTapGesture(loopsElapsed)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [keyboardShortcutsActive, handleTapGesture])

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

      touchStateRef.current = {
        startX,
        startY,
        startTime,
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }

    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const st = touchStateRef.current
      if (!st) return
      touchStateRef.current = null

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

    ;(e.currentTarget as any).__ptrState = { startX, startY, startTime }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    const ps = (e.currentTarget as any).__ptrState
    if (!ps) return
    ;(e.currentTarget as any).__ptrState = null

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

  const displayedLikeCount =
    backendCountsOk && likeCount !== null ? Math.max(likeCount, liked ? 1 : 0) : null

  const supabaseClient = getSupabaseClient()

  return (
    <div ref={feedRootRef} className="relative h-dvh w-full overflow-hidden bg-black">
      {supabaseClient && !signedInUserId ? (
        <button
          type="button"
          onClick={() => {
            setSaveProgressWelcomeBack(Boolean(getLastUsedAccountEmail()))
            setSaveProgressOpen(true)
          }}
          className="pointer-events-auto fixed right-3 top-[max(0.6rem,env(safe-area-inset-top))] z-[58] rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 shadow-[0_4px_20px_rgba(0,0,0,0.35)] ring-1 ring-black/10 active:scale-[0.98] active:opacity-95"
        >
          Save progress
        </button>
      ) : null}

      <div
        className="absolute inset-0 z-0"
        style={{ backgroundImage: avatarGradient(currentWord.word_id) }}
      />

      {/* Video layer: full-bleed cover on phones; on md+ center and show full frame (letterbox) for native video; YouTube Shorts in a 9:16 max box. */}
      <div
        className="absolute inset-0 z-[1] bg-black md:flex md:items-center md:justify-center"
        style={{ pointerEvents: 'none' }}
      >
        {ytId ? (
          <div className="h-full w-full min-h-0 min-w-0 md:mx-auto md:h-[min(100dvh,calc(100vw*16/9))] md:w-[min(100vw,calc(100dvh*9/16))]">
            <YouTubeEmbedPlayer
              videoId={ytId}
              onPlaying={() => markFeedPlayable()}
            />
          </div>
        ) : needsSignedNativeUrl ? (
          displayNativePlaybackSrc ? (
            <video
              key={currentWord.word_id}
              src={displayNativePlaybackSrc}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              className="h-full w-full min-h-0 object-cover md:h-auto md:max-h-[100dvh] md:w-auto md:max-w-[100vw] md:object-contain"
              style={{ pointerEvents: 'none' }}
              onLoadedData={() => markFeedPlayable()}
              onCanPlay={() => markFeedPlayable()}
              onError={() => {
                // Tertiary backup: signed URL or first load failed decode → try static video_url → then YouTube.
                const w = currentWordRef.current
                const fb = w.video_url
                setNativePlaybackSrc((prev) => {
                  if (prev !== fb) {
                    console.warn('[VideoFeed] Video error — switching to video_url:', fb)
                    return fb
                  }
                  const yid = w.youtube_url ? extractYouTubeVideoId(w.youtube_url) : null
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
            className="h-full w-full min-h-0 object-cover md:h-auto md:max-h-[100dvh] md:w-auto md:max-w-[100vw] md:object-contain"
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
        onPointerUp={onPointerUp}
        role="application"
        aria-label="Character feed. Arrow keys: Right if you know the word, Left if too hard or not for you. Space for meaning (same as tap)."
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

      </div>

      {/* Swipe guidance — edge-aligned like TikTok; subtle pulse so copy stays noticeable. Video 0: only after tap-for-meaning. */}
      {videoReady &&
        sessionVideoIndex < 3 &&
        (sessionVideoIndex > 0 || firstVideoSwipeRevealed) && (
        <div
          className="pointer-events-none absolute inset-0 z-[12]"
          aria-hidden
        >
          <div className="absolute left-2 top-[48%] -translate-y-1/2 sm:left-4 sm:top-[50%]">
            <motion.div
              className="flex max-w-[7rem] flex-col items-center gap-2 text-center"
              animate={
                swipeHintsReduceMotion
                  ? { opacity: 1, scale: 1 }
                  : { opacity: [0.78, 1, 0.78], scale: [1, 1.06, 1] }
              }
              transition={
                swipeHintsReduceMotion
                  ? { duration: 0 }
                  : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }
              }
            >
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
            </motion.div>
          </div>
          <div className="absolute right-2 top-[48%] -translate-y-1/2 sm:right-4 sm:top-[50%]">
            <motion.div
              className="flex max-w-[7rem] flex-col items-center gap-2 text-center"
              animate={
                swipeHintsReduceMotion
                  ? { opacity: 1, scale: 1 }
                  : { opacity: [0.78, 1, 0.78], scale: [1, 1.06, 1] }
              }
              transition={
                swipeHintsReduceMotion
                  ? { duration: 0 }
                  : { duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: 0.35 }
              }
            >
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
            </motion.div>
          </div>
        </div>
      )}

      {/* L1 meaning — full-width sheet slides down from top; bottom rail stays clear */}
      <AnimatePresence>
        {l1Visible && (
          <motion.div
            key={l1LockKey}
            initial={{ y: '-100%' }}
            animate={{ y: 0 }}
            exit={{ y: '-100%' }}
            transition={{ type: 'tween', duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
            className="pointer-events-none absolute inset-x-0 top-0 z-40 px-0 pt-[calc(1rem+env(safe-area-inset-top,0px))]"
          >
            <MeaningTapOverlayCard
              word={currentWord}
              locale={locale}
              isNativelySupported={isNativelySupported}
              userLangLabel={userLangLabel}
              staticMeaning={staticMeaning}
              englishMeaning={englishMeaning}
              translatedMeaning={translatedMeaning}
              illustrativeGlossTranslated={illustrativeGlossTranslated}
              compoundResult={
                getWordContentKind(currentWord) === 'character'
                  ? resolveCharacterCompounds(currentWord)
                  : undefined
              }
            />
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

      {/* TikTok-style right sidebar — only after video is playable so counts match what users see */}
      {videoReady ? (
      <div
        className="absolute right-3 z-10 flex flex-col items-center gap-5"
        style={{
          bottom: 'calc(56px + env(safe-area-inset-bottom, 0px) + 10px)',
        }}
      >
        <button
          type="button"
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
            <svg viewBox="0 0 24 24" width="36" height="36" className="drop-shadow-lg" aria-hidden>
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
          {displayedLikeCount != null && displayedLikeCount > 0 ? (
            <span className="text-xs font-semibold text-white/90 drop-shadow tabular-nums">
              {displayedLikeCount}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={handleSaveToggle}
          className="flex flex-col items-center gap-1 active:scale-110 transition-transform"
          aria-label={saved ? 'Remove save' : 'Save'}
        >
          <svg viewBox="0 0 24 24" width="34" height="34" className="drop-shadow-lg" aria-hidden>
            <path
              d="M6 4h12a2 2 0 0 1 2 2v14l-8-4-8 4V6a2 2 0 0 1 2-2z"
              fill={saved ? 'rgba(250,204,21,0.95)' : 'rgba(255,255,255,0.12)'}
              stroke={saved ? '#facc15' : 'rgba(255,255,255,0.9)'}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-[10px] font-semibold text-white/90 drop-shadow">Save</span>
        </button>
        <button
          type="button"
          onClick={() => {
            const started = tryNativeShareWordFromUserGesture(currentWord, {
              onFallback: () => setShareSheetOpen(true),
            })
            if (!started) setShareSheetOpen(true)
          }}
          className="flex flex-col items-center gap-1 active:scale-110 transition-transform"
          aria-label="Share word"
        >
          <svg viewBox="0 0 24 24" width="34" height="34" className="drop-shadow-lg" aria-hidden>
            <path
              d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13"
              fill="none"
              stroke="rgba(255,255,255,0.92)"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-[10px] font-semibold text-white/90 drop-shadow">Share</span>
        </button>
      </div>
      ) : null}

      <ShareWordSheet
        open={shareSheetOpen}
        word={shareSheetOpen ? currentWord : null}
        onClose={() => setShareSheetOpen(false)}
      />

      <SaveProgressModal
        open={saveProgressOpen}
        welcomeBack={saveProgressWelcomeBack}
        wordsInProgress={countWordsWithSessions(wordStates)}
        initialEmail={getLastUsedAccountEmail() ?? ''}
        allowNotNow={(meta.accountSaveNotNowCount ?? 0) < 2}
        onDismissWithoutAccount={dismissSaveProgress}
        onMagicLinkSent={recordMagicLinkSent}
        onCloseAfterSuccess={closeSaveProgressAfterSuccess}
      />

      {cloudSavedToast ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] left-1/2 z-[56] w-[min(92vw,22rem)] -translate-x-1/2 rounded-2xl border border-emerald-400/35 bg-emerald-950/95 px-4 py-3 text-center text-sm font-semibold leading-snug text-emerald-50 shadow-[0_12px_40px_rgba(0,0,0,0.5)] ring-1 ring-emerald-400/20 backdrop-blur-sm"
        >
          Signed in — your learning progress is saved to the cloud.
        </div>
      ) : null}
    </div>
  )
}
