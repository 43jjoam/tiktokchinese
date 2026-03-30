import type { WordMetadata, WordState } from '../lib/types'
import { resolvePosTag } from '../lib/inferPosTag'
import {
  deriveMasteryBlockTier,
  masteryBlockTierLabel,
  type MasteryBlockTier,
} from '../lib/masteryBlockTier'
import { montessoriHexForPosTag, montessoriTileTextClassForHex } from '../lib/posTagMontessori'

type Props = {
  word: WordMetadata
  wordState: WordState
  className?: string
}

function tierAccentClass(tier: MasteryBlockTier): string {
  switch (tier) {
    case 'fluid':
      return 'ring-sky-400/35'
    case 'crystallizing':
      return 'ring-cyan-300/45'
    case 'solid':
      return 'ring-white/40'
    case 'gold':
      return 'ring-amber-300/70'
    default:
      return 'ring-white/25'
  }
}

/**
 * Feed overlay: Montessori-colored tile by POS, tier from `mScore` / Gold from mastery gate.
 */
export function MasteryBlockBadge({ word, wordState, className = '' }: Props) {
  const tier = deriveMasteryBlockTier(wordState.mScore, wordState.masteryConfirmed)
  const hex = montessoriHexForPosTag(resolvePosTag(word))
  const textClass = tier === 'gold' ? 'text-amber-950' : montessoriTileTextClassForHex(hex)
  const label = masteryBlockTierLabel(tier)
  const glyph = word.character
  const compactGlyph = glyph.length > 1

  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      <div
        className={`flex items-center justify-center rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.45)] ring-2 ${tierAccentClass(
          tier,
        )} ${compactGlyph ? 'h-12 min-w-[3rem] px-1.5' : 'h-14 w-14'}`}
        style={
          tier === 'gold'
            ? {
                background: 'linear-gradient(145deg, #fff4a8 0%, #FFD700 42%, #c9a227 100%)',
              }
            : { backgroundColor: hex }
        }
        aria-label={`Mastery ${label} block, ${glyph}`}
      >
        <span
          className={`font-bold leading-none ${compactGlyph ? 'text-lg' : 'text-2xl'} ${textClass}`}
        >
          {glyph}
        </span>
      </div>
      <span
        className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/75 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
        aria-hidden
      >
        {label}
      </span>
    </div>
  )
}
