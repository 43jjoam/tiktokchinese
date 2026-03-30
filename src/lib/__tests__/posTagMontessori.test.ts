import { describe, expect, it } from 'vitest'
import { POS_TAGS, type PosTag } from '../posTag'
import { montessoriHexForPosTag, POS_TAG_MONTESSORI_LEGEND } from '../posTagMontessori'
import { buildPosTagWheelSegments } from '../posTagWheelSegments'

describe('Montessori color wheel data (#5)', () => {
  it('legend covers every POS tag once, same order as POS_TAGS', () => {
    expect(POS_TAG_MONTESSORI_LEGEND.map((x) => x.tag)).toEqual([...POS_TAGS])
  })

  it('montessoriHexForPosTag matches legend hex', () => {
    for (const row of POS_TAG_MONTESSORI_LEGEND) {
      expect(montessoriHexForPosTag(row.tag)).toBe(row.hex)
      expect(row.hex).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})

describe('buildPosTagWheelSegments', () => {
  function zeroCounts(): Record<PosTag, number> {
    const o = {} as Record<PosTag, number>
    for (const t of POS_TAGS) o[t] = 0
    return o
  }

  it('uses equal slices when total is 0', () => {
    const segs = buildPosTagWheelSegments(zeroCounts())
    expect(segs.length).toBe(POS_TAGS.length)
    for (const s of segs) {
      expect(s.angleDeg).toBeCloseTo(360 / POS_TAGS.length, 5)
    }
    const full = segs.reduce((a, s) => a + s.angleDeg, 0)
    expect(full).toBeCloseTo(360, 5)
  })

  it('angles are proportional to counts', () => {
    const c = zeroCounts()
    c.noun = 30
    c.verb = 10
    const segs = buildPosTagWheelSegments(c)
    const noun = segs.find((s) => s.tag === 'noun')!
    const verb = segs.find((s) => s.tag === 'verb')!
    expect(noun.angleDeg).toBeCloseTo(270, 5)
    expect(verb.angleDeg).toBeCloseTo(90, 5)
    expect(segs.filter((s) => s.count === 0).every((s) => s.angleDeg === 0)).toBe(true)
  })
})
