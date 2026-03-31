import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  LAST_KNOWN_REFERRAL_COUNT_KEY,
  REFERRAL_JOIN_TOAST_EVENT,
  tryShowReferralJoinToast,
} from '../referralJoinToast'

describe('tryShowReferralJoinToast', () => {
  afterEach(() => {
    localStorage.removeItem(LAST_KNOWN_REFERRAL_COUNT_KEY)
    vi.restoreAllMocks()
  })

  it('does nothing when count did not increase', () => {
    const spy = vi.spyOn(window, 'dispatchEvent')
    tryShowReferralJoinToast(2, 2)
    expect(spy).not.toHaveBeenCalled()
    expect(localStorage.getItem(LAST_KNOWN_REFERRAL_COUNT_KEY)).toBeNull()
  })

  it('on first localStorage key: toasts only single-step increase', () => {
    const spy = vi.spyOn(window, 'dispatchEvent')
    tryShowReferralJoinToast(0, 5)
    expect(spy).not.toHaveBeenCalled()
    expect(localStorage.getItem(LAST_KNOWN_REFERRAL_COUNT_KEY)).toBe('5')

    tryShowReferralJoinToast(5, 6)
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ type: REFERRAL_JOIN_TOAST_EVENT }),
    )
  })

  it('on first key: toasts 0 -> 1', () => {
    const spy = vi.spyOn(window, 'dispatchEvent')
    tryShowReferralJoinToast(0, 1)
    expect(spy).toHaveBeenCalled()
  })

  it('when key exists: toasts when newCount exceeds stored last', () => {
    localStorage.setItem(LAST_KNOWN_REFERRAL_COUNT_KEY, '3')
    const spy = vi.spyOn(window, 'dispatchEvent')
    tryShowReferralJoinToast(3, 4)
    expect(spy).toHaveBeenCalled()
    expect(localStorage.getItem(LAST_KNOWN_REFERRAL_COUNT_KEY)).toBe('4')
  })
})
