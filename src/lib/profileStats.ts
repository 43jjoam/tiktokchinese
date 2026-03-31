import type { AppMeta } from './storage'

/** Mirrors `user_learning_profiles` stats columns; synced on cloud save / merge. */
export type RemoteProfileStats = {
  /** UTC calendar day `YYYY-MM-DD` */
  lastActiveDate: string | null
  currentStreak: number
  totalDaysActive: number
  bonusCardsUnlocked: number
}

export const DEFAULT_REMOTE_PROFILE_STATS: RemoteProfileStats = {
  lastActiveDate: null,
  currentStreak: 0,
  totalDaysActive: 0,
  bonusCardsUnlocked: 0,
}

type StatsRow = {
  last_active_date?: string | null
  current_streak?: number | null
  total_days_active?: number | null
  bonus_cards_unlocked?: number | null
}

export function remoteStatsFromDbRow(row: StatsRow | null | undefined): RemoteProfileStats {
  if (!row) return { ...DEFAULT_REMOTE_PROFILE_STATS }
  return {
    lastActiveDate:
      typeof row.last_active_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.last_active_date)
        ? row.last_active_date
        : null,
    currentStreak: Math.max(0, Math.floor(Number(row.current_streak ?? 0)) || 0),
    totalDaysActive: Math.max(0, Math.floor(Number(row.total_days_active ?? 0)) || 0),
    bonusCardsUnlocked: Math.max(0, Math.floor(Number(row.bonus_cards_unlocked ?? 0)) || 0),
  }
}

/** Columns for PostgREST `upsert` on `user_learning_profiles`. */
export function profileStatsColumnsForUpsert(meta: AppMeta): StatsRow {
  const d = meta.lastActiveDate
  return {
    last_active_date:
      typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null,
    current_streak: meta.currentStreak ?? 0,
    total_days_active: meta.totalDaysActive ?? 0,
    bonus_cards_unlocked: meta.bonusCardsUnlocked ?? 0,
  }
}
