import { AnimatePresence, motion } from 'framer-motion'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { classifyTapTiming, loopsElapsedFromMs } from '../lib/memoryEngine'
import { notifyPersistedStateReplaced } from '../lib/accountSync'
import { loadPersistedState, savePersistedState } from '../lib/storage'
import {
  applyStudySwipeToPersistedState,
  shouldBlockUnsignedSwipeAfterCap,
} from '../lib/studySessionSwipeFinish'
import type { SwipeDirection, TapTiming, WordMetadata } from '../lib/types'
import { getSupabaseClient } from '../lib/deckService'
import {
  engagementSetLike,
  engagementSetSave,
  fetchEngagementSnapshot,
  getLocalLikedWordIds,
  getLocalSavedWordIds,
  tryNativeShareWordFromUserGesture,
} from '../lib/engagementService'
import {
  createLessonVideoSignedUrl,
  devPreferYoutubeFallback,
  peekCachedLessonVideoSignedUrl,
} from '../lib/storageVideoUrl'
import { resolveCharacterCompounds } from '../lib/characterCompounds'
import { getWordContentKind } from '../lib/wordContentKind'
import { youtubePosterUrlForWord } from '../lib/wordVideoThumb'
import { extractYouTubeVideoId } from '../lib/youtubeUrl'
import { MeaningTapOverlayCard } from './MeaningTapOverlay'
import { ShareWordSheet } from './ShareWordSheet'
import { YouTubeEmbedPlayer } from './YouTubeEmbedPlayer'

type SupportedLocale = 'en' | 'zh-TW' | 'th'

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

type Props = {
  word: WordMetadata
  onBack: () => void
  /** Matches grid thumbnail `layoutId` for expand-to-fullscreen transition (Saved / Liked / Shared). */
  thumbSharedLayoutId?: string
  /** When true, anonymous guests cannot record another swipe once they hit the feed cap (parity with VideoFeed). */
  respectAnonymousSwipeCap?: boolean
  /** Used with `respectAnonymousSwipeCap` — true if the user has a Supabase session. */
  isSignedIn?: boolean
  /** With `disableSrsScoring`, horizontal swipes navigate this list instead of applying SRS and closing. */
  browseWordList?: WordMetadata[]
  /** Skip SRS on swipe; use with `browseWordList` for profile vault browsing. */
  disableSrsScoring?: boolean
}

/** Tween (not spring) so collapse-on-back finishes quickly and does not ring past the thumbnail. */
const sharedThumbLayoutTransition = {
  layout: {
    type: 'tween' as const,
    duration: 0.28,
    ease: [0.32, 0.72, 0, 1] as const,
  },
}

/**
 * Single-word loop player from Profile (Saved / Liked / Shared), or vault browse when
 * `browseWordList` + `disableSrsScoring` are set (swipes move within the list, no SRS).
 * Otherwise horizontal swipe applies the same SRS update as `VideoFeed` and returns to the grid.
 * Back exits without recording a swipe session.
 */
