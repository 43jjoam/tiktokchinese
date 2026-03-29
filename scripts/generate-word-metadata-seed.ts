/**
 * Emits SQL INSERTs for public.word_metadata from src/data/words.ts + hsk1Words.ts.
 * Run: npx tsx scripts/generate-word-metadata-seed.ts > /tmp/word_metadata_seed.sql
 * Execute in Supabase after setup_gift_v0.sql, setup_word_metadata_pos_tag.sql, and words seed.
 */
import { words } from '../src/data/words.ts'
import { hsk1Words } from '../src/data/hsk1Words.ts'
import { resolvePosTag } from '../src/lib/inferPosTag.ts'
import type { WordMetadata } from '../src/lib/types.ts'

function sqlLiteral(s: string): string {
  return `'${s.replace(/'/g, "''")}'`
}

function enMeaning(w: WordMetadata): string | null {
  const en = w.l1_meanings?.en?.trim()
  return en && en.length ? en : null
}

function rowForWord(w: WordMetadata): {
  word_id: string
  character: string
  pinyin: string
  en_meaning: string
  video_storage_path: string
  video_storage_bucket: string | null
  pos_tag: string
} | null {
  const path = w.video_storage_path?.trim()
  const en = enMeaning(w)
  if (!path || !en) return null
  const bucket = w.video_storage_bucket?.trim() || null
  return {
    word_id: w.word_id,
    character: w.character,
    pinyin: w.pinyin,
    en_meaning: en,
    video_storage_path: path,
    video_storage_bucket: bucket,
    pos_tag: resolvePosTag(w),
  }
}

const merged = new Map<string, ReturnType<typeof rowForWord>>()
for (const w of words) {
  const r = rowForWord(w)
  if (r) merged.set(r.word_id, r)
}
for (const w of hsk1Words) {
  const r = rowForWord(w)
  if (r) merged.set(r.word_id, r)
}

const rows = [...merged.values()].sort((a, b) => a.word_id.localeCompare(b.word_id))

console.log('-- word_metadata rows (' + rows.length + ') for gift_tokens + Edge validation')
console.log(
  'INSERT INTO public.word_metadata (word_id, character, pinyin, en_meaning, video_storage_path, video_storage_bucket, pos_tag)',
)
console.log('VALUES')
console.log(
  rows
    .map(
      (r) =>
        `  (${sqlLiteral(r.word_id)}, ${sqlLiteral(r.character)}, ${sqlLiteral(r.pinyin)}, ${sqlLiteral(r.en_meaning)}, ${sqlLiteral(r.video_storage_path)}, ${r.video_storage_bucket ? sqlLiteral(r.video_storage_bucket) : 'NULL'}, ${sqlLiteral(r.pos_tag)})`,
    )
    .join(',\n') +
    '\nON CONFLICT (word_id) DO UPDATE SET\n' +
    '  character = EXCLUDED.character,\n' +
    '  pinyin = EXCLUDED.pinyin,\n' +
    '  en_meaning = EXCLUDED.en_meaning,\n' +
    '  video_storage_path = EXCLUDED.video_storage_path,\n' +
    '  video_storage_bucket = EXCLUDED.video_storage_bucket,\n' +
    '  pos_tag = EXCLUDED.pos_tag,\n' +
    '  updated_at = now();',
)
