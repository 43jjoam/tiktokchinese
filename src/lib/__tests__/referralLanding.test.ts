import { describe, expect, it } from 'vitest'
import { normalizeReferralCodeParam } from '../referralLanding'

describe('normalizeReferralCodeParam', () => {
  it('accepts 8-char codes from the app alphabet', () => {
    expect(normalizeReferralCodeParam('ELZKSLCT')).toBe('ELZKSLCT')
    expect(normalizeReferralCodeParam('  elzkslct  ')).toBe('ELZKSLCT')
  })

  it('rejects wrong length or characters', () => {
    expect(normalizeReferralCodeParam('SHORT')).toBe(null)
    expect(normalizeReferralCodeParam('TOOLONG123')).toBe(null)
    expect(normalizeReferralCodeParam('O0I1L')).toBe(null)
  })
})
