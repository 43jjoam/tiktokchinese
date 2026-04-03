import type { AppMeta } from './storage'

/** Mirrors `user_learning_profiles` referral columns; synced on cloud save / merge. */
export type RemoteReferralFields = {
  referralCode: string | null
  referredByUserId: string | null
  referralCount: number
  /** Server: true after referral bonus trigger awarded +10 cards (invitee row). */
  referralBonusApplied: boolean
}

export const DEFAULT_REMOTE_REFERRAL_FIELDS: RemoteReferralFields = {
  referralCode: null,
  referredByUserId: null,
  referralCount: 0,
  referralBonusApplied: false,
}

type ReferralRow = {
  referral_code?: string | null
  referred_by?: string | null
  referral_count?: number | null
  referral_bonus_applied?: boolean | null
}

/**
 * Any hyphenated 128-bit UUID string Postgres accepts (not only RFC4122 v1–v4).
 * A stricter regex (version/variant nibbles) caused valid referrer ids to be dropped here so
 * `referred_by` was omitted from upserts while `meta.referredByUserId` was still set locally.
 */
const UUID_HEX_WITH_HYPHENS =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function normalizeReferredByUuid(raw: string | null | undefined): string | null {
  const t = typeof raw === 'string' ? raw.trim() : ''
  return t && UUID_HEX_WITH_HYPHENS.test(t) ? t : null
}

export function remoteReferralFromDbRow(row: ReferralRow | null | undefined): RemoteReferralFields {
  if (!row) return { ...DEFAULT_REMOTE_REFERRAL_FIELDS }
  const code = row.referral_code
  const ref = normalizeReferredByUuid(row.referred_by ?? undefined)
  return {
    referralCode: typeof code === 'string' && code.trim().length > 0 ? code.trim().toUpperCase() : null,
    referredByUserId: ref,
    referralCount: Math.max(0, Math.floor(Number(row.referral_count ?? 0)) || 0),
    referralBonusApplied: row.referral_bonus_applied === true,
  }
}

/**
 * Columns for PostgREST `upsert`. Omit `referral_count` — server-owned (Step 8).
 * Omit `referral_code` / `referred_by` when unset so we never send NULL and wipe existing DB values on update.
 */
export function profileReferralColumnsForUpsert(meta: AppMeta): ReferralRow {
  const c = meta.referralCode?.trim()
  const ref = normalizeReferredByUuid(meta.referredByUserId ?? undefined)
  const out: ReferralRow = {}
  if (c) out.referral_code = c.toUpperCase()
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
