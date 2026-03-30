import { describe, expect, it } from 'vitest'
import { redeemGiftFailureMessage } from '../engagementService'

describe('redeemGiftFailureMessage', () => {
  it('maps Edge error reasons to user copy', () => {
    expect(redeemGiftFailureMessage({ ok: false, reason: 'expired' })).toContain('expired')
    expect(redeemGiftFailureMessage({ ok: false, reason: 'revoked' })).toContain('no longer available')
    expect(redeemGiftFailureMessage({ ok: false, reason: 'daily_receive_cap', cap: 3 })).toContain(
      "You've received 3 gifts today",
    )
    expect(redeemGiftFailureMessage({ ok: false, reason: 'daily_receive_cap' })).toContain(
      "You've received 3 gifts today",
    )
    expect(redeemGiftFailureMessage({ ok: false, reason: 'not_found' })).toMatch(/couldn't find/i)
    expect(redeemGiftFailureMessage({ ok: false, reason: 'invalid_token' })).toContain("doesn't look valid")
    expect(redeemGiftFailureMessage({ ok: false, reason: 'config' })).toContain('unavailable')
    expect(redeemGiftFailureMessage({ ok: false, reason: 'network' })).toContain('connection')
    expect(redeemGiftFailureMessage({ ok: false, reason: 'unknown' })).toContain('Something went wrong')
  })
})
