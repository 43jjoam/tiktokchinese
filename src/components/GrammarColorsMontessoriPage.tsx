import { AnimatePresence, motion } from 'framer-motion'
import React, { useMemo, useState } from 'react'
import { resolvePosTag } from '../lib/inferPosTag'
import { POS_TAGS, type PosTag } from '../lib/posTag'
import type { WordMetadata, WordState } from '../lib/types'
import { POS_TAG_MONTESSORI_LEGEND, posTagDisplayLabel } from '../lib/posTagMontessori'
import {
  GRAMMAR_PAGE_FOOTER_LINKS,
  GRAMMAR_PAGE_INTRO_LEAD,
  GRAMMAR_PAGE_INTRO_TITLE,
  POS_TAG_ROLE_IN_CHINESE,
} from '../lib/posTagMontessoriExplainer'
import { sortWordsByCubeTier } from '../lib/cubeVaultSort'
import { MasteryCube } from './MasteryCube'

type Bands = {
  mastered: WordMetadata[]
  inProgress: WordMetadata[]
  newWords: WordMetadata[]
  flat: WordMetadata[]
}

type Props = {
  feedWordList: WordMetadata[]
  wordStates: Record<string, WordState | undefined>
  onPickVaultWord: (word: WordMetadata, browseList: WordMetadata[]) => void
  onBack: () => void
}

function bandWordsForFeed(
  feedWordList: WordMetadata[],
  wordStates: Record<string, WordState | undefined>,
): Record<PosTag, Bands> {
  const out = {} as Record<PosTag, Bands>
  for (const tag of POS_TAGS) {
    const inTag = feedWordList.filter((w) => resolvePosTag(w) === tag)
    const mastered: WordMetadata[] = []
    const inProgress: WordMetadata[] = []
    const newWords: WordMetadata[] = []
    for (const w of inTag) {
      const st = wordStates[w.word_id]
      const mScore = st?.mScore ?? 0
      const isMastered = Boolean(st?.masteryConfirmed) || mScore >= 5
      if (isMastered) mastered.push(w)
      else if (mScore === 0) newWords.push(w)
      else inProgress.push(w)
    }
    const sortZh = (a: WordMetadata, b: WordMetadata) =>
      a.character.localeCompare(b.character, 'zh-Hans-CN')
    mastered.sort(sortZh)
    inProgress.sort(sortZh)
    newWords.sort(sortZh)
    const flat = sortWordsByCubeTier([...mastered, ...inProgress, ...newWords], wordStates)
    out[tag] = {
      mastered,
      inProgress,
      newWords,
      flat,
    }
  }
  return out
}

