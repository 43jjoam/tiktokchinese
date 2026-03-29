import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  CLOUD_PROFILE_SAVED_EVENT,
  getAuthEmail,
  PERSISTED_STATE_REPLACED_EVENT,
  setLastUsedAccountEmail,
  setProfileUploadDoneUserId,
  uploadLearningProfileWithLocalMeta,
} from '../lib/accountSync'
import { getActivatedDecks, getSupabaseClient } from '../lib/deckService'
import { loadPersistedState } from '../lib/storage'
import { ACTIVATED_DECKS_CHANGED_EVENT, buildHomeFeedWords } from '../lib/deckWords'
import { getWordContentKind } from '../lib/wordContentKind'
import type { WordMetadata } from '../lib/types'
import {
  ENGAGEMENT_LOCAL_CHANGED_EVENT,
  getLocalLikedWordIds,
  getLocalReceivedWordIds,
  getLocalSavedWordIds,
  getLocalSharedWordIds,
} from '../lib/engagementService'
import { youtubePosterUrlForWord } from '../lib/wordVideoThumb'
import { EngagementWordPlayer } from './EngagementWordPlayer'

const NAME_KEY = 'tiktokchinese_display_name'

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
  received: 'Nothing here yet — clips others share with you will appear when available.',
  saved: 'Nothing saved yet — tap Save on a card in the feed.',
  liked: 'No likes yet — tap the heart on a card in the feed.',
}

const ACTIVE_TAB = 'text-white'
const INACTIVE_TAB = 'text-white/45'

function getOrCreateName(): string {
  let name = localStorage.getItem(NAME_KEY)
  if (!name) {
    const suffix = Math.floor(1000 + Math.random() * 9000)
    name = `Learner-${suffix}`
    localStorage.setItem(NAME_KEY, name)
  }
  return name
}

function resolveWordsByIds(ids: string[], feed: WordMetadata[]): WordMetadata[] {
  const byId = new Map(feed.map((w) => [w.word_id, w]))
  return ids.map((id) => byId.get(id)).filter((w): w is WordMetadata => Boolean(w))
}

type Bucketed = {
  stats: { total: number; mastered: number; inProgress: number; unseen: number }
  wordsByCategory: Record<Category, WordMetadata[]>
}

