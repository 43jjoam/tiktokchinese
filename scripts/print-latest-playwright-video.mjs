#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const root = path.join(process.cwd(), 'solid-roll-artifacts', 'playwright-output')
if (!fs.existsSync(root)) {
  console.error('No output yet:', root)
  process.exit(1)
}
let bestMs = 0
let best = null
for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
  if (!ent.isDirectory()) continue
  const p = path.join(root, ent.name, 'video.webm')
  if (!fs.existsSync(p)) continue
  const ms = fs.statSync(p).mtimeMs
  if (ms > bestMs) {
    bestMs = ms
    best = p
  }
}
if (!best) {
  console.error('No video.webm found under', root)
  process.exit(1)
}
console.log(best)
