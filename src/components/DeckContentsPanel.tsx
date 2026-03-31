import { AnimatePresence, motion } from 'framer-motion'
import React, { useEffect, useMemo, useState } from 'react'
import { PERSISTED_STATE_REPLACED_EVENT } from '../lib/accountSync'
import { bandDeckWordsByCubeTier } from '../lib/cubeVaultSort'
import { getWordsForDeck } from '../lib/deckWords'
import { loadPersistedState } from '../lib/storage'
import type { DeckInfo } from '../lib/deckService'
import type { WordMetadata, WordState } from '../lib/types'
import { CubeVaultGrid } from './CubeVaultGrid'
import { EngagementWordPlayer } from './EngagementWordPlayer'

type Props = {
  deck: DeckInfo
  onBack: () => void
  /** Signed-in magic-link user — same as Profile vault player. */
  isSignedIn: boolean
}

export default function DeckContentsPanel({ deck, onBack, isSignedIn }: Props) {
  const [storageRev, setStorageRev] = useState(0)
  const [focusWord, setFocusWord] = useState<WordMetadata | null>(null)

  useEffect(() => {
    const bump = () => setStorageRev((n) => n + 1)
    window.addEventListener(PERSISTED_STATE_REPLACED_EVENT, bump)
    return () => window.removeEventListener(PERSISTED_STATE_REPLACED_EVENT, bump)
  }, [])

  const { wordStates } = useMemo(() => loadPersistedState(), [storageRev])
  const words = useMemo(() => getWordsForDeck(deck), [deck])
  const bands = useMemo(() => bandDeckWordsByCubeTier(words, wordStates), [words, wordStates])

  const sections = (
    [
      { title: 'New', words: bands.newWords },
      { title: 'In progress', words: bands.inProgress },
      { title: 'Mastered', words: bands.mastered },
    ] as const
  ).filter((s) => s.words.length > 0)

  return (
    <>
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
          <p className="mb-4 text-[11px] leading-relaxed text-white/45">
            Cubes use part-of-speech colors (solid), ghost for new, gold for mastered — same as Profile. Tap
            solid or gold to review; ghost unlocks after you earn progress in Home.
          </p>

          {words.length === 0 ? (
            <p className="mt-8 text-sm text-white/40">No items in this deck yet.</p>
          ) : (
            <div className="space-y-8" aria-label={`${deck.name} deck cubes`}>
              {sections.map((sec) => (
                <section key={sec.title}>
                  <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                    {sec.title}
                  </h3>
                  <CubeVaultGrid
                    words={sec.words}
                    wordStates={wordStates as Record<string, WordState | undefined>}
                    onPickWord={(w) => setFocusWord(w)}
                  />
                </section>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {focusWord ? (
          <div key={`deck-vault-${deck.id}-${focusWord.word_id}`} className="fixed inset-0 z-[110]">
            <EngagementWordPlayer
              key={`deck-player-${deck.id}-${focusWord.word_id}`}
              word={focusWord}
              browseWordList={bands.flat}
              disableSrsScoring
              onBack={() => setFocusWord(null)}
              respectAnonymousSwipeCap={false}
              isSignedIn={isSignedIn}
            />
          </div>
        ) : null}
      </AnimatePresence>
    </>
  )
}
