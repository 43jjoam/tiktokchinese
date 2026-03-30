import { POS_TAGS, type PosTag } from './posTag'
import { POS_TAG_MONTESSORI_LEGEND } from './posTagMontessori'

export type PosTagWheelSegment = {
  tag: PosTag
  label: string
  hex: string
  count: number
  startDeg: number
  endDeg: number
  angleDeg: number
}

/**
 * Donut slices proportional to word counts. If total count is 0, equal slices (10 × 36°).
 */
export function buildPosTagWheelSegments(countsByTag: Record<PosTag, number>): PosTagWheelSegment[] {
  const legend = POS_TAG_MONTESSORI_LEGEND
  const n = legend.length
  const total = POS_TAGS.reduce((s, t) => s + Math.max(0, countsByTag[t] ?? 0), 0)
  const offset = -90
  let cursor = offset
  const segments: PosTagWheelSegment[] = []

  if (total <= 0) {
    const step = 360 / n
    for (let i = 0; i < legend.length; i++) {
      const startDeg = offset + i * step
      const endDeg = offset + (i + 1) * step
      segments.push({
        tag: legend[i].tag,
        label: legend[i].label,
        hex: legend[i].hex,
        count: 0,
        startDeg,
        endDeg,
        angleDeg: step,
      })
    }
    return segments
  }

  for (const item of legend) {
    const count = Math.max(0, countsByTag[item.tag] ?? 0)
    const angleDeg = (count / total) * 360
    const startDeg = cursor
    const endDeg = cursor + angleDeg
    cursor = endDeg
    segments.push({
      tag: item.tag,
      label: item.label,
      hex: item.hex,
      count,
      startDeg,
      endDeg,
      angleDeg,
    })
  }
  return segments
}
