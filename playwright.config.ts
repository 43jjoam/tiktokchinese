import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

/** Load .env.local into process.env so e2e and webServer see VITE_* (mirrors Vite behavior). */
function loadDotEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return
  const raw = fs.readFileSync(filePath, 'utf8')
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq <= 0) continue
    const key = t.slice(0, eq).trim()
    let val = t.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}

loadDotEnvFile(path.resolve(process.cwd(), '.env.local'))

/**
 * Reusing an already-running Vite often breaks e2e: that process may have been started without
 * `.env.local`, so `import.meta.env.VITE_SUPABASE_*` is empty, the Sign in button never mounts,
 * and only fetch-based tests (RLS) still pass. Opt in with PW_REUSE_DEV_SERVER=1 when you
 * intentionally share one dev server and it was started with the same env.
 */
const reuseExistingDevServer = process.env.PW_REUSE_DEV_SERVER === '1'

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  expect: {
    timeout: 25_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    ...devices['iPhone 13'],
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: reuseExistingDevServer,
    env: { ...process.env },
  },
})
