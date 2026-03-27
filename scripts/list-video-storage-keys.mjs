#!/usr/bin/env node
/** Prints unique video_storage_path values from src/data/words.ts (upload these to Storage). */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const p = resolve(process.cwd(), 'src/data/words.ts')
const s = readFileSync(p, 'utf8')
const paths = [...s.matchAll(/"video_storage_path":\s*"([^"]+)"/g)].map((m) => m[1])
const unique = [...new Set(paths)].sort()
console.log(`${unique.length} object key(s) to upload to your private bucket (root level):\n`)
for (const k of unique) console.log(k)
