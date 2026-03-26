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
import { getLikeStatus, toggleLike } from '../lib/likeService'
import { words as wordDataset } from '../data/words'

const LOOP_MS = 5000

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

  // First ~40 sessions: bias toward bucket A so new users see more different characters
  // before the usual 10% "new" slice dominates exploration.
  const earlyOnboarding = sessionsServed < 40 && bucketA.length > 0
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
  const firedRef = useRef(false)

  useEffect(() => {
    let destroyed = false
    firedRef.current = false
    let playingFallbackTimer: number | null = null

    const firePlayingOnce = () => {
      if (destroyed || firedRef.current) return
      firedRef.current = true
      if (playingFallbackTimer !== null) {
        window.clearTimeout(playingFallbackTimer)
        playingFallbackTimer = null
      }
      onPlayingRef.current()
    }

    const init = async () => {
      await ensureYouTubeAPI()
      if (destroyed || !hostRef.current) return

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
          loop: 0,
          ...(origin ? { origin } : {}),
        },
        events: {
          onReady: (e: any) => {
            try {
              e.target.mute()
              e.target.playVideo()
            } catch {}
            // Mobile / multi-embed: PLAYING sometimes never fires; still unblock UI after init.
            playingFallbackTimer = window.setTimeout(() => firePlayingOnce(), 1000)
          },
          onStateChange: (e: any) => {
            const YT = (window as any).YT
            if (e.data === YT.PlayerState.PLAYING) {
              firePlayingOnce()
            }
            if (e.data === YT.PlayerState.ENDED) {
              e.target.seekTo(0)
              e.target.playVideo()
            }
          },
        },
      })

      const iframe = hostRef.current.querySelector('iframe')
      if (iframe) {
        iframe.style.pointerEvents = 'none'
        iframe.style.width = '100%'
        iframe.style.height = '100%'
        iframe.style.border = '0'
      }
    }

    init()

    return () => {
      destroyed = true
      if (playingFallbackTimer !== null) window.clearTimeout(playingFallbackTimer)
      if (playerRef.current) {
        try { playerRef.current.destroy() } catch {}
        playerRef.current = null
      }
    }
  }, [videoId])

  return <div ref={hostRef} className="h-full w-full" />
}

