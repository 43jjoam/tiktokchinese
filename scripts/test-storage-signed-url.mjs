#!/usr/bin/env node
/**
 * Tests createSignedUrl for one lesson file (reads .env.local).
 * Run: npm run test:storage-url
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

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
const bucket =
  process.env.VITE_CHINESE_CHARACTERS_1_VIDEO_BUCKET ||
  fileEnv.VITE_CHINESE_CHARACTERS_1_VIDEO_BUCKET ||
  'chinese character 1 _videos'

const testPath = process.argv[2] || 'M-dad-01.mp4'

function keyCandidates(clean) {
  const spaced = clean.replace(/-/g, ' ')
  const m = clean.match(/^M-(.+)\.mp4$/i)
  const d = m ? `M  ${m[1].replace(/-/g, ' ')}.mp4` : null
  return [...new Set([clean, spaced, ...(d ? [d] : [])])]
}

if (!url?.trim() || !key?.trim()) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local')
  process.exit(1)
}

const keyHint = key.trim().slice(0, 12)
console.log('URL:', url.trim())
console.log('Key prefix:', keyHint + '…', key.trim().startsWith('sb_publishable') ? '(publishable)' : '(jwt-style)')
console.log('Bucket:', JSON.stringify(bucket))
console.log('Path:', testPath)
console.log('')

const client = createClient(url.trim(), key.trim())

const { data: listed, error: listErr } = await client.storage.from(bucket).list('', { limit: 100 })
if (!listErr && listed?.length) {
  console.log('Files at bucket root (first 100):')
  for (const f of listed) console.log(' ', f.name)
  console.log('')
} else if (listErr) {
  console.warn('Could not list bucket (policy may forbid listing):', listErr.message)
  console.log('')
}

let data
let error
let usedPath = testPath.trim()
for (const p of keyCandidates(testPath.trim())) {
  const r = await client.storage.from(bucket).createSignedUrl(p, 120)
  data = r.data
  error = r.error
  if (!error && data?.signedUrl) {
    usedPath = p
    break
  }
}

if (error || !data?.signedUrl) {
  console.error('createSignedUrl FAILED (tried hyphen, spaces, M + double-space):', error?.message)
  console.error('\nTypical fixes:')
  console.error('  • Use Legacy API keys → anon public (long eyJ… JWT), not service_role.')
  console.error('  • If you only have sb_publishable_…, try the legacy anon key for this app.')
  console.error('  • Bucket id must match exactly (spaces count):', JSON.stringify(bucket))
  console.error('  • Object key must match file in Storage root:', testPath)
  console.error('  • Run supabase/setup_chinese_characters_1_videos.sql policies.')
  console.error('  • "Object not found" = wrong bucket OR file is inside a folder (path must include folder, e.g. videos/M-dad-01.mp4).')
  process.exit(1)
}

console.log('createSignedUrl OK — Storage key used:', JSON.stringify(usedPath))
console.log('First 80 chars of signed URL:', data.signedUrl.slice(0, 80) + '…')
console.log('\nOpen that URL in a browser tab — it should download or play the MP4.')
