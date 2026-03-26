import { motion } from 'framer-motion'
import React from 'react'
import { getWordsForDeck } from '../lib/deckWords'
import { loadPersistedState } from '../lib/storage'
import { tierBarClass, wordProgressTier } from '../lib/wordProgress'
import type { DeckInfo } from '../lib/deckService'
import type { WordMetadata, WordState } from '../lib/types'

type Props = {
  deck: DeckInfo
  onBack: () => void
}

export default function DeckContentsPanel({ deck, onBack }: Props) {
  const words = getWordsForDeck(deck)
  const { wordStates } = loadPersistedState()

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'tween', duration: 0.25 }}
      className="fixed inset-0 z-[100] flex h-dvh flex-col bg-black"
    >
      <div className="sticky top-0 z-20 flex shrink-0 items-center gap-3 border-b border-white/10 bg-black/90 px-5 py-3 backdrop-blur-xl">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-white/60 transition-colors active:text-white"
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <h2 className="min-w-0 flex-1 truncate text-base font-bold text-white">{deck.name}</h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-24 pt-4">
        <p className="mb-3 text-xs text-white/45">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-6 rounded-sm bg-green-500" /> Mastered
          </span>
          <span className="mx-3 inline-flex items-center gap-2">
            <span className="h-2 w-6 rounded-sm bg-orange-500" /> In progress
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-6 rounded-sm bg-zinc-400" /> New
          </span>
        </p>

        {words.length === 0 ? (
          <p className="mt-8 text-sm text-white/40">No items in this deck yet.</p>
        ) : (
          <div className="space-y-2">
            {words.map((w) => (
              <DeckContentRow key={w.word_id} word={w} wordStates={wordStates} />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}

function DeckContentRow({
  word,
  wordStates,
}: {
  word: WordMetadata
  wordStates: Record<string, WordState>
}) {
  const tier = wordProgressTier(wordStates[word.word_id])
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
      <div className="flex items-center gap-4 px-4 py-3">
        <div className="w-12 shrink-0 text-center text-2xl font-bold">{word.character}</div>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-white/60">{word.pinyin}</div>
          <div className="truncate text-sm">{word.l1_meanings.en ?? ''}</div>
        </div>
      </div>
      <div className="h-1 w-full bg-white/10">
        <div className={`h-full w-full ${tierBarClass[tier]}`} />
      </div>
    </div>
  )
}
