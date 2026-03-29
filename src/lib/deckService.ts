import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUuidV4 } from './randomUuid'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const LOCAL_KEY = 'tiktokchinese_activated_decks'

let supabase: SupabaseClient | null = null
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: true,
      persistSession: true,
    },
  })
}

/** Shared browser client (anon) for storage signed URLs, deck activation, etc. */
export function getSupabaseClient(): SupabaseClient | null {
  return supabase
}

export type DeckInfo = {
  id: string
  name: string
  cover_image_url: string
  shopify_url: string | null
}

/** Free built-in deck; always first in Library → My Decks. */
export const BUILTIN_CHINESE_CHARACTERS_1: DeckInfo = {
  id: 'builtin-chinese-characters-1',
  name: 'Chinese Characters 1',
  cover_image_url: '/decks/chinese-characters-1.png',
  shopify_url: null,
}

function getDeviceId(): string {
  let uid = localStorage.getItem('tiktokchinese_uid')
  if (!uid) {
    uid = randomUuidV4()
    localStorage.setItem('tiktokchinese_uid', uid)
  }
  return uid
}

function getLocalDecks(): DeckInfo[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]')
  } catch {
    return []
  }
}

function saveLocalDecks(decks: DeckInfo[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(decks))
}

const ACTIVATE_TIMEOUT_MS = 45_000

/** Paste-friendly variants so email/UI casing and spaces still match the DB row. */
function activationCodeLookupValues(trimmed: string): string[] {
  const t = trimmed.trim()
  if (!t) return []
  const noSpace = t.replace(/\s+/g, '')
  return [
    ...new Set([
      t,
      t.toUpperCase(),
      t.toLowerCase(),
      noSpace,
      noSpace.toUpperCase(),
      noSpace.toLowerCase(),
    ]),
  ].filter((c) => c.length > 0)
}

function formatActivateSupabaseError(
  step: 'look up' | 'save' | 'load deck',
  err: { message?: string; code?: string } | null | undefined,
): string {
  const msg = (err?.message ?? '').trim()
  const code = (err?.code ?? '').trim()
  const combined = `${msg} ${code}`.toLowerCase()

  if (import.meta.env.DEV && (msg || code)) {
    return `Could not ${step} this code (dev: ${msg || code}). Check Supabase RLS for anon on activation_codes / decks.`
  }

  if (/jwt|permission|policy|rls|42501|pgrst301|not authorized/i.test(combined)) {
    return `Could not ${step} this code: the server blocked access (RLS / API policy). In Supabase, allow anon SELECT+UPDATE on activation_codes and SELECT on decks — see supabase/rls_activation_and_decks.sql.`
  }

  if (/invalid|malformed|fetch|network|failed to fetch/i.test(combined)) {
    return `Could not ${step} this code: network or bad Supabase URL. Check VITE_SUPABASE_URL and that the project is running.`
  }

  return msg ? `Could not ${step} this code: ${msg}` : `Could not ${step} this code. Try again.`
}

function activateCodeTimedOutError(): { success: false; error: string } {
  return {
    success: false,
    error:
      'Request timed out. Check your network, VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, and that Supabase allows anon read/update on activation_codes and read on decks.',
  }
}

async function activateCodeInner(
  trimmed: string,
  deviceId: string,
): Promise<{ success: boolean; deck?: DeckInfo; error?: string }> {
  if (!supabase) {
    return { success: false, error: 'Activation service is not configured.' }
  }

  const candidates = activationCodeLookupValues(trimmed)
  const { data: rows, error: fetchErr } = await supabase
    .from('activation_codes')
    .select('id, code, deck_id, redeemed_by')
    .in('code', candidates)

  if (fetchErr) return { success: false, error: formatActivateSupabaseError('look up', fetchErr) }

  const list = rows ?? []
  if (list.length === 0) return { success: false, error: 'Invalid activation code.' }

  let codeRow: (typeof list)[number] | null = null
  for (const c of candidates) {
    const hit = list.find((r) => r.code === c)
    if (hit) {
      codeRow = hit
      break
    }
  }
  if (!codeRow) codeRow = list[0]

  if (codeRow.redeemed_by && codeRow.redeemed_by !== deviceId) {
    return { success: false, error: 'This code has already been used.' }
  }
  if (codeRow.redeemed_by === deviceId) {
    const { data: deck, error: deckErr } = await supabase
      .from('decks')
      .select('id, name, cover_image_url, shopify_url')
      .eq('id', codeRow.deck_id)
      .maybeSingle()
    if (deckErr) return { success: false, error: formatActivateSupabaseError('load deck', deckErr) }
    if (deck) return { success: true, deck: deck as DeckInfo }
    return { success: false, error: 'Deck not found.' }
  }

  const { error: updateErr } = await supabase
    .from('activation_codes')
    .update({ redeemed_by: deviceId, redeemed_at: new Date().toISOString() })
    .eq('id', codeRow.id)

  if (updateErr) return { success: false, error: formatActivateSupabaseError('save', updateErr) }

  const { data: deck, error: deckErr } = await supabase
    .from('decks')
    .select('id, name, cover_image_url, shopify_url')
    .eq('id', codeRow.deck_id)
    .maybeSingle()

  if (deckErr) return { success: false, error: formatActivateSupabaseError('load deck', deckErr) }
  if (!deck) return { success: false, error: 'Deck not found.' }

  const deckInfo = deck as DeckInfo
  const local = getLocalDecks()
  if (!local.some((d) => d.id === deckInfo.id)) {
    local.push(deckInfo)
    saveLocalDecks(local)
  }

  return { success: true, deck: deckInfo }
}

export async function activateCode(
  code: string,
): Promise<{ success: boolean; deck?: DeckInfo; error?: string }> {
  if (!supabase) {
    return { success: false, error: 'Activation service is not configured.' }
  }

  const deviceId = getDeviceId()
  const trimmed = code.trim()
  if (!trimmed) return { success: false, error: 'Please enter a code.' }

  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('ACTIVATE_TIMEOUT')), ACTIVATE_TIMEOUT_MS)
  })

  try {
    const result = await Promise.race([activateCodeInner(trimmed, deviceId), timeoutPromise])
    return result
  } catch (e) {
    if (e instanceof Error && e.message === 'ACTIVATE_TIMEOUT') {
      return activateCodeTimedOutError()
    }
    return { success: false, error: 'Activation failed. Try again.' }
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }
}

/**
 * Loads redeemed deck rows from Supabase and merges with localStorage.
 * Important: if `decks` returns [] (e.g. RLS blocks anon `select` on `decks`), we must not call
 * `saveLocalDecks([])` — that used to wipe a successful activation from localStorage.
 */
export async function getActivatedDecks(): Promise<DeckInfo[]> {
  if (!supabase) return getLocalDecks()

  const deviceId = getDeviceId()
  const local = getLocalDecks()

  const { data: codes } = await supabase
    .from('activation_codes')
    .select('deck_id')
    .eq('redeemed_by', deviceId)

  if (!codes || codes.length === 0) return local

  const deckIds = [...new Set(codes.map((c: { deck_id: string }) => c.deck_id))]
  const { data: decks } = await supabase
    .from('decks')
    .select('id, name, cover_image_url, shopify_url')
    .in('id', deckIds)

  const fromDb = (decks ?? []) as DeckInfo[]

  if (fromDb.length === 0) return local

  const byId = new Map<string, DeckInfo>()
  for (const d of local) byId.set(d.id, d)
  for (const d of fromDb) byId.set(d.id, d)
  const merged = [...byId.values()]
  saveLocalDecks(merged)
  return merged
}
