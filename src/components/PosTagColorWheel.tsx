import React, { useMemo } from 'react'
import type { PosTag } from '../lib/posTag'
import { buildPosTagWheelSegments } from '../lib/posTagWheelSegments'

/** Donut wedge from startDeg to endDeg (degrees, clockwise from +x; we offset so first slice starts at top). */
function donutWedgePath(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startDeg: number,
  endDeg: number,
): string {
  const rad = Math.PI / 180
  const a0 = startDeg * rad
  const a1 = endDeg * rad
  const x0o = cx + rOuter * Math.cos(a0)
  const y0o = cy + rOuter * Math.sin(a0)
  const x1o = cx + rOuter * Math.cos(a1)
  const y1o = cy + rOuter * Math.sin(a1)
  const x1i = cx + rInner * Math.cos(a1)
  const y1i = cy + rInner * Math.sin(a1)
  const x0i = cx + rInner * Math.cos(a0)
  const y0i = cy + rInner * Math.sin(a0)
  const delta = ((endDeg - startDeg) % 360 + 360) % 360
  const large = delta > 180 ? 1 : 0
  return [
    `M ${x0o} ${y0o}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${x1o} ${y1o}`,
    `L ${x1i} ${y1i}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${x0i} ${y0i}`,
    'Z',
  ].join(' ')
}

type Props = {
  onSelectTag: (tag: PosTag) => void
  /** Word count per type in activated decks (same as each row’s total). Slice angle ∝ count. */
  countsByTag: Record<PosTag, number>
}

/**
 * Circular color map for POS tags. Slice size reflects share of your words in that type; tapping opens its vault.
 * If every count is 0, falls back to equal slices (neutral legend).
 */
export function PosTagColorWheel({ onSelectTag, countsByTag }: Props) {
  const segments = useMemo(() => buildPosTagWheelSegments(countsByTag), [countsByTag])

  const cx = 50
  const cy = 50
  const rOuter = 46
  const rInner = 26

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox="0 0 100 100"
        className="mx-auto w-[min(18rem,78vw)] max-w-full touch-manipulation"
        role="img"
        aria-label="Part-of-speech wheel — slice size shows your mix of words; tap to open that type"
      >
        {segments.map((seg) => {
          if (seg.angleDeg < 0.05) return null
          const d = donutWedgePath(cx, cy, rOuter, rInner, seg.startDeg, seg.endDeg)
          return (
            <path
              key={seg.tag}
              d={d}
              fill={seg.hex}
              stroke="rgba(255,255,255,0.22)"
              strokeWidth={0.35}
              className="cursor-pointer outline-none transition-opacity duration-150 hover:opacity-95 active:opacity-85 focus-visible:opacity-100 [&:focus-visible]:drop-shadow-[0_0_0.35rem_rgba(255,255,255,0.85)]"
              onClick={() => onSelectTag(seg.tag)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelectTag(seg.tag)
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={`${seg.label}, ${seg.count} word${seg.count === 1 ? '' : 's'} in your decks. Open list.`}
            />
          )
        })}
        <circle cx={cx} cy={cy} r={rInner - 1.2} fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.12)" strokeWidth={0.4} />
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-white/80"
          style={{ fontSize: 5.5, fontWeight: 700, letterSpacing: '0.04em' }}
        >
          TYPES
        </text>
      </svg>
    </div>
  )
}
