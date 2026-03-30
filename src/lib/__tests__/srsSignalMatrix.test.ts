import { describe, expect, it } from 'vitest'
import type { SessionSignals, WordState } from '../types'
import {
  classifyTapTiming,
  LOOP_MS,
  loopsElapsedFromMs,
  scoreFromSession,
  updateWordState,
  wordStateSeed,
} from '../memoryEngine'
import { applyStudySwipeToPersistedState } from '../studySessionSwipeFinish'
import type { PersistedState } from '../storage'
import { DEFAULT_STUDY_META } from '../storage'

function sig(
  base: Pick<SessionSignals, 'swipeDirection' | 'loopsElapsed' | 'tapOccurred'> &
    Partial<Pick<SessionSignals, 'tapTiming'>>,
): SessionSignals {
  return {
    word_id: 'test_word',
    video_id: 'test_video',
    swipeDirection: base.swipeDirection,
    loopsElapsed: base.loopsElapsed,
    tapOccurred: base.tapOccurred,
    tapTiming: base.tapTiming,
  }
}

describe('SRS loop duration (single source of truth)', () => {
  it('loopsElapsedFromMs matches LOOP_MS', () => {
    expect(LOOP_MS).toBe(5000)
    expect(loopsElapsedFromMs(2500)).toBe(0.5)
    expect(loopsElapsedFromMs(5000)).toBe(1)
    expect(loopsElapsedFromMs(10_000)).toBe(2)
  })
})

describe('classifyTapTiming (PRD: early ≤2 loops, late >2)', () => {
  it('boundary at 2.0 loops', () => {
    expect(classifyTapTiming(0)).toBe('early')
    expect(classifyTapTiming(2)).toBe('early')
    expect(classifyTapTiming(2.0000001)).toBe('late')
  })
})

describe('scoreFromSession — PRD signal matrix', () => {
  describe('left swipe (bridge)', () => {
    it('no tap → 0', () => {
      expect(scoreFromSession(sig({ swipeDirection: 'left', loopsElapsed: 3, tapOccurred: false }))).toBe(0)
    })
    it('any tap → -1', () => {
      expect(scoreFromSession(sig({ swipeDirection: 'left', loopsElapsed: 0.5, tapOccurred: true }))).toBe(-1)
      expect(scoreFromSession(sig({ swipeDirection: 'left', loopsElapsed: 4, tapOccurred: true, tapTiming: 'early' }))).toBe(
        -1,
      )
    })
  })

  describe('right swipe, no tap — loop bands', () => {
    it('< 1 loop → 0.3', () => {
      expect(scoreFromSession(sig({ swipeDirection: 'right', loopsElapsed: 0, tapOccurred: false }))).toBe(0.3)
      expect(scoreFromSession(sig({ swipeDirection: 'right', loopsElapsed: 0.99, tapOccurred: false }))).toBe(0.3)
    })
    it('1–2 loops inclusive → 2.0', () => {
      expect(scoreFromSession(sig({ swipeDirection: 'right', loopsElapsed: 1, tapOccurred: false }))).toBe(2)
      expect(scoreFromSession(sig({ swipeDirection: 'right', loopsElapsed: 1.5, tapOccurred: false }))).toBe(2)
      expect(scoreFromSession(sig({ swipeDirection: 'right', loopsElapsed: 2, tapOccurred: false }))).toBe(2)
    })
    it('>2 through 4 loops → 1.0', () => {
      expect(scoreFromSession(sig({ swipeDirection: 'right', loopsElapsed: 2.0001, tapOccurred: false }))).toBe(1)
      expect(scoreFromSession(sig({ swipeDirection: 'right', loopsElapsed: 3, tapOccurred: false }))).toBe(1)
      expect(scoreFromSession(sig({ swipeDirection: 'right', loopsElapsed: 4, tapOccurred: false }))).toBe(1)
    })
    it('> 4 loops → 0.5', () => {
      expect(scoreFromSession(sig({ swipeDirection: 'right', loopsElapsed: 4.0001, tapOccurred: false }))).toBe(0.5)
      expect(scoreFromSession(sig({ swipeDirection: 'right', loopsElapsed: 99, tapOccurred: false }))).toBe(0.5)
    })
  })

  describe('right swipe + tap', () => {
    it('early tap → 0.6', () => {
      expect(
        scoreFromSession(
          sig({ swipeDirection: 'right', loopsElapsed: 1, tapOccurred: true, tapTiming: 'early' }),
        ),
      ).toBe(0.6)
    })
    it('late tap → -1.5', () => {
      expect(
        scoreFromSession(
          sig({ swipeDirection: 'right', loopsElapsed: 3, tapOccurred: true, tapTiming: 'late' }),
        ),
      ).toBe(-1.5)
    })
    it('infers timing from loops when tapTiming omitted', () => {
      expect(scoreFromSession(sig({ swipeDirection: 'right', loopsElapsed: 1, tapOccurred: true }))).toBe(0.6)
      expect(scoreFromSession(sig({ swipeDirection: 'right', loopsElapsed: 3, tapOccurred: true }))).toBe(-1.5)
    })
  })
})

