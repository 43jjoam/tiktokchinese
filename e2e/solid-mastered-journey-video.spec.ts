import { test, expect } from '@playwright/test'

/**
 * Full recording: 痞 starts in “in progress” (mScore 4.15) → right swipe after ~2 loops
 * crosses Solid → roll/hold on Home → Profile → Learning progress → Characters · Mastered.
 *
 * Produces a .webm under solid-roll-artifacts/playwright-output/<run>/ (see Playwright folder).
 *
 *   npx vite --port 5176
 *   SOLID_ROLL_BASE_URL=http://127.0.0.1:5176 npx playwright test --config=e2e/playwright.solid-video.config.ts
 */
test.use({
  baseURL: process.env.SOLID_ROLL_BASE_URL ?? 'http://127.0.0.1:5176',
})

test('solid mastered journey video', async ({ page, context }) => {
  test.setTimeout(180_000)
  const far = Date.now() - 50 * 3600000
  await context.addInitScript((t0: number) => {
    localStorage.setItem(
      'stealthSwipe.wordStates.v1',
      JSON.stringify({
        'M-rogue-32': {
          word_id: 'M-rogue-32',
          mScore: 4.15,
          masteryConfirmed: false,
          consecutiveLoop1NoTapSessions: 0,
          lastLoop1NoTapAt: null,
          lastSeenAt: t0,
          sessionsSeen: 4,
        },
      }),
    )
    localStorage.setItem(
      'stealthSwipe.appMeta.v1',
      JSON.stringify({
        sessionsServed: 12,
        first20Seen: 5,
        first20Tapped: 0,
        alphaFrozen: true,
        alphaValue: 1.0,
      }),
    )
  }, far)

  await page.goto('/?w=M-rogue-32', { waitUntil: 'domcontentloaded', timeout: 90_000 })

  const feed = page.getByRole('application', { name: /Character feed/i })
  await feed.waitFor({ state: 'visible', timeout: 60_000 })
  await expect(page.getByText('痞', { exact: true }).first()).toBeVisible({ timeout: 90_000 })

  /* Let viewers see ~2 loops (PRD 5s each) before the swipe that crosses Solid */
  await page.waitForTimeout(11_000)

  await page.keyboard.press('ArrowRight')

  /* Roll overlay ~780ms + encouragement layer; hold so the clip is visible in the recording */
  await page.waitForTimeout(4500)

  const saveModal = page.getByRole('button', { name: /not now/i })
  if (await saveModal.isVisible().catch(() => false)) {
    await saveModal.click()
    await page.waitForTimeout(400)
  }
  const closeOverlay = page.getByRole('button', { name: /^close$/i })
  if (await closeOverlay.isVisible().catch(() => false)) {
    await closeOverlay.click()
    await page.waitForTimeout(250)
  }

  await page.getByRole('button', { name: /^profile$/i }).click()
  await expect(page.getByRole('navigation')).toBeVisible()

  await page.getByRole('button', { name: /open learning progress/i }).click()
  await expect(page.getByRole('dialog', { name: 'Learning progress' })).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: /^Mastered,/ }).first().click()
  await expect(page.getByRole('heading', { name: /Characters · Mastered/i })).toBeVisible({
    timeout: 15_000,
  })
  await page.waitForTimeout(3500)
})
