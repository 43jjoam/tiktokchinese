#!/usr/bin/env node
/**
 * Wrapper for load-test/engagement.js (20 VUs). Requires k6 on PATH + staging env.
 *
 *   STAGING_FUNCTIONS_URL=https://xxx.supabase.co/functions/v1 STAGING_ANON_KEY=eyJ... npm run test:load
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const script = path.join(root, '..', 'load-test', 'engagement.js')

if (!process.env.STAGING_FUNCTIONS_URL?.trim() || !process.env.STAGING_ANON_KEY?.trim()) {
  console.error('[test:load] Set STAGING_FUNCTIONS_URL and STAGING_ANON_KEY (staging only; never production).')
  process.exit(1)
}

const r = spawnSync('k6', ['run', script], { stdio: 'inherit', shell: false })
process.exit(r.status ?? 1)
