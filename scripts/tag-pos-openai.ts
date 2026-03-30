/**
 * Optional LLM pass: propose pos_tag for each giftable row (merged words + hsk1Words).
 *
 * Requires OPENAI_API_KEY unless you pass `--stats` (no network).
 *
 *   npm run words:tag-pos-openai -- --stats
 *   npx tsx scripts/tag-pos-openai.ts > /tmp/pos_tag_proposals.json
 *
 * Allowed labels must match src/lib/posTag.ts (POS_TAGS).
 */
import { giftableEnglishGloss, mergedGiftableWords } from '../src/lib/giftableWordList.ts'
import { POS_TAGS, isPosTag, type PosTag } from '../src/lib/posTag.ts'
import type { WordMetadata } from '../src/lib/types.ts'

const list = mergedGiftableWords()

function parseArgs() {
  const stats = process.argv.includes('--stats')
  return { stats }
}

async function callOpenAiBatch(
  key: string,
  batch: WordMetadata[],
): Promise<Record<string, PosTag>> {
  const payload = batch.map((w) => ({
    word_id: w.word_id,
    character: w.character,
    pinyin: w.pinyin,
    en: giftableEnglishGloss(w),
  }))

  const ids = new Set(batch.map((w) => w.word_id))

  const body = {
    model: 'gpt-4o-mini',
    temperature: 0.2,
    response_format: { type: 'json_object' as const },
    messages: [
      {
        role: 'system' as const,
        content: `You label each Chinese vocabulary card with exactly one part of speech for beginner pedagogy.
Allowed labels (use these strings only): ${POS_TAGS.join(', ')}.
Return ONLY a JSON object mapping word_id -> label. Include every word_id from the user payload exactly once.`,
      },
      {
        role: 'user' as const,
        content: JSON.stringify(payload),
      },
    ],
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
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
  const out: Record<string, PosTag> = {}
  for (const [id, tag] of Object.entries(parsed)) {
    if (!isPosTag(tag)) {
      throw new Error(`Invalid pos_tag for ${id}: ${tag}`)
    }
    out[id] = tag
  }

  for (const id of ids) {
    if (!(id in out)) {
      throw new Error(`Missing pos_tag in model response for word_id: ${id}`)
    }
  }
  for (const id of Object.keys(out)) {
    if (!ids.has(id)) {
      throw new Error(`Unexpected word_id in model response: ${id}`)
    }
  }

  return out
}

async function main() {
  const { stats } = parseArgs()

  if (stats) {
    console.log(
      JSON.stringify(
        {
          giftableCount: list.length,
          sampleWordIds: list.slice(0, 8).map((w) => w.word_id),
          posTagsAllowed: POS_TAGS,
        },
        null,
        2,
      ),
    )
    return
  }

  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) {
    console.error('Set OPENAI_API_KEY, or run with --stats (no API).')
    process.exit(1)
  }

  const batchSize = 24
  const out: Record<string, PosTag> = {}

  for (let i = 0; i < list.length; i += batchSize) {
    const batch = list.slice(i, i + batchSize)
    const part = await callOpenAiBatch(key, batch)
    Object.assign(out, part)
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
