import { describe, expect, it } from 'vitest'
import {
  ANONYMOUS_SWIPE_SESSION_CAP,
  shouldBlockUnsignedSwipeAfterCap,
} from '../studySessionSwipeFinish'

describe('anonymous swipe gate', () => {
  it('does not block signed-in users', () => {
    expect(shouldBlockUnsignedSwipeAfterCap(99, true)).toBe(false)
  })

  it('blocks guests at cap', () => {
    expect(shouldBlockUnsignedSwipeAfterCap(ANONYMOUS_SWIPE_SESSION_CAP, false)).toBe(true)
    expect(shouldBlockUnsignedSwipeAfterCap(ANONYMOUS_SWIPE_SESSION_CAP - 1, false)).toBe(false)
  })
})