function bucketByProgress(
  words: WordMetadata[],
  wordStates: Record<string, { sessionsSeen: number; masteryConfirmed: boolean }>,
): Bucketed {
  const mastered: WordMetadata[] = []
  const inProgress: WordMetadata[] = []
  const unseen: WordMetadata[] = []

  for (const w of words) {
    const st = wordStates[w.word_id]
    if (!st || st.sessionsSeen === 0) {
      unseen.push(w)
    } else if (st.masteryConfirmed) {
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
  onBack,
  onPickWord,
}: {
  scopeKind: ContentKind
  category: Category
  words: WordMetadata[]
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
          <div className="space-y-2">
            {words.map((w) => (
              <button
                key={w.word_id}
                type="button"
                onClick={() => onPickWord(w)}
                className="flex w-full items-center gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left transition-colors active:bg-white/10"
              >
                <div className="w-12 shrink-0 text-center text-2xl font-bold">{w.character}</div>
                <div className="min-w-0">
                  <div className="text-sm text-white/60">{w.pinyin}</div>
                  <div className="truncate text-sm">{w.l1_meanings.en ?? ''}</div>
                </div>
              </button>
            ))}
          </div>
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
  const displayName = useMemo(() => getOrCreateName(), [])
  const [engageTab, setEngageTab] = useState<EngageTab>('shared')
  const [statsSheetOpen, setStatsSheetOpen] = useState(false)
  const [activeList, setActiveList] = useState<ActiveList | null>(null)
  const [listFocusWord, setListFocusWord] = useState<WordMetadata | null>(null)
  const [engageFocusWord, setEngageFocusWord] = useState<WordMetadata | null>(null)
  const [feedWordList, setFeedWordList] = useState<WordMetadata[]>(() => buildHomeFeedWords([]))
  const [engagementRev, setEngagementRev] = useState(0)
  const [storageRev, setStorageRev] = useState(0)
  const [authEmail, setAuthEmail] = useState<string | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [syncHint, setSyncHint] = useState<string | null>(null)
  const [cloudSavedBanner, setCloudSavedBanner] = useState(false)

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
    const onCloudSaved = () => {
      setCloudSavedBanner(true)
      window.setTimeout(() => setCloudSavedBanner(false), 14000)
    }
    window.addEventListener(CLOUD_PROFILE_SAVED_EVENT, onCloudSaved)
    return () => window.removeEventListener(CLOUD_PROFILE_SAVED_EVENT, onCloudSaved)
  }, [])

  useEffect(() => {
    const client = getSupabaseClient()
    if (!client) {
      setAuthEmail(null)
      setAuthChecked(true)
      return
    }
    void getAuthEmail().then((email) => {
      setAuthEmail(email)
      setAuthChecked(true)
    })
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      const em = session?.user?.email ?? null
      setAuthEmail(em)
      if (em) {
        setLastUsedAccountEmail(em)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const persisted = useMemo(() => loadPersistedState(), [storageRev, engagementRev])
  const ws = persisted.wordStates
  const charWords = feedWordList.filter((w) => getWordContentKind(w) === 'character')
  const vocabWords = feedWordList.filter((w) => getWordContentKind(w) === 'vocabulary')
  const grammarWords = feedWordList.filter((w) => getWordContentKind(w) === 'grammar')
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
    activeList === null ? [] : byKind[activeList.kind].wordsByCategory[activeList.category]

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

  const onSyncNow = useCallback(async () => {
    setSyncHint(null)
    const client = getSupabaseClient()
    const r = await uploadLearningProfileWithLocalMeta()
    if (r.ok) {
      setSyncHint('Saved to your account.')
      if (client) {
        const {
          data: { session },
        } = await client.auth.getSession()
        if (session?.user?.id) setProfileUploadDoneUserId(session.user.id)
      }
      setStorageRev((x) => x + 1)
    } else {
      setSyncHint(r.error)
    }
  }, [])

  const supabaseConfigured = Boolean(getSupabaseClient())

  return (
    <div className="relative z-10 flex h-dvh flex-col overflow-hidden bg-black">
      <header className="shrink-0 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {!authChecked && supabaseConfigured ? (
          <p className="text-sm text-white/50">Checking account…</p>
        ) : authEmail ? (
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-white/45">Account</div>
            <p className="mt-1 text-sm text-white/85">Signed in as {authEmail}</p>
            <p className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-emerald-200/90">
              <span
                className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/25 text-[11px] font-bold text-emerald-100"
                aria-hidden
              >
                ✓
              </span>
              <span>
                Cloud backup is on. Progress also updates in the background while you study — use Sync now if you want
                an immediate upload.
              </span>
            </p>
            {persisted.meta.lastMergedRemoteUpdatedAt ? (
              <p className="mt-0.5 text-[11px] text-white/40">
                Last cloud update:{' '}
                {new Date(persisted.meta.lastMergedRemoteUpdatedAt).toLocaleString(undefined, {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
              </p>
            ) : null}
            {syncHint ? <p className="mt-2 text-xs text-emerald-300/95">{syncHint}</p> : null}
            <div className="mt-3">
              <button
                type="button"
                onClick={() => void onSyncNow()}
                className="rounded-lg bg-white/15 px-3 py-2 text-xs font-semibold text-white active:bg-white/25"
              >
                Sync now
              </button>
            </div>
          </div>
        ) : supabaseConfigured ? (
          <p className="text-sm leading-relaxed text-white/55">
            Not signed in. Use <span className="font-semibold text-white/80">Sign in</span> on the learning tab (email
            magic link) to keep progress across devices.
          </p>
        ) : (
          <p className="text-sm text-white/50">Cloud backup is not configured in this build.</p>
        )}

        {cloudSavedBanner ? (
          <div
            role="status"
            aria-live="polite"
            className="mt-3 rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-3 py-3 text-sm leading-snug text-emerald-50 ring-1 ring-emerald-400/25"
          >
            <span className="font-bold text-white">You&apos;re all set.</span> Your memory profile (scores, taps, and
            progress) was just saved to your account. It will load automatically when you sign in on another device.
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setStatsSheetOpen(true)}
          className="mt-3 flex w-full flex-col items-center rounded-2xl py-2 active:bg-white/5"
          aria-label="Open learning progress"
        >
          <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-3xl font-bold shadow-lg ring-2 ring-white/10">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <h1 className="mt-2.5 text-lg font-bold text-white">{displayName}</h1>
        </button>

        <EngageTabBar active={engageTab} onChange={setEngageTab} />
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
            className="fixed inset-x-0 bottom-0 z-[41] flex max-h-[68vh] flex-col rounded-t-3xl border border-white/10 border-b-0 bg-zinc-950 shadow-[0_-12px_40px_rgba(0,0,0,0.55)]"
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

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
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
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {activeList && (
          <WordListView
            key={`${activeList.kind}-${activeList.category}`}
            scopeKind={activeList.kind}
            category={activeList.category}
            words={listWords}
            onBack={() => {
              setListFocusWord(null)
              setActiveList(null)
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
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {listFocusWord && (
          <EngagementWordPlayer
            key={`list-${listFocusWord.word_id}`}
            word={listFocusWord}
            onBack={() => setListFocusWord(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
