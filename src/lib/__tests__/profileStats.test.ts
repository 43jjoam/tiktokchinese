import { describe, expect, it } from 'vitest'
import { profileStatsColumnsForUpsert, remoteStatsFromDbRow } from '../profileStats'
import type { AppMeta } from '../storage'

describe('remoteStatsFromDbRow', () => {
  it('defaults missing or invalid fields', () => {
    expect(remoteStatsFromDbRow(null)).toEqual({
      lastActiveDate: null,
      currentStreak: 0,
      totalDaysActive: 0,
      bonusCardsUnlocked: 0,
    })
    expect(
      remoteStatsFromDbRow({
        last_active_date: 'not-a-date',
        current_streak: -1,
        total_days_active: 2.7,
        bonus_cards_unlocked: 3,
      }),
    ).toEqual({
      lastActiveDate: null,
      currentStreak: 0,
      totalDaysActive: 2,
      bonusCardsUnlocked: 3,
    })
  })

  it('parses valid date', () => {
    expect(
      remoteStatsFromDbRow({
        last_active_date: '2026-03-30',
        current_streak: 5,
        total_days_active: 10,
        bonus_cards_unlocked: 0,
      }),
    ).toEqual({
      lastActiveDate: '2026-03-30',
      currentStreak: 5,
      totalDaysActive: 10,
      bonusCardsUnlocked: 0,
    })
  })
})

describe('profileStatsColumnsForUpsert', () => {
  it('maps meta to DB columns', () => {
    const meta: AppMeta = {
      sessionsServed: 0,
      first20Seen: 0,
      first20Tapped: 0,
      alphaFrozen: false,
      alphaValue: 1,
      lastActiveDate: '2026-01-15',
      currentStreak: 3,
      totalDaysActive: 20,
      bonusCardsUnlocked: 10,
    }
    expect(profileStatsColumnsForUpsert(meta)).toEqual({
      last_active_date: '2026-01-15',
      current_streak: 3,
      total_days_active: 20,
      bonus_cards_unlocked: 10,
    })
  })

  it('nulls invalid lastActiveDate', () => {
    const meta: AppMeta = {
      sessionsServed: 0,
      first20Seen: 0,
      first20Tapped: 0,
      alphaFrozen: false,
      alphaValue: 1,
      lastActiveDate: 'bad',
    }
    expect(profileStatsColumnsForUpsert(meta).last_active_date).toBeNull()
  })
})
