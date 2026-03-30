import { expect, test } from '@playwright/test'

function hasSupabaseEnv(): boolean {
  return Boolean(process.env.VITE_SUPABASE_URL?.trim() && process.env.VITE_SUPABASE_ANON_KEY?.trim())
}

/** 32 hex chars — valid format; server should respond not_found for an unknown token. */
const UNKNOWN_GIFT_TOKEN = 'a'.repeat(32)

test.describe('Gift deep link', () => {
  test('unknown token shows not_found messaging', async ({ page }) => {
    test.skip(!hasSupabaseEnv(), 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local')
    await page.goto(`/?g=${UNKNOWN_GIFT_TOKEN}`)
    await expect(page.getByRole('navigation')).toBeVisible()
    await expect(page.getByRole('alert')).toContainText(/couldn't find that gift link/i, {
      timeout: 35_000,
    })
  })
})
