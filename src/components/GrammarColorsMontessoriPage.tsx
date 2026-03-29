import { AnimatePresence, motion } from 'framer-motion'
import React, { useState } from 'react'
import type { PosTag } from '../lib/posTag'
import type { WordMetadata } from '../lib/types'
import {
  montessoriHexForPosTag,
  montessoriTileTextClassForHex,
  POS_TAG_MONTESSORI_LEGEND,
  posTagDisplayLabel,
} from '../lib/posTagMontessori'
import {
  GRAMMAR_PAGE_FOOTER_LINKS,
  GRAMMAR_PAGE_INTRO_LEAD,
  GRAMMAR_PAGE_INTRO_TITLE,
  POS_TAG_ROLE_IN_CHINESE,
} from '../lib/posTagMontessoriExplainer'

type Props = {
  achievedWordsByPosTag: Record<PosTag, WordMetadata[]>
  onBack: () => void
}

function PosTagTileBoard({
  tag,
  words,
  onBack,
}: {
  tag: PosTag
  words: WordMetadata[]
  onBack: () => void
}) {
  const hex = montessoriHexForPosTag(tag)
  const label = posTagDisplayLabel(tag)
  const textCls = montessoriTileTextClassForHex(hex)
  const n = words.length
  const roleLine = POS_TAG_ROLE_IN_CHINESE[tag]

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
          <p className="truncate text-[11px] tabular-nums text-white/50">{n} collected</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(2rem,calc(1.5rem+env(safe-area-inset-bottom)))] pt-4">
        <p className="mb-4 text-[12px] leading-relaxed text-white/55">{roleLine}</p>

        {n === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-6 text-center">
            <p className="text-3xl font-bold tabular-nums text-white/80">0</p>
            <p className="mt-2 text-sm leading-relaxed text-white/50">
              Swipe left or right on a {label.toLowerCase()} in the feed or a saved clip to add tiles.
            </p>
          </div>
        ) : (
          <ul
            className="grid grid-cols-4 gap-2 p-0 sm:grid-cols-5"
            aria-label={`${n} tiles for ${label}`}
          >
            {words.map((w) => (
              <li key={w.word_id} className="list-none">
                <div
                  className={`flex aspect-square select-none items-center justify-center rounded-xl text-2xl font-semibold ring-1 ring-black/30 sm:text-[1.65rem] ${textCls}`}
                  style={{ backgroundColor: hex }}
                  title={`${w.character} · ${w.pinyin}`}
                >
                  {w.character}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </motion.div>
  )
}

export function GrammarColorsMontessoriPage({ achievedWordsByPosTag, onBack }: Props) {
  const [openTilesFor, setOpenTilesFor] = useState<PosTag | null>(null)

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
              The number is how many words of that type you finished with a full swipe. Tap a row for tiles.
            </p>
            <ul className="mt-4 space-y-3 p-0">
              {POS_TAG_MONTESSORI_LEGEND.map(({ tag, label, hex }) => {
                const role = POS_TAG_ROLE_IN_CHINESE[tag]
                const words = achievedWordsByPosTag[tag]
                const n = words.length
                return (
                  <li key={tag} className="list-none">
                    <button
                      type="button"
                      onClick={() => setOpenTilesFor(tag)}
                      className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-3.5 text-left transition-colors active:bg-white/[0.08]"
                      aria-label={`${label}, ${n} tiles. Open tile board.`}
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
          <PosTagTileBoard
            key={openTilesFor}
            tag={openTilesFor}
            words={achievedWordsByPosTag[openTilesFor]}
            onBack={() => setOpenTilesFor(null)}
          />
        ) : null}
      </AnimatePresence>
    </>
  )
}
