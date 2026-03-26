import React, { useEffect, useMemo, useState } from 'react'
import { loadPersistedState } from '../lib/storage'
import { words as wordDataset } from '../data/words'
import { getActivatedDecks, type DeckInfo } from '../lib/deckService'

const NAME_KEY = 'tiktokchinese_display_name'

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

export default function ProfileTab() {
  const displayName = useMemo(() => getOrCreateName(), [])
  const [decks, setDecks] = useState<DeckInfo[]>([])

  useEffect(() => {
    getActivatedDecks().then(setDecks)
  }, [])

  const stats = useMemo(() => {
    const persisted = loadPersistedState()
    const total = wordDataset.length
    let mastered = 0
    let inProgress = 0
    let unseen = 0

    for (const w of wordDataset) {
      const st = persisted.wordStates[w.word_id]
      if (!st || st.sessionsSeen === 0) {
        unseen++
      } else if (st.masteryConfirmed) {
        mastered++
      } else {
        inProgress++
      }
    }

    return { total, mastered, inProgress, unseen }
  }, [])

  const progress = stats.total > 0 ? stats.mastered / stats.total : 0
  const pct = Math.round(progress * 100)

  return (
    <div className="h-dvh overflow-y-auto pb-20 pt-4 px-5">
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

      {/* Stat cards */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        <StatCard label="Mastered" value={stats.mastered} color="text-green-400" />
        <StatCard label="In Progress" value={stats.inProgress} color="text-yellow-400" />
        <StatCard label="New" value={stats.unseen} color="text-indigo-400" tag />
      </div>

      {/* Total */}
      <p className="mt-3 text-center text-xs text-white/40">
        {stats.total} total characters & vocabulary
      </p>

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
  )
}

function StatCard({
  label,
  value,
  color,
  tag,
}: {
  label: string
  value: number
  color: string
  tag?: boolean
}) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-4 text-center">
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="mt-1 text-[10px] text-white/50 uppercase tracking-wider">
        {label}
        {tag && (
          <span className="ml-1 rounded bg-indigo-500/20 px-1 py-0.5 text-indigo-300">new</span>
        )}
      </div>
    </div>
  )
}
