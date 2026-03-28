#!/usr/bin/env node
/**
 * Creates .env.local from env.example so you only fill two lines in an editor.
 * Run: npm run setup:env:blank
 */
import { copyFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const dest = resolve(process.cwd(), '.env.local')
if (existsSync(dest)) {
  console.error(`
  .env.local already exists — not overwriting.

  Open it in your editor and set:
    VITE_SUPABASE_URL=...
    VITE_SUPABASE_ANON_KEY=...

  Or delete .env.local and run:  npm run setup:env:blank
`)
  process.exit(1)
}

copyFileSync(resolve(process.cwd(), 'env.example'), dest)
console.log(`
  Created  ${dest}

  Next (in Cursor or any editor):
    1. Open .env.local
    2. Paste your Supabase Project URL after VITE_SUPABASE_URL=
    3. Paste your anon (public) key after VITE_SUPABASE_ANON_KEY=
       (Supabase: Project Settings → API → "anon" / "public" / publishable key — NOT service_role)

  Save the file, then:
    npm run check:supabase-env
    npm run dev
`)
