import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from '@playwright/test'

/**
 * Phase 1b demo: 痞 (M-rogue-32) crosses Solid on one right swipe (SRS primed near 5).
 * Screenshots land in test-output dir (see Playwright reporter / testInfo.outputDir).
 *
 * Run with dev server: `npx vite --port 5176` then:
 *   SOLID_ROLL_BASE_URL=http://127.0.0.1:5176 npx playwright test e2e/solid-roll-m-rogue-32.spec.ts
 */
test.use({
  baseURL: process.env.SOLID_ROLL_BASE_URL ?? 'http://127.0.0.1:5176',
})

test('痞 solid roll overlay + vault cube (screenshots)', async ({ page, context }, testInfo) => {
  test.setTimeout(120_000)
  const shotDir = path.join(process.cwd(), 'solid-roll-artifacts')
  fs.mkdirSync(shotDir, { recursive: true })
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
        /* Stay under 10 so “save progress” modal does not block Profile tap */
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

  /* ~2 loops × 5s PRD — keyboard swipe uses same elapsed timer as real use */
  await page.waitForTimeout(11_000)

  await page.keyboard.press('ArrowRight')

  /* Roll overlay is z-[38] above encouragement (~400ms); grab a few frames */
  await page.waitForTimeout(180)
  await page.screenshot({ path: path.join(shotDir, '01-roll-180ms.png'), fullPage: true })
  await page.waitForTimeout(220)
  await page.screenshot({ path: path.join(shotDir, '02-roll-400ms.png'), fullPage: true })

  await page.waitForTimeout(600)
  await page.screenshot({ path: path.join(shotDir, '03-after-advance.png'), fullPage: true })

  const saveModal = page.getByRole('button', { name: /not now/i })
  if (await saveModal.isVisible().catch(() => false)) {
    await saveModal.click()
    await page.waitForTimeout(300)
  }
  const closeOverlay = page.getByRole('button', { name: /^close$/i })
  if (await closeOverlay.isVisible().catch(() => false)) {
    await closeOverlay.click()
    await page.waitForTimeout(200)
  }

  await page.getByRole('button', { name: /^profile$/i }).click()
  await expect(page.getByRole('navigation')).toBeVisible()

  await page.getByRole('button', { name: /open learning progress/i }).click()
  await expect(page.getByRole('dialog', { name: 'Learning progress' })).toBeVisible({ timeout: 15_000 })
  /* mScore ≥ 5 counts as Mastered (same as vault gold/solid cube) */
  await page.getByRole('button', { name: /^Mastered,/ }).first().click()
  await expect(page.getByRole('heading', { name: /Characters · Mastered/i })).toBeVisible({
    timeout: 10_000,
  })
  await page.waitForTimeout(800)
  await page.screenshot({ path: path.join(shotDir, '04-vault-grid-痞-mastered.png'), fullPage: true })
})