export function EngagementWordPlayer({
  word,
  onBack,
  thumbSharedLayoutId,
  respectAnonymousSwipeCap = false,
  isSignedIn = true,
  browseWordList,
  disableSrsScoring = false,
}: Props) {
  const browseWordListRef = useRef(browseWordList)
  browseWordListRef.current = browseWordList
  const disableSrsRef = useRef(disableSrsScoring)
  disableSrsRef.current = disableSrsScoring

  const vaultBrowse = Boolean(
    disableSrsScoring && browseWordList && browseWordList.length > 0,
  )

  /** Must match picked `word` on first paint — `useState(0)` showed list[0] until an effect ran (wrong clip). */
  const [browseIdx, setBrowseIdx] = useState(() => {
    if (!disableSrsScoring || !browseWordList?.length) return 0
    const i = browseWordList.findIndex((w) => w.word_id === word.word_id)
    return i >= 0 ? i : 0
  })

  useEffect(() => {
    if (!vaultBrowse) return
    const list = browseWordListRef.current
    if (!list?.length) return
    const i = list.findIndex((w) => w.word_id === word.word_id)
    setBrowseIdx(i >= 0 ? i : 0)
  }, [vaultBrowse, word.word_id])

  const activeWord = useMemo(() => {
    if (!vaultBrowse || !browseWordList?.length) return word
    const i = Math.max(0, Math.min(browseWordList.length - 1, browseIdx))
    return browseWordList[i]
  }, [vaultBrowse, browseWordList, browseIdx, word])

  const wordRef = useRef(activeWord)
  wordRef.current = activeWord

  /** Native `<video>` only (not YouTube). Used to `play()` after mount — Library/Profile open after tap can miss `autoPlay`. */
  const feedVideoRef = useRef<HTMLVideoElement | null>(null)

  const [engageVideoReady, setEngageVideoReady] = useState(false)
  const [shareSheetOpen, setShareSheetOpen] = useState(false)

  const locale = useMemo(() => detectSupportedLocale(), [])
  const rawLang = useMemo(() => getRawLangCode(), [])
  const isNativelySupported = useMemo(
    () => rawLang === 'en' || rawLang === 'th' || rawLang === 'zh',
    [rawLang],
  )
  const userLangLabel = useMemo(() => langDisplayName(rawLang), [rawLang])

  const extractedYoutubeId = useMemo(() => {
    if (!activeWord.youtube_url) return null
    return extractYouTubeVideoId(activeWord.youtube_url)
  }, [activeWord.youtube_url])

  const [youtubeFallback, setYoutubeFallback] = useState(false)

  const needsSignedNativeUrl = Boolean(activeWord.use_video_url && activeWord.video_storage_path?.trim())
  const [nativePlaybackSrc, setNativePlaybackSrc] = useState<string | null>(null)

  const ytId = useMemo(() => {
    if (!extractedYoutubeId) return null
    if (!activeWord.use_video_url) return extractedYoutubeId
    if (youtubeFallback) return extractedYoutubeId
    return null
  }, [activeWord.use_video_url, extractedYoutubeId, youtubeFallback])

  useEffect(() => {
    setYoutubeFallback(false)
    if (!needsSignedNativeUrl || !activeWord.video_storage_path) {
      setNativePlaybackSrc(null)
      return
    }
    const fallback = activeWord.video_url
    const canUseYoutubeBackup = Boolean(extractedYoutubeId)
    const goYoutubeBackup = () => {
      setNativePlaybackSrc(null)
      queueMicrotask(() => setYoutubeFallback(true))
    }
    if (devPreferYoutubeFallback() && canUseYoutubeBackup) {
      goYoutubeBackup()
      return
    }
    const client = getSupabaseClient()
    if (!client) {
      if (canUseYoutubeBackup) goYoutubeBackup()
      else setNativePlaybackSrc(fallback)
      return
    }
    const cached = peekCachedLessonVideoSignedUrl(activeWord.video_storage_path, activeWord.video_storage_bucket)
    if (cached) {
      setNativePlaybackSrc(cached)
      return
    }
    let cancelled = false
    setNativePlaybackSrc(null)
    void (async () => {
      const result = await createLessonVideoSignedUrl(activeWord.video_storage_path!, activeWord.video_storage_bucket)
      if (cancelled) return
      if ('url' in result) setNativePlaybackSrc(result.url)
      else if (canUseYoutubeBackup) goYoutubeBackup()
      else setNativePlaybackSrc(fallback)
    })()
    return () => { cancelled = true }
  }, [
    activeWord.word_id,
    activeWord.video_url,
    activeWord.youtube_url,
    needsSignedNativeUrl,
    activeWord.video_storage_path,
    activeWord.video_storage_bucket,
    extractedYoutubeId,
  ])

  const englishMeaning = activeWord.l1_meanings.en ?? ''
  const staticMeaning = activeWord.l1_meanings[locale] ?? englishMeaning
  const [translatedMeaning, setTranslatedMeaning] = useState<string | null>(null)
  const illustrativeEn = activeWord.illustrative_sentence?.l1_meanings?.en?.trim() ?? ''
  const [illustrativeGlossTranslated, setIllustrativeGlossTranslated] = useState<string | null>(null)

  useEffect(() => {
    if (isNativelySupported) {
      setTranslatedMeaning(null)
      return
    }
    if (!englishMeaning) return
    let cancelled = false
    setTranslatedMeaning(translationCache[`${rawLang}::${englishMeaning}`] || null)
    const t = window.setTimeout(() => {
      void fetchTranslation(englishMeaning, rawLang).then((res) => {
        if (!cancelled && res) setTranslatedMeaning(res)
      })
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [activeWord.word_id, rawLang, isNativelySupported, englishMeaning])

  useEffect(() => {
    if (isNativelySupported || !illustrativeEn) {
      setIllustrativeGlossTranslated(null)
      return
    }
    const cacheKey = `${rawLang}::ill::${illustrativeEn}`
    if (translationCache[cacheKey]) {
      setIllustrativeGlossTranslated(translationCache[cacheKey])
      return
    }
    let cancelled = false
    setIllustrativeGlossTranslated(null)
    const timer = window.setTimeout(() => {
      void fetchTranslation(illustrativeEn, rawLang).then((tr) => {
        if (!cancelled && tr) {
          translationCache[cacheKey] = tr
          setIllustrativeGlossTranslated(tr)
        }
      })
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [activeWord.word_id, rawLang, isNativelySupported, illustrativeEn])

  const [liked, setLiked] = useState(() => getLocalLikedWordIds().includes(word.word_id))
  const [saved, setSaved] = useState(() => getLocalSavedWordIds().includes(word.word_id))
  const [likeCount, setLikeCount] = useState<number | null>(null)
  const [saveCount, setSaveCount] = useState<number | null>(null)
  const [shareCount, setShareCount] = useState<number | null>(null)
  const [backendCountsOk, setBackendCountsOk] = useState(false)
  const likedRef = useRef(false)
  likedRef.current = liked
  const savedRef = useRef(false)
  savedRef.current = saved
  const backendCountsOkRef = useRef(false)
  backendCountsOkRef.current = backendCountsOk

  const refreshEngagement = useCallback(async () => {
    const w = wordRef.current
    const wid = w.word_id
    const snap = await fetchEngagementSnapshot(w)
    if (wid !== wordRef.current.word_id) return
    const localLiked = getLocalLikedWordIds().includes(wid)
    const localSaved = getLocalSavedWordIds().includes(wid)
    setLiked(snap.liked || localLiked)
    setSaved(snap.saved || localSaved)
    setLikeCount(snap.likeCount)
    setSaveCount(snap.saveCount)
    setShareCount(snap.shareCount)
    setBackendCountsOk(snap.backendCountsOk)
  }, [])

  useEffect(() => {
    setShareSheetOpen(false)
  }, [activeWord.word_id])

  useEffect(() => {
    const wid = activeWord.word_id
    setLiked(getLocalLikedWordIds().includes(wid))
    setSaved(getLocalSavedWordIds().includes(wid))
    setLikeCount(null)
    setSaveCount(null)
    setShareCount(null)
    setBackendCountsOk(false)
    let id2 = 0
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => {
        void refreshEngagement()
      })
    })
    return () => {
      cancelAnimationFrame(id1)
      cancelAnimationFrame(id2)
    }
  }, [activeWord.word_id, refreshEngagement])

  const [l1Visible, setL1Visible] = useState(false)
  const [l1LockKey, setL1LockKey] = useState(0)
  const [likeBurstKey, setLikeBurstKey] = useState(0)
  const [likeBurstVisible, setLikeBurstVisible] = useState(false)
  const likeBurstTimerRef = useRef<number | null>(null)

  const sessionStartMsRef = useRef(Date.now())
  const finalizedRef = useRef(false)
  const tapOccurredRef = useRef(false)
  const tapTimingRef = useRef<TapTiming | undefined>(undefined)

  useEffect(() => {
    finalizedRef.current = false
    tapOccurredRef.current = false
    tapTimingRef.current = undefined
    sessionStartMsRef.current = Date.now()
    if (tapSingleTimeoutRef.current) window.clearTimeout(tapSingleTimeoutRef.current)
    tapSingleTimeoutRef.current = null
    lastTapUpTimeRef.current = null
  }, [activeWord.word_id])

  const recordTap = (loopsElapsed: number) => {
    if (tapOccurredRef.current) return
    tapOccurredRef.current = true
    tapTimingRef.current = classifyTapTiming(loopsElapsed)
  }

  const finalizeSwipeAndExit = useCallback(
    (swipeDirection: SwipeDirection) => {
      const list = browseWordListRef.current
      const browseMode = Boolean(disableSrsRef.current && list && list.length > 0)
      if (browseMode) {
        if (list!.length <= 1) return
        setBrowseIdx((i) => {
          const len = list!.length
          if (swipeDirection === 'right') return Math.min(len - 1, i + 1)
          return Math.max(0, i - 1)
        })
        return
      }

      if (finalizedRef.current) return
      finalizedRef.current = true
      if (tapSingleTimeoutRef.current) window.clearTimeout(tapSingleTimeoutRef.current)
      tapSingleTimeoutRef.current = null
      lastTapUpTimeRef.current = null
      setL1Visible(false)

      const nowMs = Date.now()
      const elapsed = nowMs - sessionStartMsRef.current
      const persisted = loadPersistedState()
      if (
        respectAnonymousSwipeCap &&
        shouldBlockUnsignedSwipeAfterCap(persisted.meta.first20Seen, isSignedIn)
      ) {
        return
      }
      const next = applyStudySwipeToPersistedState({
        word: wordRef.current,
        swipeDirection,
        sessionElapsedMs: elapsed,
        tapOccurred: tapOccurredRef.current,
        tapTiming: tapTimingRef.current,
        persisted,
        nowMs,
      })
      savePersistedState(next)
      notifyPersistedStateReplaced()
      window.setTimeout(() => onBack(), 80)
    },
    [onBack, respectAnonymousSwipeCap, isSignedIn],
  )
  const triggerLikeBurst = useCallback(() => {
    setLikeBurstKey((k) => k + 1)
    setLikeBurstVisible(true)
    if (likeBurstTimerRef.current) window.clearTimeout(likeBurstTimerRef.current)
    likeBurstTimerRef.current = window.setTimeout(() => setLikeBurstVisible(false), 600)
  }, [])

  const tapSingleTimeoutRef = useRef<number | null>(null)
  const lastTapUpTimeRef = useRef<number | null>(null)

  const doLikeRef = useRef<() => void>(() => {})
  doLikeRef.current = () => {
    if (likedRef.current) return
    setLiked(true)
    if (backendCountsOkRef.current) {
      setLikeCount((c) => (c != null ? c + 1 : c))
    }
    void engagementSetLike(wordRef.current, true).then(() => refreshEngagement())
  }

  const handleHeartToggle = useCallback(() => {
    const was = likedRef.current
    const next = !was
    setLiked(next)
    if (backendCountsOkRef.current) {
      setLikeCount((c) => (c != null ? (next ? c + 1 : Math.max(0, c - 1)) : c))
    }
    if (!was) triggerLikeBurst()
    void engagementSetLike(wordRef.current, next).then(() => refreshEngagement())
  }, [triggerLikeBurst, refreshEngagement])

  const handleSaveToggle = useCallback(() => {
    const next = !savedRef.current
    setSaved(next)
    if (backendCountsOkRef.current) {
      setSaveCount((c) => (c != null ? (next ? c + 1 : Math.max(0, c - 1)) : c))
    }
    void engagementSetSave(wordRef.current, next).then(() => refreshEngagement())
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
        setL1LockKey((k) => k + 1)
        setL1Visible(true)
        speakChinese(wordRef.current.character)
        window.setTimeout(() => setL1Visible(false), 2000)
        tapSingleTimeoutRef.current = null
      }, DOUBLE_GAP_MS)
    }
  }, [triggerLikeBurst])

  const gestureRef = useRef<HTMLDivElement>(null)
  const touchStateRef = useRef<{ startX: number; startY: number; startTime: number } | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      if (e.repeat) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target
      if (t instanceof HTMLElement && t.closest('input, textarea, select, [contenteditable="true"]')) return
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        finalizeSwipeAndExit(e.key === 'ArrowLeft' ? 'left' : 'right')
        return
      }
      if (e.code !== 'Space') return
      e.preventDefault()
      const loops = loopsElapsedFromMs(Date.now() - sessionStartMsRef.current)
      handleTapGesture(loops)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleTapGesture, finalizeSwipeAndExit])

  useEffect(() => {
    const el = gestureRef.current
    if (!el) return

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      e.preventDefault()
      e.stopPropagation()
      const t = e.touches[0]
      touchStateRef.current = {
        startX: t.clientX,
        startY: t.clientY,
        startTime: Date.now(),
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
      touchStateRef.current = null
      if (!st) return
      const touch = e.changedTouches[0]
      const dx = touch.clientX - st.startX
      const dy = touch.clientY - st.startY
      const absDx = Math.abs(dx)
      const absDy = Math.abs(dy)
      const duration = Date.now() - st.startTime
      const loopsElapsed = loopsElapsedFromMs(Date.now() - sessionStartMsRef.current)

      if (absDx > 30 && absDx > absDy * 0.6 && duration < 1200) {
        finalizeSwipeAndExit(dx < 0 ? 'left' : 'right')
        return
      }

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
  }, [handleTapGesture, finalizeSwipeAndExit])

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
    const loopsElapsed = loopsElapsedFromMs(Date.now() - sessionStartMsRef.current)

    if (absDx > 30 && absDx > absDy * 0.6 && duration < 1200) {
      finalizeSwipeAndExit(dx < 0 ? 'left' : 'right')
      return
    }

    if (absDx < 15 && absDy < 15 && duration < 400) {
      handleTapGesture(loopsElapsed)
    }
  }

  const posterUrl = useMemo(() => youtubePosterUrlForWord(activeWord), [activeWord])

  /**
   * True only when the catalog has no video source at all. Do **not** treat “signed URL still
   * loading” as missing — HSK and similar rows often have Storage + static `video_url` but no
   * `youtube_url`; the old formula set this true before `nativePlaybackSrc` resolved and showed
   * “No playable video” incorrectly.
   */
  const missingVideo = useMemo(() => {
    const hasYoutube = Boolean(extractedYoutubeId)
    const hasStorage = Boolean(activeWord.use_video_url && activeWord.video_storage_path?.trim())
    const hasDirectUrl = Boolean(activeWord.video_url?.trim())
    return !hasYoutube && !hasStorage && !hasDirectUrl
  }, [
    extractedYoutubeId,
    activeWord.use_video_url,
    activeWord.video_storage_path,
    activeWord.video_url,
  ])

  useEffect(() => {
    if (missingVideo) {
      setEngageVideoReady(true)
      return
    }
    setEngageVideoReady(false)
    const t = window.setTimeout(() => setEngageVideoReady(true), 5000)
    return () => window.clearTimeout(t)
  }, [missingVideo, activeWord.word_id])

  const markPlaybackReady = useCallback(() => {
    setEngageVideoReady(true)
  }, [])

  /**
   * Same idea as VideoFeed: some desktop browsers omit loadeddata/canplay; still unstick poster overlay.
   */
  useEffect(() => {
    if (missingVideo) return
    const t = window.setTimeout(() => markPlaybackReady(), 10_000)
    return () => window.clearTimeout(t)
  }, [activeWord.word_id, missingVideo, markPlaybackReady])

  /**
   * Opening from Library cube tap finishes before this `<video>` mounts — `autoPlay` alone can fail.
   * Retry `play()` on next frame(s) after src is set (muted = usually allowed).
   */
  useEffect(() => {
    if (ytId) return
    if (missingVideo) return
    let cancelled = false
    let id2: number | null = null
    const run = () => {
      if (cancelled) return
      const v = feedVideoRef.current
      if (v) void v.play().catch(() => {})
    }
    const id1 = window.requestAnimationFrame(() => {
      run()
      id2 = window.requestAnimationFrame(run)
    })
    return () => {
      cancelled = true
      window.cancelAnimationFrame(id1)
      if (id2 != null) window.cancelAnimationFrame(id2)
    }
  }, [activeWord.word_id, activeWord.video_url, ytId, missingVideo, nativePlaybackSrc, needsSignedNativeUrl])

  /** Show actions + character as soon as we have a still (poster) or playable video. */
  const chromeReady = missingVideo || engageVideoReady || Boolean(posterUrl)

  const displayedLikeCount =
    backendCountsOk && likeCount !== null ? Math.max(likeCount, liked ? 1 : 0) : null
  const displayedSaveCount =
    backendCountsOk && saveCount !== null ? Math.max(saveCount, saved ? 1 : 0) : null
  const displayedShareCount = backendCountsOk && shareCount !== null ? shareCount : null

  const slideTransition = { type: 'tween' as const, duration: 0.17, ease: [0.25, 0.1, 0.25, 1] as const }

  return (
    <motion.div
      {...(thumbSharedLayoutId
        ? {
            initial: false,
            animate: { opacity: 1 },
            exit: { opacity: 1 },
            transition: { opacity: { duration: 0 } },
          }
        : {
            initial: { x: '100%' },
            animate: { x: 0 },
            exit: { x: '100%' },
            transition: slideTransition,
          })}
      className="absolute inset-0 z-[52] flex h-dvh w-full flex-col bg-black"
      style={{ backgroundColor: '#000' }}
    >
      {/* Static full-screen black under shared layout projection (expand + collapse). */}
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-black"
        style={{ backgroundColor: '#000' }}
        aria-hidden
      />
      <motion.div
        layoutId={thumbSharedLayoutId}
        transition={thumbSharedLayoutId ? sharedThumbLayoutTransition : undefined}
        className="absolute inset-0 z-[1] overflow-hidden bg-black md:flex md:items-center md:justify-center"
        style={{ pointerEvents: 'none', backgroundColor: '#000' }}
      >
        {/*
          Match Home feed: full-bleed cover on phones; on md+ letterbox so portrait Shorts are not over-cropped
          on desktop (Library deck vault, Profile word lists, grammar vault).
        */}
        {ytId ? (
          <div
            key={activeWord.word_id}
            className="relative z-[2] h-full w-full min-h-0 min-w-0 bg-black md:mx-auto md:h-[min(100dvh,calc(100vw*16/9))] md:w-[min(100vw,calc(100dvh*9/16))]"
          >
            <YouTubeEmbedPlayer videoId={ytId} onPlaying={markPlaybackReady} />
          </div>
        ) : needsSignedNativeUrl ? (
          nativePlaybackSrc ? (
            <video
              ref={feedVideoRef}
              key={activeWord.word_id}
              src={nativePlaybackSrc}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              poster={posterUrl ?? undefined}
              className="relative z-[2] h-full w-full min-h-0 object-cover bg-black md:h-auto md:max-h-[100dvh] md:w-auto md:max-w-[100vw] md:object-contain"
              onLoadedData={markPlaybackReady}
              onLoadedMetadata={markPlaybackReady}
              onCanPlay={markPlaybackReady}
              onCanPlayThrough={markPlaybackReady}
              onPlaying={markPlaybackReady}
              onError={() => {
                const w = wordRef.current
                const fb = w.video_url
                setNativePlaybackSrc((prev) => {
                  if (prev !== fb) return fb
                  const yid = w.youtube_url ? extractYouTubeVideoId(w.youtube_url) : null
                  if (yid) queueMicrotask(() => setYoutubeFallback(true))
                  return prev
                })
              }}
            />
          ) : null
        ) : activeWord.video_url ? (
          <video
            ref={feedVideoRef}
            key={activeWord.video_url}
            src={activeWord.video_url}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            poster={posterUrl ?? undefined}
            className="relative z-[2] h-full w-full min-h-0 object-cover bg-black md:h-auto md:max-h-[100dvh] md:w-auto md:max-w-[100vw] md:object-contain"
            onLoadedData={markPlaybackReady}
            onLoadedMetadata={markPlaybackReady}
            onCanPlay={markPlaybackReady}
            onCanPlayThrough={markPlaybackReady}
            onPlaying={markPlaybackReady}
          />
        ) : null}
        {posterUrl && !engageVideoReady ? (
          <img
            src={posterUrl}
            alt=""
            loading="eager"
            decoding="async"
            fetchPriority="high"
            className="pointer-events-none absolute inset-0 z-[4] h-full w-full bg-black object-cover md:object-contain"
          />
        ) : null}
      </motion.div>

      <div className="pointer-events-none absolute left-0 right-0 top-0 z-50 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent px-3 pb-10 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {/*
          Product choice (matches main feed: only a completed swipe is an SRS session): Back closes without
          finalizeSwipeAndExit — loop/watch time alone is not scored. Do not add implicit flush on unmount.
        */}
        <button
          type="button"
          onClick={onBack}
          className="pointer-events-auto flex items-center gap-1 rounded-full bg-black/45 px-3 py-2 text-sm font-medium text-white/90 ring-1 ring-white/20 backdrop-blur-md active:scale-95"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
      </div>

      {missingVideo ? (
        <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center px-6 text-center text-sm text-white/55">
          No playable video for this item in the app catalog.
        </div>
      ) : null}

      <div
        ref={gestureRef}
        className="absolute inset-0 z-[5]"
        style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        role="application"
        aria-label={
          vaultBrowse
            ? 'Video replay. Tap for meaning. Swipe left or right to move between words in this list.'
            : 'Video replay. Tap for meaning. Swipe left or right to save review and go back.'
        }
      >
        <AnimatePresence>
          {likeBurstVisible && (
            <motion.div
              key={likeBurstKey}
              initial={{ opacity: 1, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1.3 }}
              exit={{ opacity: 0, scale: 1.6, y: -30 }}
              transition={{ duration: 0.4 }}
              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            >
              <div className="text-6xl" style={{ color: '#ff2d55' }}>&#x2764;</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {l1Visible && (
          <motion.div
            key={l1LockKey}
            initial={{ y: '-100%' }}
            animate={{ y: 0 }}
            exit={{ y: '-100%' }}
            transition={{ type: 'tween', duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
            className="pointer-events-none absolute inset-x-0 top-0 z-[38] px-0 pt-[calc(1rem+env(safe-area-inset-top,0px))]"
          >
            <MeaningTapOverlayCard
              word={activeWord}
              locale={locale}
              isNativelySupported={isNativelySupported}
              userLangLabel={userLangLabel}
              staticMeaning={staticMeaning}
              englishMeaning={englishMeaning}
              translatedMeaning={translatedMeaning}
              illustrativeGlossTranslated={illustrativeGlossTranslated}
              compoundResult={
                getWordContentKind(activeWord) === 'character'
                  ? resolveCharacterCompounds(activeWord)
                  : undefined
              }
            />
          </motion.div>
        )}
      </AnimatePresence>

      {chromeReady ? (
      <div
        className="pointer-events-none absolute right-3 z-20 flex flex-col items-center gap-5"
        style={{
          bottom: 'calc(56px + env(safe-area-inset-bottom, 0px) + 10px)',
        }}
      >
        <button
          type="button"
          onClick={handleHeartToggle}
          className="pointer-events-auto flex flex-col items-center gap-1 active:scale-110 transition-transform"
          aria-label={liked ? 'Unlike' : 'Like'}
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
          {displayedLikeCount != null ? (
            <span className="text-xs font-semibold text-white/90 drop-shadow tabular-nums">
              {displayedLikeCount}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={handleSaveToggle}
          className="pointer-events-auto flex flex-col items-center gap-1 active:scale-110 transition-transform"
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
          {displayedSaveCount != null ? (
            <span className="text-xs font-semibold text-white/90 drop-shadow tabular-nums">
              {displayedSaveCount}
            </span>
          ) : (
            <span className="text-[10px] font-semibold text-white/90 drop-shadow">Save</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            const started = tryNativeShareWordFromUserGesture(activeWord, {
              onFallback: () => setShareSheetOpen(true),
            })
            if (!started) setShareSheetOpen(true)
          }}
          className="pointer-events-auto flex flex-col items-center gap-1 active:scale-110 transition-transform"
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
          {displayedShareCount != null ? (
            <span className="text-xs font-semibold text-white/90 drop-shadow tabular-nums">
              {displayedShareCount}
            </span>
          ) : (
            <span className="text-[10px] font-semibold text-white/90 drop-shadow">Share</span>
          )}
        </button>
      </div>
      ) : null}

      <ShareWordSheet
        open={shareSheetOpen}
        word={shareSheetOpen ? activeWord : null}
        onClose={() => setShareSheetOpen(false)}
      />
    </motion.div>
  )
}
