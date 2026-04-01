import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  CLOUD_PROFILE_SAVED_EVENT,
  getAuthEmail,
  getProfileUploadDoneUserId,
  PERSISTED_STATE_REPLACED_EVENT,
  setLastUsedAccountEmail,
} from '../lib/accountSync'
import { APP_EVENT, logAppEvent } from '../lib/appEvents'
import { ensureCc1Sequence, filterCc1WordsByQuota, getAvailableQuota } from '../lib/characterSequence'
import { getCc1WordIds } from '../lib/conversionUnlock'
import { getActivatedDecks, getSupabaseClient } from '../lib/deckService'
import { loadPersistedState, type AppMeta } from '../lib/storage'
import { ACTIVATED_DECKS_CHANGED_EVENT, buildHomeFeedWords } from '../lib/deckWords'
import { getWordContentKind } from '../lib/wordContentKind'
import { sortWordsByCubeTier } from '../lib/cubeVaultSort'
import type { WordMetadata, WordState } from '../lib/types'
import {
  ENGAGEMENT_LOCAL_CHANGED_EVENT,
  getLocalLikedWordIds,
  getLocalReceivedWordIds,
  getLocalSavedWordIds,
  getLocalSharedWordIds,
} from '../lib/engagementService'
import { youtubePosterUrlForWord } from '../lib/wordVideoThumb'
import { CubeVaultGrid } from './CubeVaultGrid'
import { EngagementWordPlayer } from './EngagementWordPlayer'
import { GrammarColorsMontessoriPage } from './GrammarColorsMontessoriPage'
import { getProfileDisplayName, getProfileLabelFromAuthEmail } from '../lib/profileDisplayName'

type Category = 'mastered' | 'inProgress' | 'new'
type ContentKind = 'character' | 'vocabulary' | 'grammar'

type ActiveList = { kind: ContentKind; category: Category }

type EngageTab = 'shared' | 'received' | 'saved' | 'liked'

const ENGAGE_TAB_ORDER: EngageTab[] = ['shared', 'received', 'saved', 'liked']

const ENGAGE_TAB_LABEL: Record<EngageTab, string> = {
  shared: 'Shared',
  received: 'Received',
  saved: 'Saved',
  liked: 'Liked',
}

const ENGAGE_EMPTY: Record<EngageTab, string> = {
  shared: 'Nothing shared yet — tap Share on a card in the feed.',
  received: 'Nothing here yet — open a gift link someone sent you, or sign in on this device to sync received clips.',
  saved: 'Nothing saved yet — tap Save on a card in the feed.',
  liked: 'No likes yet — tap the heart on a card in the feed.',
}

const ACTIVE_TAB = 'text-white'
const INACTIVE_TAB = 'text-white/45'

function resolveWordsByIds(ids: string[], feed: WordMetadata[]): WordMetadata[] {
  const byId = new Map(feed.map((w) => [w.word_id, w]))
  return ids.map((id) => byId.get(id)).filter((w): w is WordMetadata => Boolean(w))
}

type Bucketed = {
  stats: { total: number; mastered: number; inProgress: number; unseen: number }
  wordsByCategory: Record<Category, WordMetadata[]>
}

/** Aligns with vault cubes: Solid tier (mScore ≥ 5) or gold latch counts as mastered in lists. */
function bucketByProgress(
  words: WordMetadata[],
  wordStates: Record<string, WordState | undefined>,
): Bucketed {
  const mastered: WordMetadata[] = []
  const inProgress: WordMetadata[] = []
  const unseen: WordMetadata[] = []

  for (const w of words) {
    const st = wordStates[w.word_id]
    if (!st || st.sessionsSeen === 0) {
      unseen.push(w)
    } else if (st.masteryConfirmed || st.mScore >= 5) {
      mastered.push(w)
    } else {
      inProgress.push(w)
    }
  }

  return {
    stats: {
      total: words.length,
      mastered: mastered.length,
      inProgress: inProgress.length,
      unseen: unseen.length,
    },
    wordsByCategory: { mastered, inProgress, new: unseen },
  }
}

function ProgressRing({
  progress,
  size = 120,
  strokeWidth = 10,
}: {
  progress: number
  size?: number
  strokeWidth?: number
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - Math.min(1, Math.max(0, progress)))

  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="url(#profileProgressGrad)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="transition-all duration-700"
      />
      <defs>
        <linearGradient id="profileProgressGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#c084fc" />
        </linearGradient>
      </defs>
    </svg>
  )
}