function PosTagCubeBoard({
  tag,
  bands,
  wordStates,
  onPickVaultWord,
  onBack,
}: {
  tag: PosTag
  bands: Bands
  wordStates: Record<string, WordState | undefined>
  onPickVaultWord: (word: WordMetadata, browseList: WordMetadata[]) => void
  onBack: () => void
}) {
  const label = posTagDisplayLabel(tag)
  const n = bands.flat.length
  const roleLine = POS_TAG_ROLE_IN_CHINESE[tag]

  const sections = (
    [
      { title: 'Mastered', words: bands.mastered },
      { title: 'In progress', words: bands.inProgress },
      { title: 'New', words: bands.newWords },
    ] as const
  ).filter((s) => s.words.length > 0)

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'tween', duration: 0.25 }}
      className="fixed inset-0 z-[61] flex h-dvh flex-col bg-black"
    >
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/10 bg-black/90 px-5 py-3 backdrop-blur-xl">
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
            aria-hidden
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-bold text-white">{label}</h2>
          <p className="truncate text-[11px] tabular-nums text-white/50">{n} in your decks</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(2rem,calc(1.5rem+env(safe-area-inset-bottom)))] pt-4">
        <p className="mb-4 text-[12px] leading-relaxed text-white/55">{roleLine}</p>

        {n === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-6 text-center">
            <p className="text-3xl font-bold tabular-nums text-white/80">0</p>
            <p className="mt-2 text-sm leading-relaxed text-white/50">
              No {label.toLowerCase()} in your activated decks yet.
            </p>
          </div>
        ) : (
          <div className="space-y-8" aria-label={`${n} cubes for ${label}`}>
            {sections.map((sec) => (
              <section key={sec.title}>
                <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                  {sec.title}
                </h3>
                <div className="grid grid-cols-3 justify-items-center gap-x-2 gap-y-4 min-[400px]:grid-cols-4">
                  {sec.words.map((w) => (
                    <MasteryCube
                      key={w.word_id}
                      word={w}
                      wordState={wordStates[w.word_id]}
                      onClick={() => onPickVaultWord(w, bands.flat)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}

export function GrammarColorsMontessoriPage({
  feedWordList,
  wordStates,
  onPickVaultWord,
  onBack,
}: Props) {
  const [openTilesFor, setOpenTilesFor] = useState<PosTag | null>(null)

  const bandsByTag = useMemo(
    () => bandWordsForFeed(feedWordList, wordStates),
    [feedWordList, wordStates],
  )

  return (
    <>
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'tween', duration: 0.25 }}
        className="fixed inset-0 z-[60] flex h-dvh flex-col bg-black"
      >
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/10 bg-black/90 px-5 py-3 backdrop-blur-xl">
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
              aria-hidden
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold text-white">Word types</h1>
            <p className="truncate text-[11px] font-medium uppercase tracking-wide text-violet-300/90">
              Chinese grammar roles
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(2rem,calc(1.5rem+env(safe-area-inset-bottom)))] pt-4">
          <section>
            <h2 className="text-sm font-semibold text-white">{GRAMMAR_PAGE_INTRO_TITLE}</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-white/65">{GRAMMAR_PAGE_INTRO_LEAD}</p>
          </section>

          <section className="mt-8">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-white/50">Each type</h2>
            <p className="mt-2 text-[12px] leading-relaxed text-white/45">
              Tap a row for cubes (mastered, in progress, then new). Tap a cube to open its lesson video.
            </p>
            <ul className="mt-4 space-y-3 p-0">
              {POS_TAG_MONTESSORI_LEGEND.map(({ tag, label, hex }) => {
                const role = POS_TAG_ROLE_IN_CHINESE[tag]
                const n = bandsByTag[tag].flat.length
                return (
                  <li key={tag} className="list-none">
                    <button
                      type="button"
                      onClick={() => setOpenTilesFor(tag)}
                      className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-3.5 text-left transition-colors active:bg-white/[0.08]"
                      aria-label={`${label}, ${n} words. Open cube vault.`}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className="mt-0.5 h-4 w-4 shrink-0 rounded-full ring-2 ring-white/20"
                          style={{ backgroundColor: hex }}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-white">{label}</span>
                            <span className="inline-flex items-center gap-1.5">
                              <span className="text-sm font-bold tabular-nums text-white/90">{n}</span>
                              <svg
                                viewBox="0 0 24 24"
                                width="18"
                                height="18"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                className="shrink-0 text-white/35"
                                aria-hidden
                              >
                                <polyline points="9 18 15 12 9 6" />
                              </svg>
                            </span>
                          </div>
                          <p className="mt-2 text-[12px] leading-relaxed text-white/60">{role}</p>
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>

          <footer className="mt-10 border-t border-white/10 pt-6">
            <p className="text-[11px] text-white/40">
              {GRAMMAR_PAGE_FOOTER_LINKS.map((l, i) => (
                <span key={l.url}>
                  {i > 0 ? ' · ' : ''}
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet-300/90 underline decoration-violet-500/40 underline-offset-2 hover:text-violet-200"
                  >
                    {l.label}
                  </a>
                </span>
              ))}
            </p>
          </footer>
        </div>
      </motion.div>

      <AnimatePresence>
        {openTilesFor != null ? (
          <PosTagCubeBoard
            key={openTilesFor}
            tag={openTilesFor}
            bands={bandsByTag[openTilesFor]}
            wordStates={wordStates}
            onPickVaultWord={onPickVaultWord}
            onBack={() => setOpenTilesFor(null)}
          />
        ) : null}
      </AnimatePresence>
    </>
  )
}
