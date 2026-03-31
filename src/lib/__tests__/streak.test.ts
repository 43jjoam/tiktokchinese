import { describe, expect, it } from 'vitest'
import { applyStreakForFirstWatchOfDay, utcCalendarDayIso, utcCalendarDayIsoYesterday } from '../streak'
import { DEFAULT_STUDY_META } from '../storage'

describe('applyStreakForFirstWatchOfDay', () => {
  const noon = Date.UTC(2026, 2, 30, 12, 0, 0)

  it('first qualifying day: streak 1, totalDays 1', () => {
    const m = applyStreakForFirstWatchOfDay({ ...DEFAULT_STUDY_META }, noon)
    expect(m.lastActiveDate).toBe('2026-03-30')
    expect(m.currentStreak).toBe(1)
    expect(m.totalDaysActive).toBe(1)
  })

  it('second call same day is a no-op', () => {
    const once = applyStreakForFirstWatchOfDay({ ...DEFAULT_STUDY_META }, noon)
    const twice = applyStreakForFirstWatchOfDay(once, noon)
    expect(twice).toBe(once)
  })

  it('consecutive UTC day increments streak', () => {
    const day1 = applyStreakForFirstWatchOfDay({ ...DEFAULT_STUDY_META }, Date.UTC(2026, 2, 29, 8, 0, 0))
    expect(day1.lastActiveDate).toBe('2026-03-29')
    expect(day1.currentStreak).toBe(1)

    const day2 = applyStreakForFirstWatchOfDay(day1, Date.UTC(2026, 2, 30, 8, 0, 0))
    expect(day2.lastActiveDate).toBe('2026-03-30')
    expect(day2.currentStreak).toBe(2)
    expect(day2.totalDaysActive).toBe(2)
  })

  it('gap resets streak to 1 but still increments total days', () => {
    const withStreak = {
      ...DEFAULT_STUDY_META,
      lastActiveDate: '2026-03-25' as const,
      currentStreak: 5,
      totalDaysActive: 10,
    }
    const after = applyStreakForFirstWatchOfDay(withStreak, noon)
    expect(after.lastActiveDate).toBe('2026-03-30')
    expect(after.currentStreak).toBe(1)
    expect(after.totalDaysActive).toBe(11)
  })

  it('helpers return ISO date strings', () => {
    expect(utcCalendarDayIso(Date.UTC(2026, 0, 5, 0, 0, 0))).toBe('2026-01-05')
    expect(utcCalendarDayIsoYesterday(Date.UTC(2026, 0, 5, 12, 0, 0))).toBe('2026-01-04')
  })
})
