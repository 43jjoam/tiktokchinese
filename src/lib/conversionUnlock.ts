import type { AppMeta } from './storage'
import { DECK_CATALOG } from '../data/deckCatalog'
import { HSK1_CHECKOUT_URL } from './hsk1Checkout'
import type { DeckInfo } from './deckService'
import { BUILTIN_CHINESE_CHARACTERS_1 } from './deckService'
import { getWordsForDeck } from './deckWords'
import type { WordState } from './types'

/** Cold user: first conversion modal when this many distinct CC1 character videos have been watched. */
export const CONVERSION_UNIQUE_CC1_THRESHOLD_COLD = 20

/** Referred user (has referred_by): gate appears later because +10 bonus is banked on the server. */
export const CONVERSION_UNIQUE_CC1_THRESHOLD_REFERRED = 30

/** @deprecated Use CONVERSION_UNIQUE_CC1_THRESHOLD_COLD + getConversionUniqueCc1Threshold(meta) */
export const CONVERSION_UNIQUE_CC1_THRESHOLD = CONVERSION_UNIQUE_CC1_THRESHOLD_COLD

/** Streak path: +10 cards per return day, max +30 from streak (days 2–4). */
export const STREAK_BONUS_CARDS_PER_DAY = 10
export const STREAK_BONUS_CARDS_MAX = 30

/** Max unique CC1 videos without referring anyone (streak pool tops out here). */
export const FREE_CC1_UNIQUE_CAP_NO_REFERRAL = 50

/** After at least one successful referral (referral_count ≥ 1), ceiling rises to 66. */
export const FREE_CC1_UNIQUE_CAP_WITH_REFERRAL = 66

/** Marketing total for HSK 1 bundle + Character 1 deck (videos + characters). */
export const CONVERSION_HSK1_TOTAL_VIDEOS_CHARS = 166

const hsk1Catalog = DECK_CATALOG.find((c) => c.key === 'hsk-1')

/** HSK 1 purchase URL — direct-to-checkout (Shopify payment step). */
export function getHsk1ShopUrl(): string {
  return HSK1_CHECKOUT_URL
}

/** Free Character 1 pool size (for “X of Y” style copy). */
export function getCc1PoolSize(): number {
  return getWordsForDeck(BUILTIN_CHINESE_CHARACTERS_1).length
}

export function getCc1WordIds(): string[] {
  return getWordsForDeck(BUILTIN_CHINESE_CHARACTERS_1).map((w) => w.word_id)
}

export function countUniqueCc1VideosSeen(
  wordStates: Record<string, WordState>,
  cc1WordIds: readonly string[],
): number {
  let n = 0
  for (const id of cc1WordIds) {
    const s = wordStates[id]
    if (s && s.sessionsSeen > 0) n++
  }
  return n
}

export function hasActivatedHsk1(activatedDecks: DeckInfo[]): boolean {
  if (!hsk1Catalog) return false
  return activatedDecks.some((d) => hsk1Catalog.matches(d))
}

/**
 * First unlock prompt threshold: 20 + bonus cards (server referral/streak bonuses).
 * Referred users get a +10 fallback if server bonus hasn't synced yet.
 */
export function getConversionUniqueCc1Threshold(meta: AppMeta): number {
  const serverBonus = meta.bonusCardsUnlocked ?? 0
  const streakBonus = meta.streakBonusCards ?? 0
  // If referred but server bonus not yet synced, grant the expected +10 as a floor
  const referralFallback = serverBonus === 0 && meta.referredByUserId?.trim() ? 10 : 0
  return CONVERSION_UNIQUE_CC1_THRESHOLD_COLD + Math.max(serverBonus, referralFallback) + streakBonus
}

/** Final gate: only Buy remains (≥ FREE_CC1_UNIQUE_CAP_WITH_REFERRAL = 66). */
export function isFinalGateUniqueCc1(uniqueCc1Seen: number): boolean {
  return uniqueCc1Seen >= FREE_CC1_UNIQUE_CAP_WITH_REFERRAL
}

/**
 * Hard paywall: max unique CC1 videos before only Buy / Invite (50 cold path; 66 once you’ve referred someone).
 * First soft gate uses `getConversionUniqueCc1Threshold` (20 or 30), not this value.
 */
export function getHardCapUniqueCc1(meta: AppMeta): number {
  return (meta.referralCount ?? 0) >= 1 ? FREE_CC1_UNIQUE_CAP_WITH_REFERRAL : FREE_CC1_UNIQUE_CAP_NO_REFERRAL
}

/** Next local midnight (start of tomorrow) for “come back tomorrow” / soft dismiss. */
export function startOfNextLocalDayMs(): number {
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  t.setDate(t.getDate() + 1)
  return t.getTime()
}
