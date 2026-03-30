/**
 * Records a WebM of the solid → mastered journey. Start Vite first, e.g. `npx vite --port 5176`.
 */
import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: 'solid-mastered-journey-video.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  outputDir: path.join(process.cwd(), 'solid-roll-artifacts', 'playwright-output'),
  expect: { timeout: 90_000 },
  use: {
    baseURL: process.env.SOLID_ROLL_BASE_URL ?? 'http://127.0.0.1:5176',
    trace: 'off',
    ...devices['Desktop Chrome'],
    viewport: { width: 390, height: 844 },
    video: 'on',
  },
})
