import { expect, test } from '@playwright/test'

function hasSupabaseEnv(): boolean {
  return Boolean(process.env.VITE_SUPABASE_URL?.trim() && process.env.VITE_SUPABASE_ANON_KEY?.trim())
}

test.describe('Sign in sheet', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('navigation')).toBeVisible()
  })

  test('sign-in button visible when Supabase is configured', async ({ page }) => {
    test.skip(!hasSupabaseEnv(), 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local')
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
  })

  test('sign-in sheet opens and closes', async ({ page }) => {
    test.skip(!hasSupabaseEnv(), 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page.getByPlaceholder(/example\.com|email/i)).toBeVisible()
    // Backdrop is full-viewport; a center click hits the dialog. Escape matches modal dismiss.
    await page.keyboard.press('Escape')
    await expect(page.getByPlaceholder(/example\.com|email/i)).not.toBeVisible()
  })

  test('invalid email disables submit', async ({ page }) => {
    test.skip(!hasSupabaseEnv(), 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.getByPlaceholder(/example\.com|email/i).fill('notanemail')
    await expect(
      page.getByRole('button', { name: /preserve my progress|continue the journey/i }),
    ).toBeDisabled()
  })

  test('valid email enables submit', async ({ page }) => {
    test.skip(!hasSupabaseEnv(), 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.getByPlaceholder(/example\.com|email/i).fill('test@example.com')
    await expect(
      page.getByRole('button', { name: /preserve my progress|continue the journey/i }),
    ).toBeEnabled()
  })
})
