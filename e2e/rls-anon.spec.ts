import { expect, test } from '@playwright/test'

function supabaseRestBase(): string | null {
  const u = process.env.VITE_SUPABASE_URL?.trim()
  if (!u) return null
  return u.replace(/\/$/, '')
}

function anonKey(): string | null {
  return process.env.VITE_SUPABASE_ANON_KEY?.trim() || null
}

test.describe('RLS: anon cannot write protected tables', () => {
  test('POST engagement_events with anon key is rejected', async () => {
    test.skip(!supabaseRestBase() || !anonKey(), 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local')
    const base = supabaseRestBase()!
    const key = anonKey()!
    const res = await fetch(`${base}/rest/v1/engagement_events`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        type: 'like',
        word_id: 'rls_smoke_word',
        clip_key: 'rls_smoke',
        device_hash: '0123456789abcdef',
      }),
    })
    expect(res.status).not.toBe(201)
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  test('POST gift_tokens with anon key is rejected', async () => {
    test.skip(!supabaseRestBase() || !anonKey(), 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local')
    const base = supabaseRestBase()!
    const key = anonKey()!
    const res = await fetch(`${base}/rest/v1/gift_tokens`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        token: 'a'.repeat(32),
        word_id: 'rls_smoke_gift_word',
        sender_device_hash: '0123456789abcdef',
        character: '\u6d4b',
        pinyin: 'ce4',
        en_meaning: 'test',
        storage_path: 'x/y.mp4',
        storage_bucket: 'bucket',
      }),
    })
    expect(res.status).not.toBe(201)
    expect(res.status).toBeGreaterThanOrEqual(400)
  })
})
