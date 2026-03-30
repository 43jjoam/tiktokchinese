import { describe, expect, it } from 'vitest'
import { isValidEmail } from '../emailValidation'

describe('isValidEmail', () => {
  const valid = ['test@example.com', 'user+tag@domain.co.uk', 'a@b.io']

  const invalid = [
    '',
    'notanemail',
    'hello@',
    'hello@example',
    '@example.com',
    ' test@example.com',
    'test @example.com',
    '12345',
  ]

  it.each(valid)('accepts %s', (email) => {
    expect(isValidEmail(email)).toBe(true)
  })

  it.each(invalid)('rejects %j', (email) => {
    expect(isValidEmail(email)).toBe(false)
  })
})
