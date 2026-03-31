import type { AppMeta } from './storage'

/** Mirrors `user_learning_profiles` referral columns; synced on cloud save / merge. */
export type RemoteReferralFields = {
  referralCode: string | null
  referredByUserId: string | null
  referralCount: number
}

export const DEFAULT_REMOTE_REFERRAL_FIELDS: RemoteReferralFields = {
  referralCode: null,
  referredByUserId: null,
  referralCount: 0,
}

type ReferralRow = {
  referral_code?: string | null
  referred_by?: string | null
  referral_count?: number | null
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function remoteReferralFromDbRow(row: ReferralRow | null | undefined): RemoteReferralFields {
  if (!row) return { ...DEFAULT_REMOTE_REFERRAL_FIELDS }
  const code = row.referral_code
  const ref = row.referred_by
  return {
    referralCode: typeof code === 'string' && code.trim().length > 0 ? code.trim().toUpperCase() : null,
    referredByUserId: typeof ref === 'string' && UUID_RE.test(ref) ? ref : null,
    referralCount: Math.max(0, Math.floor(Number(row.referral_count ?? 0)) || 0),
  }
}

/**
 * Columns for PostgREST `upsert`. Omit `referral_count` — server-owned (Step 8). Omit `referred_by` when
 * unset so we do not clear an attributed referrer on update.
 */
export function profileReferralColumnsForUpsert(meta: AppMeta): ReferralRow {
  const c = meta.referralCode?.trim()
  const ref =
    meta.referredByUserId && UUID_RE.test(meta.referredByUserId) ? meta.referredByUserId : null
  const out: ReferralRow = {
    referral_code: c ? c.toUpperCase() : null,
  }
  if (ref) out.referred_by = ref
  return out
}

/** Uppercase alnum without ambiguous characters (8 chars). */
export function generateReferralCodeCandidate(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 8; i++) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)]!
  }
  return s
}

export function isReferralCodeUniqueViolation(error: { message?: string; code?: string }): boolean {
  const c = error.code
  if (c === '23505') return true
  const m = (error.message || '').toLowerCase()
  return m.includes('referral_code') && (m.includes('unique') || m.includes('duplicate'))
}
