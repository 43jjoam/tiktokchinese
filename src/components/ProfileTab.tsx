import React, { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { loadPersistedState } from '../lib/storage'
import { words as wordDataset } from '../data/words'
import { getActivatedDecks, type DeckInfo } from '../lib/deckService'
import type { WordMetadata } from '../lib/types'

const NAME_KEY = 'tiktokchinese_display_name'

type Category = 'mastered' | 'inProgress' | 'new'

function getOrCreateName(): string {
  let name = localStorage.getItem(NAME_KEY)
  if (!name) {
    const suffix = Math.floor(1000 + Math.random() * 9000)
    name = `Learner-${suffix}`
    localStorage.setItem(NAME_KEY, name)
  }
  return name
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
        stroke="url(#progressGrad)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="transition-all duration-700"
      />
      <defs>
        <linearGradient id="progressGrad" x1="0" y1="0" x2="1" y2="1">
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

function WordListView({
  category,
  words,
  onBack,
}: {
  category: Category
  words: WordMetadata[]
  onBack: () => void
}) {
  const meta = categoryMeta[category]
  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'tween', duration: 0.25 }}
      className="absolute inset-0 z-10 flex h-dvh flex-col bg-black"
    >
      {/* Fixed header */}
      <div className="sticky top-0 z-20 flex items-center gap-3 bg-black/80 px-5 py-3 backdrop-blur-xl border-b border-white/10">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-white/60 active:text-white transition-colors"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <h2 className={`text-base font-bold ${meta.color}`}>
          {meta.label} ({words.length})
        </h2>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto px-5 pb-20 pt-3">
      {words.length === 0 ? (
        <p className="mt-6 text-sm text-white/40">No words in this category yet.</p>
      ) : (
        <div className="space-y-2">
          {words.map((w) => (
            <div
              key={w.word_id}
              className="flex items-center gap-4 rounded-xl bg-white/5 border border-white/10 px-4 py-3"
            >
              <div className="text-2xl font-bold w-12 text-center shrink-0">
                {w.character}
              </div>
              <div className="min-w-0">
                <div className="text-sm text-white/60">{w.pinyin}</div>
                <div className="text-sm truncate">{w.l1_meanings.en ?? ''}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
    </motion.div>
  )
}

export default function ProfileTab() {
  const displayName = useMemo(() => getOrCreateName(), [])
  const [decks, setDecks] = useState<DeckInfo[]>([])
  const [activeCategory, setActiveCategory] = useState<Category | null>(null)

  useEffect(() => {
    getActivatedDecks().then(setDecks)
  }, [])

  const { stats, wordsByCategory } = useMemo(() => {
    const persisted = loadPersistedState()
    const mastered: WordMetadata[] = []
    const inProgress: WordMetadata[] = []
    const unseen: WordMetadata[] = []

    for (const w of wordDataset) {
      const st = persisted.wordStates[w.word_id]
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
        total: wordDataset.length,
        mastered: mastered.length,
        inProgress: inProgress.length,
        unseen: unseen.length,
      },
      wordsByCategory: { mastered, inProgress, new: unseen } as Record<Category, WordMetadata[]>,
    }
  }, [])

  const progress = stats.total > 0 ? stats.mastered / stats.total : 0
  const pct = Math.round(progress * 100)

  return (
    <div className="relative z-10 h-dvh overflow-hidden bg-black">
      <div className="h-full overflow-y-auto pb-20 pt-4 px-5">
        {/* Avatar & name */}
        <div className="flex flex-col items-center pt-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-3xl font-bold shadow-lg">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <h1 className="mt-3 text-lg font-bold">{displayName}</h1>
          <p className="text-xs text-white/50">Local profile</p>
        </div>

        {/* Progress ring */}
        <div className="mt-8 flex flex-col items-center">
          <div className="relative">
            <ProgressRing progress={progress} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold">{pct}%</span>
              <span className="text-[10px] text-white/50">mastered</span>
            </div>
          </div>
        </div>

        {/* Stat cards — clickable */}
        <div className="mt-6 grid grid-cols-3 gap-3">
          <StatCard
            label="Mastered"
            value={stats.mastered}
            color="text-green-400"
            onClick={() => setActiveCategory('mastered')}
          />
          <StatCard
            label="In Progress"
            value={stats.inProgress}
            color="text-yellow-400"
            onClick={() => setActiveCategory('inProgress')}
          />
          <StatCard
            label="New"
            value={stats.unseen}
            color="text-indigo-400"
            tag
            onClick={() => setActiveCategory('new')}
          />
        </div>

        {/* Total */}
        <p className="mt-3 text-center text-xs text-white/40">
          {stats.total} total characters & vocabulary
        </p>

        {/* Swipe semantics — matches feed scoring */}
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-white/50">
            How swipes work
          </h2>
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

        {/* Purchased decks */}
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">
            Purchased Decks
          </h2>
          {decks.length === 0 ? (
            <p className="mt-4 text-sm text-white/40">
              No purchased decks. Visit the Library tab to browse and activate flashcard decks.
            </p>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-3">
              {decks.map((deck) => (
                <div
                  key={deck.id}
                  className="overflow-hidden rounded-xl bg-white/5 border border-white/10"
                >
                  {deck.cover_image_url ? (
                    <img
                      src={deck.cover_image_url}
                      alt={deck.name}
                      className="aspect-[3/4] w-full object-cover"
                    />
                  ) : (
                    <div className="aspect-[3/4] w-full bg-gradient-to-br from-indigo-800 to-purple-900 flex items-center justify-center">
                      <span className="text-3xl">📚</span>
                    </div>
                  )}
                  <div className="px-3 py-2">
                    <div className="text-xs font-medium truncate">{deck.name}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Word list slide-in panel */}
      <AnimatePresence>
        {activeCategory && (
          <WordListView
            key={activeCategory}
            category={activeCategory}
            words={wordsByCategory[activeCategory]}
            onBack={() => setActiveCategory(null)}
          />
        )}
      </AnimatePresence>
    </div>
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
      onClick={onClick}
      className="rounded-xl bg-white/5 border border-white/10 px-3 py-4 text-center active:scale-95 transition-transform"
    >
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="mt-1 text-[10px] text-white/50 uppercase tracking-wider">
        {label}
        {tag && (
          <span className="ml-1 rounded bg-indigo-500/20 px-1 py-0.5 text-indigo-300">new</span>
        )}
      </div>
      <div className="mt-1.5 text-[9px] text-white/30">View list</div>
    </button>
  )
}