describe('mastery gate (3× loop1 no-tap, ≥48h apart)', () => {
  const word = { word_id: 'mastery_w' } as import('../types').WordMetadata
  const t0 = 1_700_000_000_000
  const ms48h = 48 * 3600_000

  function state(partial: Partial<WordState>): WordState {
    return { ...wordStateSeed(word), ...partial }
  }

  it('counts toward mastery only for right swipe, no tap, loops in [1,2]', () => {
    const s = sig({ swipeDirection: 'right', loopsElapsed: 1.5, tapOccurred: false })
    const next = updateWordState({
      word,
      prev: state({}),
      signals: s,
      alpha: 1,
      nowMs: t0,
    })
    expect(next.consecutiveLoop1NoTapSessions).toBe(1)
    expect(next.masteryConfirmed).toBe(false)
  })

  it('second loop1 within 48h does not increment streak', () => {
    const s = sig({ swipeDirection: 'right', loopsElapsed: 1.2, tapOccurred: false })
    const prev = state({ consecutiveLoop1NoTapSessions: 1, lastLoop1NoTapAt: t0 })
    const next = updateWordState({ word, prev, signals: s, alpha: 1, nowMs: t0 + ms48h / 2 })
    expect(next.consecutiveLoop1NoTapSessions).toBe(1)
  })

  it('third qualifying session ≥48h apart yields mastery', () => {
    const s = sig({ swipeDirection: 'right', loopsElapsed: 1.8, tapOccurred: false })
    let prev = state({ consecutiveLoop1NoTapSessions: 2, lastLoop1NoTapAt: t0 })
    prev = updateWordState({ word, prev, signals: s, alpha: 1, nowMs: t0 + ms48h + 1000 })
    expect(prev.consecutiveLoop1NoTapSessions).toBe(3)
    expect(prev.masteryConfirmed).toBe(true)
  })

  it('non–loop1 session resets streak', () => {
    const bad = sig({ swipeDirection: 'right', loopsElapsed: 3, tapOccurred: false })
    const prev = state({ consecutiveLoop1NoTapSessions: 2, lastLoop1NoTapAt: t0 })
    const next = updateWordState({ word, prev, signals: bad, alpha: 1, nowMs: t0 + ms48h })
    expect(next.consecutiveLoop1NoTapSessions).toBe(0)
    expect(next.lastLoop1NoTapAt).toBeNull()
  })
})

describe('VideoFeed ↔ EngagementWordPlayer SRS bridge', () => {
  it('applyStudySwipeToPersistedState builds the same signals shape as scoring expects', () => {
    const word = {
      word_id: 'bridge_w',
      character: '测',
      pinyin: 'cè',
      l1_meanings: { en: 'test' },
      base_complexity: 1,
      dependencies: [],
      video_url: 'https://example.com/v.mp4',
      video_storage_path: undefined,
    } satisfies import('../types').WordMetadata

    const persisted: PersistedState = {
      wordStates: {},
      videoQuality: {},
      meta: { ...DEFAULT_STUDY_META, alphaFrozen: true, alphaValue: 1 },
    }

    const next = applyStudySwipeToPersistedState({
      word,
      swipeDirection: 'right',
      sessionElapsedMs: LOOP_MS * 1.5,
      tapOccurred: false,
      tapTiming: undefined,
      persisted,
    })

    const st = next.wordStates.bridge_w
    expect(st).toBeDefined()
    expect(st!.sessionsSeen).toBe(1)
    expect(scoreFromSession(sig({ swipeDirection: 'right', loopsElapsed: 1.5, tapOccurred: false }))).toBe(2)
    const deltaM = st!.mScore - 0
    expect(deltaM).toBe(2)
  })
})
