#!/usr/bin/env node
/**
 * Copies your mascot MP4 into the right place. You only need the file on your Mac.
 *
 *   npm run mascot:install -- ~/Downloads/my-cat.mp4
 *
 * Or drag the file into Terminal after "npm run mascot:install -- " (with a space at the end).
 */
import { copyFileSync, existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const srcArg = process.argv[2]
const dest = resolve(process.cwd(), 'public/images/swipe-left-mascot.mp4')

if (!srcArg) {
  console.log(`
No file given. Do this:

  1. Put your MP4 somewhere easy (e.g. Desktop or Downloads).
  2. In Terminal, type:  npm run mascot:install --
  3. Type a space, then DRAG the MP4 file into the Terminal window (it pastes the path).
  4. Press Enter.

You can skip all of this — the app already uses swipe-left-mascot.png without any MP4.
`)
  process.exit(1)
}

const src = resolve(srcArg.replace(/^['"]|['"]$/g, ''))

if (!existsSync(src)) {
  console.error('File not found:', src)
  process.exit(1)
}

let st
try {
  st = statSync(src)
} catch {
  console.error('Cannot read:', src)
  process.exit(1)
}

if (!st.isFile()) {
  console.error('Not a file:', src)
  process.exit(1)
}

copyFileSync(src, dest)
console.log('\nDone. Saved as public/images/swipe-left-mascot.mp4')
console.log('Restart: npm run dev\n')
