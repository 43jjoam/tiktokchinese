/**
 * No webServer — start Vite yourself, e.g. `npx vite --port 5176`.
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: 'solid-roll-m-rogue-32.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  expect: { timeout: 90_000 },
  use: {
    baseURL: process.env.SOLID_ROLL_BASE_URL ?? 'http://127.0.0.1:5176',
    trace: 'on-first-retry',
    /* Chromium: WebKit bundle often missing in CI/sandbox; viewport ≈ phone */
    ...devices['Desktop Chrome'],
    viewport: { width: 390, height: 844 },
  },
})
