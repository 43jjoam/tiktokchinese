import { describe, expect, it } from 'vitest'
import { combineDisplayedGlobalCounts, getStableEngagementFloors } from '../engagementDisplayCounts'

describe('getStableEngagementFloors', () => {
  it('is stable per word_id', () => {
    const a = getStableEngagementFloors('word_a')
    const b = getStableEngagementFloors('word_a')
    expect(a).toEqual(b)
  })

  it('empty / whitespace word_id uses fixed defaults with shares < saves < likes', () => {
    expect(getStableEngagementFloors('')).toEqual({
      likesFloor: 1000,
      savesFloor: 250,
      sharesFloor: 50,
    })
    expect(getStableEngagementFloors('   ')).toEqual({
      likesFloor: 1000,
      savesFloor: 250,
      sharesFloor: 50,
    })
  })

  it('likes 100–2000; saves 10–50% of likes; shares 2–10% of likes; shares < saves', () => {
    for (const id of ['x', 'hsk1_001', 'builtin-char-一', 'M-dad-01__爸']) {
      const { likesFloor, savesFloor, sharesFloor } = getStableEngagementFloors(id)
      expect(likesFloor).toBeGreaterThanOrEqual(100)
      expect(likesFloor).toBeLessThanOrEqual(2000)
      expect(savesFloor).toBeGreaterThanOrEqual(1)
      expect(savesFloor).toBeLessThan(likesFloor)
      expect(sharesFloor).toBeGreaterThanOrEqual(1)
      expect(sharesFloor).toBeLessThan(savesFloor)

      const saveRatio = savesFloor / likesFloor
      expect(saveRatio).toBeGreaterThanOrEqual(0.1 - 1 / likesFloor)
      expect(saveRatio).toBeLessThanOrEqual(0.5 + 1 / likesFloor)

      const shareRatio = sharesFloor / likesFloor
      expect(shareRatio).toBeGreaterThanOrEqual(0.02 - 1 / likesFloor)
      expect(shareRatio).toBeLessThanOrEqual(0.1 + 1 / likesFloor)
    }
  })

  it('invariants hold for many synthetic word ids', () => {
    for (let i = 0; i < 800; i++) {
      const id = `synth_${i}_${(i * 7919).toString(36)}`
      const f = getStableEngagementFloors(id)
      expect(f.likesFloor).toBeGreaterThanOrEqual(100)
      expect(f.likesFloor).toBeLessThanOrEqual(2000)
      expect(f.savesFloor).toBeGreaterThanOrEqual(1)
      expect(f.savesFloor).toBeLessThan(f.likesFloor)
      expect(f.sharesFloor).toBeGreaterThanOrEqual(1)
      expect(f.sharesFloor).toBeLessThan(f.savesFloor)
      const d = combineDisplayedGlobalCounts(id, 0, 0, 0)
      expect(d.likes).toBe(f.likesFloor)
      expect(d.saves).toBe(f.savesFloor)
      expect(d.shares).toBe(f.sharesFloor)
      expect(d.saves).toBeLessThan(d.likes)
      expect(d.shares).toBeLessThan(d.saves)
    }
  })
})

describe('combineDisplayedGlobalCounts', () => {
  it('adds real totals to floors and keeps saves < likes and shares < saves', () => {
    const w = 'test_word_combine'
    const { likesFloor, savesFloor, sharesFloor } = getStableEngagementFloors(w)
    const d = combineDisplayedGlobalCounts(w, 3, 2, 1)
    expect(d.likes).toBe(likesFloor + 3)
    expect(d.saves).toBeLessThan(d.likes)
    expect(d.shares).toBeLessThan(d.saves)
    expect(d.saves).toBeGreaterThanOrEqual(savesFloor + 2)
    expect(d.shares).toBeGreaterThanOrEqual(Math.min(sharesFloor + 1, d.saves - 1))
  })

  it('clamps when real saves would exceed displayed likes', () => {
    const w = 'clamp_test'
    const { likesFloor, savesFloor, sharesFloor } = getStableEngagementFloors(w)
    const d = combineDisplayedGlobalCounts(w, 0, 9_999_999, 0)
    expect(d.likes).toBe(likesFloor)
    expect(d.saves).toBeLessThan(d.likes)
    expect(d.shares).toBeLessThan(d.saves)
    expect(d.saves).toBeGreaterThanOrEqual(savesFloor)
    expect(d.shares).toBeGreaterThanOrEqual(Math.min(sharesFloor, d.saves - 1))
  })

  it('includes real share_success totals', () => {
    const w = 'share_real_test'
    const floors = getStableEngagementFloors(w)
    const d0 = combineDisplayedGlobalCounts(w, 0, 0, 0)
    const d5 = combineDisplayedGlobalCounts(w, 0, 0, 5)
    expect(d5.shares).toBeGreaterThanOrEqual(d0.shares)
    expect(d5.shares).toBeLessThan(d5.saves)
    expect(d5.shares).toBeLessThanOrEqual(floors.sharesFloor + 5)
  })
})
