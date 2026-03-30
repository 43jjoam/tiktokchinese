import { describe, expect, it } from 'vitest'

// Mirrors VideoFeed guest save-progress auto-prompt (notNow vs first20Seen).
function shouldPromptSaveProgress(notNow: number, seen: number): boolean {
  return (
    (notNow === 0 && seen >= 10) ||
    (notNow === 1 && seen >= 15) ||
    (notNow === 2 && seen >= 20)
  )
}

describe('guest save-progress swipe thresholds', () => {
  it('opens at 10 / 15 / 20 completed sessions per snooze tier', () => {
    expect(shouldPromptSaveProgress(0, 9)).toBe(false)
    expect(shouldPromptSaveProgress(0, 10)).toBe(true)
    expect(shouldPromptSaveProgress(1, 14)).toBe(false)
    expect(shouldPromptSaveProgress(1, 15)).toBe(true)
    expect(shouldPromptSaveProgress(2, 19)).toBe(false)
    expect(shouldPromptSaveProgress(2, 20)).toBe(true)
  })
})