export default function VideoFeed() {
  const words: WordMetadata[] = wordDataset

  const locale = useMemo(() => detectSupportedLocale(), [])
  const rawLang = useMemo(() => getRawLangCode(), [])
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

  const ytId = useMemo(
    () => (currentWord.youtube_url ? extractYouTubeId(currentWord.youtube_url) : null),
    [currentWord.youtube_url],
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
  const [showTapGhostHint, setShowTapGhostHint] = useState(false)
  const ghostHintFiredRef = useRef(false)
  const [showPrimerArrow, setShowPrimerArrow] = useState(false)
  const [showPrimerTapHint, setShowPrimerTapHint] = useState(false)
  const [videoReady, setVideoReady] = useState(false)

  useEffect(() => {
    if (!ytId) return
    const t = window.setTimeout(() => {
      setVideoReady((r) => r || true)
    }, 12000)
    return () => window.clearTimeout(t)
  }, [currentWord.word_id, ytId])

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
    setShowTapGhostHint(false)
    ghostHintFiredRef.current = false
    setShowPrimerArrow(false)
    setShowPrimerTapHint(false)
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
      primerTimer = window.setTimeout(() => setShowPrimerArrow(true), 3000)
    } else if (sessionVideoIndex === 1) {
      primerTimer = window.setTimeout(() => setShowPrimerTapHint(true), 3000)
    }

    const tick = () => {
      const now = Date.now()
      const elapsed = now - startSessionMs
      elapsedMsRef.current = elapsed
      const loopsElapsed = loopsElapsedFromMs(elapsed)

      if (!ghostHintFiredRef.current && !finalizedRef.current && !tapOccurredRef.current && loopsElapsed >= 10) {
        ghostHintFiredRef.current = true
        setShowTapGhostHint(true)
      }

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
    const videoKey = currentWord.youtube_url || currentWord.video_url
    let cancelled = false
    getLikeStatus(videoKey).then((s) => {
      if (cancelled) return
      setLiked(s.liked)
      setLikeCount(s.count)
    })
    return () => { cancelled = true }
  }, [currentWord.word_id, currentWord.youtube_url, currentWord.video_url])

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

    if (tapSingleTimeoutRef.current) {
      window.clearTimeout(tapSingleTimeoutRef.current)
      tapSingleTimeoutRef.current = null
    }
    lastTapUpTimeRef.current = null
    setL1Visible(false)
    setShowTapGhostHint(false)

    const nowMs = Date.now()
    const elapsed = nowMs - sessionStartMsRef.current
    const loopsElapsed = loopsElapsedFromMs(elapsed)

    const tapOccurred = tapOccurredRef.current
    const tapTiming = tapTimingRef.current

    const signals: SessionSignals = {
      word_id: currentWord.word_id,
      video_id: currentWord.video_url,
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

    const qualityVideoId = currentWord.video_url
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
    const videoKey = currentWord.youtube_url || currentWord.video_url
    setLiked(true)
    setLikeCount((c) => c + 1)
    toggleLike(videoKey).then((s) => { setLiked(s.liked); setLikeCount(s.count) })
  }

  const handleHeartToggle = useCallback(() => {
    const videoKey = currentWord.youtube_url || currentWord.video_url
    const wasLiked = likedRef.current
    setLiked(!wasLiked)
    setLikeCount((c) => wasLiked ? Math.max(0, c - 1) : c + 1)
    if (!wasLiked) triggerLikeBurst()
    toggleLike(videoKey).then((s) => { setLiked(s.liked); setLikeCount(s.count) })
  }, [currentWord.youtube_url, currentWord.video_url, triggerLikeBurst])

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

      // Horizontal swipe
      if (absDx > 30 && absDx > absDy * 0.6 && duration < 1200) {
        const dir: SwipeDirection = dx < 0 ? 'left' : 'right'
        finalizeSessionRef.current(dir)
        return
      }

      // Vertical swipe (TikTok-style: swipe up = advance/right, swipe down = back/left)
      if (absDy > 30 && absDy > absDx * 0.6 && duration < 1200) {
        const dir: SwipeDirection = dy < 0 ? 'right' : 'left'
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

    if (absDy > 30 && absDy > absDx * 0.6 && duration < 1200) {
      const dir: SwipeDirection = dy < 0 ? 'right' : 'left'
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

      {/* Video background layer — no pointer events so gestures pass through */}
      <div className="absolute inset-0 z-[1]" style={{ pointerEvents: 'none' }}>
        {ytId ? (
          <YouTubePlayer
            key={`${currentWord.word_id}:${ytId}`}
            videoId={ytId}
            onPlaying={() => setVideoReady(true)}
          />
        ) : (
          <video
            key={currentWord.video_url}
            src={currentWord.video_url}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
            style={{ pointerEvents: 'none' }}
            onLoadedData={() => setVideoReady(true)}
          />
        )}
      </div>

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
        aria-label="Stealth-learning swipe feed. Swipe left/right, tap for meaning, long-press for breakdown."
      >
        {/* Onboarding primer hints */}
        <AnimatePresence>
          {showPrimerArrow && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            >
              <div className="rounded-full bg-white/15 px-5 py-3 text-sm font-semibold backdrop-blur">
                Swipe right
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Onboarding primer: "Tap for meaning" hint on Video 2 */}
        <AnimatePresence>
          {showPrimerTapHint && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="absolute left-1/2 top-[60%] -translate-x-1/2"
            >
              <div className="rounded-full bg-white/15 px-5 py-3 text-sm font-semibold backdrop-blur">
                Tap for meaning
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Ghost hint: reappears after 10 loops without interaction (PRD §7.2) */}
        <AnimatePresence>
          {showTapGhostHint && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute left-1/2 bottom-[30%] -translate-x-1/2 pointer-events-none"
            >
              <div className="rounded-full bg-white/10 px-4 py-2.5 text-xs font-medium backdrop-blur text-white/70">
                Tap anywhere for meaning
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
                  Swipe left/right to score. Tap for meaning. Long-press for details.
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>

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
