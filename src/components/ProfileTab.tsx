import React, { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { loadPersistedState } from '../lib/storage'
import { words as wordDataset } from '../data/words'
import type { WordMetadata } from '../lib/types'

const NAME_KEY = 'tiktokchinese_display_name'

type Category = 'mastered' | 'inProgress' | 'new'
type ContentKind = 'character' | 'vocabulary' | 'grammar'

type ActiveList = { kind: ContentKind; category: Category }

function getOrCreateName(): string {
  let name = localStorage.getItem(NAME_KEY)
  if (!name) {
    const suffix = Math.floor(1000 + Math.random() * 9000)
    name = `Learner-${suffix}`
    localStorage.setItem(NAME_KEY, name)
  }
  return name
}

function getContentKind(w: WordMetadata): ContentKind {
  return w.content_type ?? 'character'
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
}: {
  scopeKind: ContentKind
  category: Category
  words: WordMetadata[]
  onBack: () => void
}) {
  const meta = categoryMeta[category]
  const scope = scopeTitle[scopeKind]
  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'tween', duration: 0.25 }}
      className="absolute inset-0 z-10 flex h-dvh flex-col bg-black"
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
              <div
                key={w.word_id}
                className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
              >
                <div className="w-12 shrink-0 text-center text-2xl font-bold">{w.character}</div>
                <div className="min-w-0">
                  <div className="text-sm text-white/60">{w.pinyin}</div>
                  <div className="truncate text-sm">{w.l1_meanings.en ?? ''}</div>
                </div>
              </div>
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
      className="rounded-xl border border-white/10 bg-white/5 px-3 py-4 text-center transition-transform active:scale-95"
    >
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wider text-white/50">
        {label}
        {tag && (
          <span className="ml-1 rounded bg-indigo-500/20 px-1 py-0.5 text-indigo-300">new</span>
        )}
      </div>
      <div className="mt-1.5 text-[9px] text-white/30">View list</div>
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

export default function ProfileTab() {
  const displayName = useMemo(() => getOrCreateName(), [])
  const [activeList, setActiveList] = useState<ActiveList | null>(null)

  const persisted = loadPersistedState()
  const ws = persisted.wordStates
  const charWords = wordDataset.filter((w) => getContentKind(w) === 'character')
  const vocabWords = wordDataset.filter((w) => getContentKind(w) === 'vocabulary')
  const grammarWords = wordDataset.filter((w) => getContentKind(w) === 'grammar')
  const byKind = {
    character: bucketByProgress(charWords, ws),
    vocabulary: bucketByProgress(vocabWords, ws),
    grammar: bucketByProgress(grammarWords, ws),
  }

  const char = byKind.character
  const charProgress = char.stats.total > 0 ? char.stats.mastered / char.stats.total : 0
  const charPct = Math.round(charProgress * 100)

  const listWords =
    activeList === null ? [] : byKind[activeList.kind].wordsByCategory[activeList.category]

  return (
    <div className="relative z-10 h-dvh overflow-hidden bg-black">
      <div className="h-full overflow-y-auto px-5 pb-20 pt-4">
        <div className="flex flex-col items-center pt-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-3xl font-bold shadow-lg">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <h1 className="mt-3 text-lg font-bold">{displayName}</h1>
          <p className="text-xs text-white/50">Local profile</p>
        </div>

        {/* Characters */}
        <div className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">Characters</h2>
          <div className="mt-4 flex flex-col items-center">
            <div className="relative">
              <ProgressRing progress={charProgress} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold">{charPct}%</span>
                <span className="text-[10px] text-white/50">mastered</span>
              </div>
            </div>
          </div>
          <CategoryStrip
            bucket={char}
            onPick={(category) => setActiveList({ kind: 'character', category })}
          />
          <p className="mt-2 text-center text-xs text-white/40">{char.stats.total} characters</p>
        </div>

        {/* Vocabularies */}
        <div className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">Vocabularies</h2>
          <CategoryStrip
            bucket={byKind.vocabulary}
            onPick={(category) => setActiveList({ kind: 'vocabulary', category })}
          />
          <p className="mt-2 text-center text-xs text-white/40">
            {byKind.vocabulary.stats.total} vocabulary items
          </p>
        </div>

        {/* Grammar */}
        <div className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">Grammar</h2>
          <CategoryStrip
            bucket={byKind.grammar}
            onPick={(category) => setActiveList({ kind: 'grammar', category })}
          />
          <p className="mt-2 text-center text-xs text-white/40">
            {byKind.grammar.stats.total} grammar items
          </p>
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-white/50">How swipes work</h2>
          <ul className="mt-2 space-y-2 text-sm text-white/80">
            <li>
              <span className="font-medium text-green-300/90">Know it</span>
              <span className="text-white/55"> — swipe </span>
              <span className="text-white/90">right</span>
              <span className="text-white/55">. The app treats that as “I know this word.”</span>
            </li>
            <li>
              <span className="font-medium text-orange-300/90">Not now</span>
              <span className="text-white/55"> — swipe </span>
              <span className="text-white/90">left</span>
              <span className="text-white/55">
                {' '}
                if it feels too hard, you are not interested, or you want to skip for now.
              </span>
            </li>
          </ul>
        </div>
      </div>

      <AnimatePresence>
        {activeList && (
          <WordListView
            key={`${activeList.kind}-${activeList.category}`}
            scopeKind={activeList.kind}
            category={activeList.category}
            words={listWords}
            onBack={() => setActiveList(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