const categoryMeta: Record<Category, { label: string; color: string }> = {
  mastered: { label: 'Mastered', color: 'text-green-400' },
  inProgress: { label: 'In Progress', color: 'text-yellow-400' },
  new: { label: 'New', color: 'text-indigo-400' },
}

const scopeTitle: Record<ContentKind, string> = {
  character: 'Characters',
  vocabulary: 'Vocabularies',
  grammar: 'Grammar',
}

function WordListView({
  scopeKind,
  category,
  words,
  wordStates,
  onBack,
  onPickWord,
}: {
  scopeKind: ContentKind
  category: Category
  words: WordMetadata[]
  wordStates: Record<string, WordState | undefined>
  onBack: () => void
  onPickWord: (w: WordMetadata) => void
}) {
  const meta = categoryMeta[category]
  const scope = scopeTitle[scopeKind]
  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'tween', duration: 0.25 }}
      className="absolute inset-0 z-[48] flex h-dvh flex-col bg-black"
    >
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/10 bg-black/80 px-5 py-3 backdrop-blur-xl">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-white/60 transition-colors active:text-white"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <h2 className={`text-base font-bold ${meta.color}`}>
          {scope} · {meta.label} ({words.length})
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-20 pt-3">
        {words.length === 0 ? (
          <p className="mt-6 text-sm text-white/40">No items in this category yet.</p>
        ) : (
          <CubeVaultGrid words={words} wordStates={wordStates} onPickWord={onPickWord} />
        )}
      </div>
    </motion.div>
  )
}

