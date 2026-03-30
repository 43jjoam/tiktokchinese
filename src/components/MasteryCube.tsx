import React from 'react'
import { resolvePosTag } from '../lib/inferPosTag'
import { deriveMasteryBlockTier, masteryBlockTierLabel } from '../lib/masteryBlockTier'
import type { PosTag } from '../lib/posTag'
import type { WordMetadata, WordState } from '../lib/types'

const assetBase = (() => {
  const b = import.meta.env.BASE_URL
  return b.endsWith('/') ? b : `${b}/`
})()

type Props = {
  word: WordMetadata
  wordState: WordState | undefined
  size?: number
  onClick?: () => void
  className?: string
}

function cubeSpritePath(pos: PosTag, mode: 'gold' | 'solid' | 'ghost'): string {
  if (mode === 'gold') return `${assetBase}cubes/solid/gold.png`
  if (mode === 'ghost') return `${assetBase}cubes/ghost/${pos}_ghost.png`
  return `${assetBase}cubes/solid/${pos}.png`
}

/**
 * Pre-rendered cube PNG + character overlay. Visual tiers:
 * - New: mScore === 0 (and not mastered) → ghost/{pos}_ghost.png, hanzi 75% white
 * - In progress: mScore 1–4 and not mastered → solid/{pos}.png
 * - Mastered: mScore ≥ 5 or masteryConfirmed → solid/gold.png, hanzi #FFD700
 */
export function MasteryCube({ word, wordState, size = 72, onClick, className }: Props) {
  const mScore = wordState?.mScore ?? 0
  const masteryConfirmed = Boolean(wordState?.masteryConfirmed)
  const pos = resolvePosTag(word)

  const mastered = masteryConfirmed || mScore >= 5
  const isNew = !mastered && mScore === 0

  const mode: 'gold' | 'ghost' | 'solid' = mastered ? 'gold' : isNew ? 'ghost' : 'solid'
  const src = cubeSpritePath(pos, mode)

  const tier = deriveMasteryBlockTier(mScore, masteryConfirmed)
  const tierLabel = masteryBlockTierLabel(tier)

  const charStyle: React.CSSProperties =
    mode === 'gold'
      ? {
          fontSize: size * 0.32,
          fontWeight: 700,
          color: '#FFD700',
          textShadow: '0 1px 4px rgba(0,0,0,0.4)',
          lineHeight: 1,
          marginTop: size * 0.08,
        }
      : mode === 'ghost'
        ? {
            fontSize: size * 0.32,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.75)',
            textShadow: '0 1px 4px rgba(0,0,0,0.5)',
            lineHeight: 1,
            marginTop: size * 0.08,
          }
        : {
            fontSize: size * 0.32,
            fontWeight: 700,
            color: '#ffffff',
            textShadow: '0 1px 4px rgba(0,0,0,0.4)',
            lineHeight: 1,
            marginTop: size * 0.08,
          }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${word.character} — ${tierLabel} — tap to review`}
      className={`relative flex cursor-pointer items-center justify-center border-0 bg-transparent p-0 outline-none transition-transform active:scale-95 ${className ?? ''}`}
      style={{
        width: size,
        height: size,
      }}
    >
      <img
        src={src}
        alt=""
        className="absolute inset-0 h-full w-full object-contain"
        style={{
          filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.5))',
        }}
        draggable={false}
      />
      <span className="relative z-[2]" style={charStyle}>
        {word.character}
      </span>
    </button>
  )
}
