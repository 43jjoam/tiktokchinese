#!/usr/bin/env node
/**
 * Verifies Vite Supabase env is present (process.env first, then .env / .env.local).
 * Run: node scripts/check-supabase-env.mjs
 * CI:  SUPABASE_ENV_STRICT=1 node scripts/check-supabase-env.mjs  (exit 1 if missing)
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

function parseEnvFile(name) {
  const p = resolve(process.cwd(), name)
  if (!existsSync(p)) return {}
  const out = {}
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq <= 0) continue
    const key = t.slice(0, eq).trim()
    let val = t.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

const fileEnv = { ...parseEnvFile('.env'), ...parseEnvFile('.env.local') }
const url = process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY || fileEnv.VITE_SUPABASE_ANON_KEY
const strict = process.env.SUPABASE_ENV_STRICT === '1'

const ok = Boolean(url?.trim() && key?.trim())

if (!ok) {
  console.error(
    '[check-supabase-env] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.\n' +
      '  Add them to .env.local (see env.example) and restart the dev server.\n' +
      '  For production, set the same variables on your host before `vite build`.',
  )
  if (strict) process.exit(1)
  else process.exit(0)
}

let host = url.trim()
try {
  host = new URL(url).hostname
} catch {
  /* keep raw */
}
console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  OK — Supabase env is set

  URL host:  ${host}
  Anon key:  loaded (${key.trim().length} characters, not printed)

  Next:  npm run dev   (you should see a matching “Supabase env OK” line)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`)
process.exit(0)