function StatCard({
  label,
  value,
  color,
  tag,
  onClick,
}: {
  label: string
  value: number
  color: string
  tag?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}, ${value} items`}
      className="rounded-xl border border-white/10 bg-white/5 px-3 py-4 text-center transition-transform active:scale-95"
    >
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      {tag ? (
        <div className="mt-2 flex justify-center">
          <span className="rounded-lg bg-indigo-500/35 px-3 py-1.5 text-sm font-bold tracking-wide text-indigo-100">
            New
          </span>
        </div>
      ) : (
        <>
          <div className="mt-1 text-[10px] uppercase tracking-wider text-white/50">{label}</div>
          <div className="mt-1.5 text-[9px] text-white/30">View list</div>
        </>
      )}
    </button>
  )
}

/** Wireframe: three columns; tap opens full learning progress (bottom sheet). */
function ProfileProgressStatsRow({
  streak,
  activeDays,
  charactersMastered,
  onOpenProgress,
}: {
  streak: number
  activeDays: number
  charactersMastered: number
  onOpenProgress: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpenProgress}
      className="mt-4 w-full rounded-2xl bg-white/[0.04] px-1 py-3 text-left transition-colors active:bg-white/[0.07]"
      aria-label="Open learning progress — streak, active days, and mastered"
    >
      <div className="grid grid-cols-3 gap-1">
        <div className="text-center">
          <div className="text-lg font-semibold tabular-nums leading-none tracking-tight text-white">{streak}</div>
          <div className="mt-1.5 px-0.5 text-[9px] font-normal uppercase tracking-wide text-white/45">
            {streak === 1 ? 'Day streak' : 'Days streak'}
          </div>
        </div>
        <div className="text-center">
          <div className="text-lg font-semibold tabular-nums leading-none tracking-tight text-white">{activeDays}</div>
          <div className="mt-1.5 px-0.5 text-[9px] font-normal uppercase tracking-wide text-white/45">
            Active days
          </div>
        </div>
        <div className="text-center">
          <div className="text-lg font-semibold tabular-nums leading-none tracking-tight text-white">{charactersMastered}</div>
          <div className="mt-1.5 px-0.5 text-[9px] font-normal uppercase tracking-wide text-white/45">
            Mastered
          </div>
        </div>
      </div>
    </button>
  )
}

function CategoryStrip({
  bucket,
  onPick,
}: {
  bucket: Bucketed
  onPick: (c: Category) => void
}) {
  const s = bucket.stats
  return (
    <div className="mt-3 grid grid-cols-3 gap-3">
      <StatCard
        label="Mastered"
        value={s.mastered}
        color="text-green-400"
        onClick={() => onPick('mastered')}
      />
      <StatCard
        label="In Progress"
        value={s.inProgress}
        color="text-yellow-400"
        onClick={() => onPick('inProgress')}
      />
      <StatCard
        label="New"
        value={s.unseen}
        color="text-indigo-400"
        tag
        onClick={() => onPick('new')}
      />
    </div>
  )
}

function IconShared({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" />
    </svg>
  )
}

function IconInbox({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
      <polyline points="22 6 12 13 2 6" />
    </svg>
  )
}

function IconSaved({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 4h12a2 2 0 0 1 2 2v14l-8-4-8 4V6a2 2 0 0 1 2-2z" />
    </svg>
  )
}

function IconLiked({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}

const TAB_ICONS: Record<EngageTab, React.FC<{ className?: string }>> = {
  shared: IconShared,
  received: IconInbox,
  saved: IconSaved,
  liked: IconLiked,
}

/** Bottom nav uses 24×24 SVGs; profile engagement row stays a notch smaller. */
const ENGAGE_ICON_PX = 'h-5 w-5'

function EngageTabBar({ active, onChange }: { active: EngageTab; onChange: (t: EngageTab) => void }) {
  return (
    <div className="flex w-full border-b border-white/10">
      {ENGAGE_TAB_ORDER.map((tab) => {
        const Icon = TAB_ICONS[tab]
        const isOn = active === tab
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onChange(tab)}
            aria-pressed={isOn}
            aria-label={ENGAGE_TAB_LABEL[tab]}
            className={`flex flex-1 flex-col items-center justify-center py-2.5 transition-colors ${
              isOn ? ACTIVE_TAB : INACTIVE_TAB
            }`}
          >
            <Icon className={ENGAGE_ICON_PX} />
          </button>
        )
      })}
    </div>
  )
}

/** TikTok-style vertical thumb: 9:16 inside caller’s box. */
function ProfileThumbFill({ word, className }: { word: WordMetadata; className?: string }) {
  const src = useMemo(() => youtubePosterUrlForWord(word), [word])
  const [bad, setBad] = useState(false)
  const showImg = Boolean(src && !bad)

  return (
    <div className={`relative overflow-hidden bg-zinc-900 ${className ?? ''}`}>
      {showImg ? (
        <img
          src={src!}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setBad(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-600/45 to-purple-900/55">
          <span className="text-center text-lg font-bold leading-tight text-white sm:text-xl">{word.character}</span>
        </div>
      )}
    </div>
  )
}

export default function ProfileTab() {
  const [engageTab, setEngageTab] = useState<EngageTab>('shared')
  const [statsSheetOpen, setStatsSheetOpen] = useState(false)
  const [montessoriGrammarOpen, setMontessoriGrammarOpen] = useState(false)
  const [grammarVault, setGrammarVault] = useState<{
    word: WordMetadata
    browseList: WordMetadata[]
  } | null>(null)
  const [activeList, setActiveList] = useState<ActiveList | null>(null)
  const [listFocusWord, setListFocusWord] = useState<WordMetadata | null>(null)
  const [engageFocusWord, setEngageFocusWord] = useState<WordMetadata | null>(null)
  const [feedWordList, setFeedWordList] = useState<WordMetadata[]>(() => buildHomeFeedWords([]))
  const [engagementRev, setEngagementRev] = useState(0)
  const [storageRev, setStorageRev] = useState(0)
  const [authEmail, setAuthEmail] = useState<string | null>(null)
  const [authUserId, setAuthUserId] = useState<string | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  /** Re-render account badge after `setProfileUploadDoneUserId` (e.g. feed upload). */
  const [cloudBadgeRev, setCloudBadgeRev] = useState(0)

  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      void getActivatedDecks().then((decks) => {
        if (cancelled) return
        setFeedWordList(buildHomeFeedWords(decks))
      })
    }
    refresh()
    window.addEventListener(ACTIVATED_DECKS_CHANGED_EVENT, refresh)
    return () => {
      cancelled = true
      window.removeEventListener(ACTIVATED_DECKS_CHANGED_EVENT, refresh)
    }
  }, [])

  useEffect(() => {
    const bump = () => setEngagementRev((n) => n + 1)
    window.addEventListener(ENGAGEMENT_LOCAL_CHANGED_EVENT, bump)
    return () => window.removeEventListener(ENGAGEMENT_LOCAL_CHANGED_EVENT, bump)
  }, [])

  useEffect(() => {
    const bump = () => setStorageRev((n) => n + 1)
    window.addEventListener(PERSISTED_STATE_REPLACED_EVENT, bump)
    return () => window.removeEventListener(PERSISTED_STATE_REPLACED_EVENT, bump)
  }, [])

  useEffect(() => {
    const client = getSupabaseClient()
    if (!client) {
      setAuthEmail(null)
      setAuthUserId(null)
      setAuthChecked(true)
      return
    }
    void getAuthEmail().then((email) => {
      setAuthEmail(email)
      setAuthChecked(true)
    })
    void client.auth.getSession().then(({ data: { session } }) => {
      setAuthUserId(session?.user?.id ?? null)
    })
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      const em = session?.user?.email ?? null
      setAuthEmail(em)
      setAuthUserId(session?.user?.id ?? null)
      if (em) {
        setLastUsedAccountEmail(em)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const bump = () => setCloudBadgeRev((n) => n + 1)
    window.addEventListener(CLOUD_PROFILE_SAVED_EVENT, bump)
    return () => window.removeEventListener(CLOUD_PROFILE_SAVED_EVENT, bump)
  }, [])

  /** Signed-in: show email local part (before @); otherwise stored / Learner-xxxx. */
  const profileDisplayLabel = useMemo(() => {
    const fromEmail = getProfileLabelFromAuthEmail(authEmail)
    if (fromEmail) return fromEmail
    return getProfileDisplayName()
  }, [authEmail, storageRev])

  const persisted = useMemo(() => loadPersistedState(), [storageRev, engagementRev])
  const cc1WordIds = useMemo(() => getCc1WordIds(), [])
  const cc1Sequence = useMemo(() => ensureCc1Sequence(cc1WordIds), [cc1WordIds])
  const [profileInviteCopied, setProfileInviteCopied] = useState(false)

  const handleProfileInvite = useCallback(async () => {
    const code = persisted.meta.referralCode?.trim()
    const url = code
      ? `${window.location.origin}/?ref=${encodeURIComponent(code)}`
      : window.location.origin + '/'
    const shareData = {
      url,
      title: 'Learn Chinese with me',
      text: "I've been learning Chinese on ChineseFlash \u2014 you get 10 free cards when you join.",
    }
    logAppEvent(APP_EVENT.INVITE_LINK_COPIED, { method: 'profile_page' })
    if (navigator.share && navigator.canShare?.(shareData)) {
      try {
        await navigator.share(shareData)
        return
      } catch {
        /* fall through to clipboard */
      }
    }
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      try {
        const ta = document.createElement('textarea')
        ta.value = url
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
    setProfileInviteCopied(true)
    window.setTimeout(() => setProfileInviteCopied(false), 2000)
  }, [persisted.meta.referralCode])
  const ws = persisted.wordStates

  // Build a quota-filtered word list for Progress stats and Word Types.
  // Only CC1 free-deck characters are filtered; purchased deck words are unaffected.
  const statsFeedWordList = useMemo(() => {
    const availableQuota = getAvailableQuota(persisted.meta)
    const cc1IdSet = new Set(cc1WordIds)
    const cc1Words = feedWordList.filter((w) => cc1IdSet.has(w.word_id))
    const nonCc1Words = feedWordList.filter((w) => !cc1IdSet.has(w.word_id))
    const filteredCc1 = filterCc1WordsByQuota(cc1Words, cc1Sequence, availableQuota, ws)
    return [...filteredCc1, ...nonCc1Words]
  }, [feedWordList, cc1WordIds, cc1Sequence, persisted.meta, ws])

  const charWords = statsFeedWordList.filter((w) => getWordContentKind(w) === 'character')
  const vocabWords = statsFeedWordList.filter((w) => getWordContentKind(w) === 'vocabulary')
  const grammarWords = statsFeedWordList.filter((w) => getWordContentKind(w) === 'grammar')
  const byKind = {
    character: bucketByProgress(charWords, ws),
    vocabulary: bucketByProgress(vocabWords, ws),
    grammar: bucketByProgress(grammarWords, ws),
  }

  const char = byKind.character
  const totalMasteredAll =
    byKind.character.stats.mastered +
    byKind.vocabulary.stats.mastered +
    byKind.grammar.stats.mastered
  const totalWordsAll =
    byKind.character.stats.total + byKind.vocabulary.stats.total + byKind.grammar.stats.total
  const overallProgress = totalWordsAll > 0 ? totalMasteredAll / totalWordsAll : 0
  const overallPct = Math.round(overallProgress * 100)

  const listWords =
    activeList === null
      ? []
      : sortWordsByCubeTier(byKind[activeList.kind].wordsByCategory[activeList.category], ws)

  const savedWords = useMemo(
    () => resolveWordsByIds(getLocalSavedWordIds(), feedWordList),
    [feedWordList, engagementRev],
  )
  const likedWords = useMemo(
    () => resolveWordsByIds(getLocalLikedWordIds(), feedWordList),
    [feedWordList, engagementRev],
  )
  const sharedWords = useMemo(
    () => resolveWordsByIds(getLocalSharedWordIds(), feedWordList),
    [feedWordList, engagementRev],
  )
  const receivedWords = useMemo(
    () => resolveWordsByIds(getLocalReceivedWordIds(), feedWordList),
    [feedWordList, engagementRev],
  )

  const currentEngageWords = useMemo(() => {
    switch (engageTab) {
      case 'shared':
        return sharedWords
      case 'received':
        return receivedWords
      case 'saved':
        return savedWords
      case 'liked':
        return likedWords
      default:
        return sharedWords
    }
  }, [engageTab, sharedWords, receivedWords, savedWords, likedWords])

  const openCategory = (kind: ContentKind, category: Category) => {
    setListFocusWord(null)
    setStatsSheetOpen(false)
    setActiveList({ kind, category })
  }

  const sheetTransition = { type: 'tween' as const, duration: 0.32, ease: [0.32, 0.72, 0, 1] as const }

  const engageSwipeStartRef = useRef<{ x: number; y: number } | null>(null)

  const onEngageAreaTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return
    const t = e.touches[0]
    engageSwipeStartRef.current = { x: t.clientX, y: t.clientY }
  }, [])

  const onEngageAreaTouchCancel = useCallback(() => {
    engageSwipeStartRef.current = null
  }, [])

  const onEngageAreaTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const start = engageSwipeStartRef.current
      engageSwipeStartRef.current = null
      if (!start || e.changedTouches.length !== 1) return
      const t = e.changedTouches[0]
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y
      const absDx = Math.abs(dx)
      const absDy = Math.abs(dy)
      const minTravel = 52
      if (absDx < minTravel || absDx < absDy * 1.15) return

      const idx = ENGAGE_TAB_ORDER.indexOf(engageTab)
      if (dx < 0 && idx < ENGAGE_TAB_ORDER.length - 1) {
        setEngageTab(ENGAGE_TAB_ORDER[idx + 1])
      } else if (dx > 0 && idx > 0) {
        setEngageTab(ENGAGE_TAB_ORDER[idx - 1])
      }
    },
    [engageTab],
  )

  const supabaseConfigured = Boolean(getSupabaseClient())

  const accountCloudStatusLabel = useMemo(() => {
    if (!authUserId || !supabaseConfigured) return null
    return getProfileUploadDoneUserId() === authUserId ? 'Synced' : 'Up to date'
  }, [authUserId, supabaseConfigured, cloudBadgeRev])

  const streakDays = persisted.meta.currentStreak ?? 0
  const activeDaysCount = persisted.meta.totalDaysActive ?? 0
  const charactersMasteredCount = char.stats.mastered

  return (
    <div className="relative z-10 mx-auto flex h-dvh w-full flex-col overflow-hidden bg-black md:w-[min(100vw,calc(100dvh*9/16))]">
      <header className="shrink-0 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {!authChecked && supabaseConfigured ? (
          <p className="text-sm text-white/50">Checking account…</p>
        ) : !supabaseConfigured ? (
          <p className="text-sm text-white/50">Cloud backup is not configured in this build.</p>
        ) : null}

        <div
          className={`flex flex-col items-center ${
            !authChecked && supabaseConfigured ? 'mt-4' : !supabaseConfigured ? 'mt-4' : 'mt-1'
          }`}
        >
          <div
            className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-2xl font-semibold text-white shadow-lg ring-2 ring-white/10"
            aria-hidden
          >
            {profileDisplayLabel.charAt(0).toUpperCase()}
          </div>
          <h1 className="mt-2.5 max-w-full truncate px-1 text-center text-base font-semibold tracking-tight text-white">
            {profileDisplayLabel}
          </h1>
          {authChecked && authEmail ? (
            <div className="mt-1.5 flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 px-1">
              <span className="text-center text-xs text-white/55" title={authEmail}>
                {authEmail}
              </span>
              {accountCloudStatusLabel ? (
                <span className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-medium text-emerald-200/90">
                  {accountCloudStatusLabel}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Invite a friend */}
        <div className="mt-3 flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={() => void handleProfileInvite()}
            className="w-full max-w-[16rem] rounded-2xl bg-black py-2.5 text-sm font-semibold text-white ring-1 ring-white/15 shadow-[0_4px_20px_rgba(0,0,0,0.45)] transition-all hover:bg-zinc-900 active:scale-[0.98] active:opacity-90"
          >
            {profileInviteCopied ? 'Link copied!' : 'Invite a friend'}
          </button>
          {persisted.meta.referralCode?.trim() ? (
            <p className="text-[11px] text-white/35">
              Your code: {persisted.meta.referralCode.trim().toUpperCase()}
            </p>
          ) : null}
          {persisted.meta.bonusCardsUnlocked && persisted.meta.bonusCardsUnlocked > 0 && persisted.meta.referredByUserId?.trim() ? (
            <p className="text-[11px] text-white/35">
              {persisted.meta.bonusCardsUnlocked} bonus characters from a friend&apos;s invite
            </p>
          ) : null}
        </div>

        <ProfileProgressStatsRow
          streak={streakDays}
          activeDays={activeDaysCount}
          charactersMastered={charactersMasteredCount}
          onOpenProgress={() => setStatsSheetOpen(true)}
        />

        <div className="mt-5">
          <EngageTabBar active={engageTab} onChange={setEngageTab} />
        </div>
      </header>

      <div
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-[max(5rem,calc(4.5rem+env(safe-area-inset-bottom,0px)))] pt-2"
        onTouchStart={onEngageAreaTouchStart}
        onTouchEnd={onEngageAreaTouchEnd}
        onTouchCancel={onEngageAreaTouchCancel}
      >
        {currentEngageWords.length === 0 ? (
          <p className="mt-10 px-3 text-center text-sm leading-relaxed text-white/40">
            {ENGAGE_EMPTY[engageTab]}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
            {currentEngageWords.map((w) => (
              <button
                key={w.word_id}
                type="button"
                onClick={() => setEngageFocusWord(w)}
                className="aspect-[9/16] w-full overflow-hidden rounded-md bg-zinc-900 active:opacity-90"
              >
                <ProfileThumbFill word={w} className="h-full w-full" />
              </button>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {statsSheetOpen ? (
          <motion.div
            key="stats-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[40] bg-black/65"
            onClick={() => setStatsSheetOpen(false)}
            aria-hidden
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {statsSheetOpen ? (
          <motion.div
            key="stats-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-stats-title"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={sheetTransition}
            className="fixed inset-x-0 bottom-0 z-[41] flex max-h-[85vh] flex-col rounded-t-3xl border border-white/10 border-b-0 bg-zinc-950 shadow-[0_-12px_40px_rgba(0,0,0,0.55)]"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 flex-col items-center pt-2 pb-1">
              <div className="h-1 w-10 rounded-full bg-white/20" />
              <div className="mt-3 flex w-full items-center justify-between px-5">
                <h2 id="profile-stats-title" className="text-base font-bold text-white">
                  Learning progress
                </h2>
                <button
                  type="button"
                  onClick={() => setStatsSheetOpen(false)}
                  className="rounded-full px-3 py-1.5 text-sm font-medium text-white/60 transition-colors active:bg-white/10 active:text-white"
                >
                  Done
                </button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6">
                {authChecked && supabaseConfigured && !authEmail ? (
                  <div className="mb-4 mt-1 rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-white/50">Cloud backup</p>
                    <p className="mt-2 text-sm leading-relaxed text-white/72">
                      Sign in from the Home tab to sync progress across devices and keep your Library in step.
                    </p>
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={() => setMontessoriGrammarOpen(true)}
                  className="mb-6 flex w-full items-center gap-3 rounded-2xl border border-violet-500/35 bg-violet-500/10 px-4 py-3 text-left transition-colors active:bg-violet-500/20"
                  aria-label="Word types in Chinese. Opens list and tiles."
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/25"
                    aria-hidden
                  >
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden>
                      <circle cx="8" cy="10" r="3.5" fill="#a855f7" fillOpacity="0.9" />
                      <circle cx="15" cy="8" r="3" fill="#22c55e" fillOpacity="0.85" />
                      <circle cx="14" cy="15" r="2.8" fill="#ef4444" fillOpacity="0.85" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold uppercase tracking-wider text-violet-200/80">
                      Word types
                    </div>
                    <div className="mt-0.5 text-sm font-semibold text-white">Nouns, verbs &amp; more in Chinese</div>
                    <div className="mt-0.5 text-[11px] leading-snug text-white/50">
                      Short meanings + colored tiles — tap here
                    </div>
                  </div>
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="shrink-0 text-violet-300/70"
                    aria-hidden
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>

                <div className="flex flex-col items-center pt-2">
                <div className="relative">
                  <ProgressRing progress={overallProgress} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold">{overallPct}%</span>
                    <span className="text-[10px] text-white/50">mastered</span>
                  </div>
                </div>
                </div>

                <div className="mt-8">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-white/55">Characters</h3>
                <CategoryStrip bucket={char} onPick={(c) => openCategory('character', c)} />
                <p className="mt-2 text-center text-xs text-white/35">{char.stats.total} characters</p>
              </div>

              <div className="mt-8">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-white/55">Vocabularies</h3>
                <CategoryStrip
                  bucket={byKind.vocabulary}
                  onPick={(c) => openCategory('vocabulary', c)}
                />
                <p className="mt-2 text-center text-xs text-white/35">
                  {byKind.vocabulary.stats.total} vocabulary items
                </p>
              </div>

              <div className="mt-8">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-white/55">Grammar</h3>
                <CategoryStrip bucket={byKind.grammar} onPick={(c) => openCategory('grammar', c)} />
                <p className="mt-2 text-center text-xs text-white/35">
                  {byKind.grammar.stats.total} grammar items
                </p>
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {montessoriGrammarOpen ? (
          <GrammarColorsMontessoriPage
            key="montessori-grammar"
            feedWordList={statsFeedWordList}
            wordStates={ws}
            onPickVaultWord={(word, browseList) => setGrammarVault({ word, browseList })}
            onBack={() => {
              setGrammarVault(null)
              setMontessoriGrammarOpen(false)
            }}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {activeList && (
          <WordListView
            key={`${activeList.kind}-${activeList.category}`}
            scopeKind={activeList.kind}
            category={activeList.category}
            words={listWords}
            wordStates={ws}
            onBack={() => {
              setListFocusWord(null)
              setActiveList(null)
              setStatsSheetOpen(true)
            }}
            onPickWord={(w) => setListFocusWord(w)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {engageFocusWord && (
          <EngagementWordPlayer
            key={engageFocusWord.word_id}
            word={engageFocusWord}
            onBack={() => setEngageFocusWord(null)}
            respectAnonymousSwipeCap={supabaseConfigured}
            isSignedIn={Boolean(authEmail)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {listFocusWord && activeList ? (
          <EngagementWordPlayer
            key={`vault-${activeList.kind}-${activeList.category}-${listFocusWord.word_id}`}
            word={listFocusWord}
            browseWordList={listWords}
            disableSrsScoring
            onBack={() => setListFocusWord(null)}
            respectAnonymousSwipeCap={false}
            isSignedIn={Boolean(authEmail)}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {grammarVault ? (
          <div key={`grammar-vault-wrap-${grammarVault.word.word_id}`} className="fixed inset-0 z-[70]">
            <EngagementWordPlayer
              key={`grammar-vault-${grammarVault.word.word_id}`}
              word={grammarVault.word}
              browseWordList={grammarVault.browseList}
              disableSrsScoring
              onBack={() => setGrammarVault(null)}
              respectAnonymousSwipeCap={false}
              isSignedIn={Boolean(authEmail)}
            />
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
