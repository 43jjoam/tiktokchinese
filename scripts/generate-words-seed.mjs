#!/usr/bin/env node
/**
 * Emits SQL INSERTs for public.words from src/data/words.ts + hsk1Words.ts (word_id values).
 * Run: node scripts/generate-words-seed.mjs > /tmp/words_seed.sql
 * Then execute the SQL in Supabase (table is source of truth for Edge validation).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

function extractWordIds(filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
  const ids = new Set()
  const re1 = /"word_id"\s*:\s*"([^"]+)"/g
  const re2 = /word_id\s*:\s*"([^"]+)"/g
  let m
  while ((m = re1.exec(text))) ids.add(m[1])
  while ((m = re2.exec(text))) ids.add(m[1])
  return ids
}

const a = extractWordIds(path.join(root, 'src/data/words.ts'))
const b = extractWordIds(path.join(root, 'src/data/hsk1Words.ts'))
const all = [...new Set([...a, ...b])].sort()

function sqlLiteral(s) {
  return `'${s.replace(/'/g, "''")}'`
}

console.log('-- Seed words for record-engagement validation (' + all.length + ' ids)')
console.log('INSERT INTO public.words (id, is_active) VALUES')
console.log(
  all.map((id) => `  (${sqlLiteral(id)}, true)`).join(',\n') +
    '\nON CONFLICT (id) DO UPDATE SET is_active = EXCLUDED.is_active;',
)
