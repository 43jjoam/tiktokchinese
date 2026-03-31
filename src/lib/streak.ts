import type { AppMeta } from './storage'

/** Matches journey doc streak pool (+10/day, max +30 from streak). */
const STREAK_BONUS_CARDS_MAX = 30

/** UTC calendar day `YYYY-MM-DD` (matches `user_learning_profiles.last_active_date`). */
export function utcCalendarDayIso(nowMs: number = Date.now()): string {
  return new Date(nowMs).toISOString().slice(0, 10)
}

export function utcCalendarDayIsoYesterday(nowMs: number = Date.now()): string {
  const d = new Date(nowMs)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

function validYmd(d: string | null | undefined): string | null {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null
  return d
}

/**
 * Daily streak: the first time the learner qualifies on a UTC calendar day, bump streak and totals.
 * Intended to run once when Home marks the **first card of the session** as playable (`sessionVideoIndex === 0`).
 *
 * Persistence: callers merge into `AppMeta` and save via `VideoFeed`’s `persisted` → localStorage.
 * **Signed-in users:** `VideoFeed` debounces `uploadLearningProfileWithLocalMeta()` on `persisted` changes;
 * `profileStatsColumnsForUpsert` sends `last_active_date`, `current_streak`, `total_days_active` to
 * `user_learning_profiles`. **Not signed in:** streak exists only locally until they sign in and sync.
 *
 * - Same day as `lastActiveDate`: no-op.
 * - First ever / invalid prior: streak → 1, `totalDaysActive` +1.
 * - Prior day was yesterday: streak +1, `totalDaysActive` +1.
 * - Gap (missed days): streak → 1, `totalDaysActive` +1.
 */
export function applyStreakForFirstWatchOfDay(meta: AppMeta, nowMs: number = Date.now()): AppMeta {
  const today = utcCalendarDayIso(nowMs)
  const last = validYmd(meta.lastActiveDate)

  if (last === today) return meta

  const yesterday = utcCalendarDayIsoYesterday(nowMs)
  const prevStreak = Math.max(0, Math.floor(meta.currentStreak ?? 0))
  const totalPrev = Math.max(0, Math.floor(meta.totalDaysActive ?? 0))

  let nextStreak: number
  if (last === null) {
    nextStreak = 1
  } else if (last === yesterday) {
    nextStreak = prevStreak + 1
  } else {
    nextStreak = 1
  }

  let streakBonusCards = Math.max(0, Math.floor(meta.streakBonusCards ?? 0))
  if (last !== null) {
    streakBonusCards = Math.min(STREAK_BONUS_CARDS_MAX, streakBonusCards + 10)
  }

  let conversionFeedLockedUntil = meta.conversionFeedLockedUntil
  if (conversionFeedLockedUntil != null && nowMs >= conversionFeedLockedUntil) {
    conversionFeedLockedUntil = undefined
  }

  return {
    ...meta,
    lastActiveDate: today,
    currentStreak: nextStreak,
    totalDaysActive: totalPrev + 1,
    streakBonusCards,
    conversionFeedLockedUntil,
  }
}
