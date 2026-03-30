import { test, expect } from '@playwright/test'

test('profile tab opens learning progress sheet', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('navigation')).toBeVisible()
  await page.getByRole('button', { name: /^profile$/i }).click()
  await page.getByRole('button', { name: /open learning progress/i }).click()
  await expect(page.getByRole('dialog', { name: 'Learning progress' })).toBeVisible()
})
