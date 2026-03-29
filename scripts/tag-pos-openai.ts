/**
 * Optional LLM pass: propose pos_tag for each giftable row (merged words + hsk1Words).
 *
 * Requires OPENAI_API_KEY. Does not write TS source; prints JSON to stdout for review:
 *   npx tsx scripts/tag-pos-openai.ts > /tmp/pos_tag_proposals.json
 *
 * Allowed labels must match src/lib/posTag.ts (POS_TAGS).
 */
import { words } from '../src/data/words.ts'
import { hsk1Words } from '../src/data/hsk1Words.ts'
import { POS_TAGS, isPosTag, type PosTag } from '../src/lib/posTag.ts'
import type { WordMetadata } from '../src/lib/types.ts'

function enMeaning(w: WordMetadata): string | null {
  const en = w.l1_meanings?.en?.trim()
  return en && en.length ? en : null
}

function giftable(w: WordMetadata): boolean {
  return Boolean(w.video_storage_path?.trim() && enMeaning(w))
}

const merged = new Map<string, WordMetadata>()
for (const w of words) {
  if (giftable(w)) merged.set(w.word_id, w)
}
for (const w of hsk1Words) {
  if (giftable(w)) merged.set(w.word_id, w)
}

const list = [...merged.values()].sort((a, b) => a.word_id.localeCompare(b.word_id))

async function main() {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) {
    console.error('Set OPENAI_API_KEY to run the LLM tagger.')
    process.exit(1)
  }

  const batchSize = 24
  const out: Record<string, PosTag> = {}

  for (let i = 0; i < list.length; i += batchSize) {
    const batch = list.slice(i, i + batchSize)
    const payload = batch.map((w) => ({
      word_id: w.word_id,
      character: w.character,
      pinyin: w.pinyin,
      en: enMeaning(w),
    }))

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: `You label each Chinese vocabulary card with exactly one part of speech for beginner pedagogy.
Allowed labels (use these strings only): ${POS_TAGS.join(', ')}.
Return ONLY a JSON object mapping word_id -> label, no markdown.`,
          },
          {
            role: 'user',
            content: JSON.stringify(payload),
          },
        ],
      }),
    })

    if (!res.ok) {
      const t = await res.text()
      throw new Error(`OpenAI HTTP ${res.status}: ${t.slice(0, 500)}`)
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    let raw = data.choices?.[0]?.message?.content?.trim() ?? ''
    if (raw.startsWith('```')) {
      raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
    }
    const parsed = JSON.parse(raw) as Record<string, string>
    for (const [id, tag] of Object.entries(parsed)) {
      if (!isPosTag(tag)) {
        throw new Error(`Invalid pos_tag for ${id}: ${tag}`)
      }
      out[id] = tag
    }
  }

  if (Object.keys(out).length !== list.length) {
    throw new Error(
      `Expected ${list.length} tags, got ${Object.keys(out).length}. Merge proposals manually or re-run.`,
    )
  }

  console.log(JSON.stringify(out, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
