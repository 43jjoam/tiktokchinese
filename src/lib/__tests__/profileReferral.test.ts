import { describe, expect, it } from 'vitest'
import {
  generateReferralCodeCandidate,
  profileReferralColumnsForUpsert,
  remoteReferralFromDbRow,
} from '../profileReferral'
import type { AppMeta } from '../storage'

describe('remoteReferralFromDbRow', () => {
  it('defaults and normalizes', () => {
    expect(remoteReferralFromDbRow(null)).toEqual({
      referralCode: null,
      referredByUserId: null,
      referralCount: 0,
      referralBonusApplied: false,
    })
    expect(
      remoteReferralFromDbRow({
        referral_code: '  abc12  ',
        referred_by: 'not-a-uuid',
        referral_count: 3,
      }),
    ).toEqual({
      referralCode: 'ABC12',
      referredByUserId: null,
      referralCount: 3,
      referralBonusApplied: false,
    })
  })

  it('accepts valid referred_by uuid', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000'
    expect(remoteReferralFromDbRow({ referral_code: null, referred_by: id, referral_count: 0 })).toEqual({
      referralCode: null,
      referredByUserId: id,
      referralCount: 0,
      referralBonusApplied: false,
    })
  })
})

describe('profileReferralColumnsForUpsert', () => {
  it('includes referred_by only when set', () => {
    const base: AppMeta = {
      sessionsServed: 0,
      first20Seen: 0,
      first20Tapped: 0,
      alphaFrozen: false,
      alphaValue: 1,
    }
    expect(profileReferralColumnsForUpsert({ ...base, referralCode: 'abcd1234' })).toEqual({
      referral_code: 'ABCD1234',
    })
    expect(
      profileReferralColumnsForUpsert({
        ...base,
        referralCode: 'x',
        referredByUserId: '550e8400-e29b-41d4-a716-446655440000',
      }),
    ).toEqual({
      referral_code: 'X',
      referred_by: '550e8400-e29b-41d4-a716-446655440000',
    })
    expect(profileReferralColumnsForUpsert({ ...base, referralCode: null })).toEqual({})
  })
})

describe('generateReferralCodeCandidate', () => {
  it('produces 8 chars from alphabet', () => {
    const s = generateReferralCodeCandidate()
    expect(s).toHaveLength(8)
    expect(s).toMatch(/^[A-Z0-9]+$/)
  })
})
