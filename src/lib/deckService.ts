import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUuidV4 } from './randomUuid'
import { getSupabaseFunctionsBaseUrl } from './supabaseFunctionsUrl'

const rawUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const rawKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()
const SUPABASE_URL =
  rawUrl && rawUrl.length > 0 ? rawUrl.replace(/\/+$/, '') : undefined
const SUPABASE_ANON_KEY = rawKey && rawKey.length > 0 ? rawKey : undefined
const LOCAL_KEY = 'tiktokchinese_activated_decks'

/** Edge Function `redeem-activation` (service role); falls back to direct PostgREST if missing or errors. */
const REDEEM_EDGE_TIMEOUT_MS = 22_000

let supabase: SupabaseClient | null = null
/** Anon REST only: no user JWT. Avoids auth refresh / session queues blocking activation when signed in. */
let supabaseLibraryApi: SupabaseClient | null = null
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      /* Implicit magic-link flow: works when the user opens the email in another app (e.g. Outlook)
       * or WebView. PKCE requires the code_verifier in the *same* browser that called signInWithOtp,
       * which often fails for mobile email clients. */
      flowType: 'implicit',
      detectSessionInUrl: true,
      persistSession: true,
    },
  })
  supabaseLibraryApi = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storageKey: 'tiktokchinese_library_anon',
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
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

function persistActivatedDeckIfNeeded(deck: DeckInfo): void {
  const local = getLocalDecks()
  if (!local.some((d) => d.id === deck.id)) {
    local.push(deck)
    saveLocalDecks(local)
  }
}

/**
 * Prefer Edge Function (service role, no browser RLS). Returns null → caller uses direct PostgREST.
 */
async function redeemActivationViaEdgeFunction(
  trimmed: string,
  deviceId: string,
): Promise<{ success: boolean; deck?: DeckInfo; error?: string } | null> {
  const base = getSupabaseFunctionsBaseUrl()
  const anon = SUPABASE_ANON_KEY
  if (!base || !anon) return null

  const ac = new AbortController()
  const tid = setTimeout(() => ac.abort(), REDEEM_EDGE_TIMEOUT_MS)
  try {
    const res = await fetch(`${base}/redeem-activation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anon}`,
        apikey: anon,
      },
      body: JSON.stringify({ code: trimmed, device_id: deviceId }),
      signal: ac.signal,
    })

    const text = await res.text()
    if (res.status === 404 || res.status === 429 || res.status >= 500) return null

    let parsed: { success?: boolean; deck?: DeckInfo; error?: string } = {}
    try {
      if (text) parsed = JSON.parse(text) as typeof parsed
    } catch {
      return null
    }

    if (!res.ok) {
      return { success: false, error: parsed.error ?? 'Activation failed. Try again.' }
    }

    if (parsed.success && parsed.deck) return { success: true, deck: parsed.deck }
    return { success: false, error: parsed.error ?? 'Activation failed.' }
  } catch {
    return null
  } finally {
    clearTimeout(tid)
  }
}

/* Up to ~3 sequential REST calls when falling back to direct client. */
const ACTIVATE_TIMEOUT_MS = 55_000

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

type ActivationCodeRow = {
  id: string
  code: string
  deck_id: string
  redeemed_by: string | null
}

/**
 * Not redeemed yet: SQL NULL, blank, or mistaken Table Editor placeholder (literal "EMPTY").
 * Do not use the word EMPTY as a value — leave the cell NULL for unused codes.
 */
function redeemedByIsUnset(value: string | null | undefined): boolean {
  const v = (value ?? '').trim()
  if (!v) return true
  if (/^empty$/i.test(v)) return true
  return false
}

/** Prefer an unredeemed row when duplicate code strings exist (bad data). */
function pickActivationCodeRow(list: ActivationCodeRow[], candidates: string[]): ActivationCodeRow | null {
  if (list.length === 0) return null
  const matching = list.filter((r) => candidates.includes(r.code))
  const pool = matching.length > 0 ? matching : list
  const free = pool.find((r) => redeemedByIsUnset(r.redeemed_by))
  return free ?? pool[0] ?? null
}

function sameDeviceRedemption(redeemedBy: string | null | undefined, deviceId: string): boolean {
  if (redeemedByIsUnset(redeemedBy)) return false
  return (redeemedBy ?? '').trim() === deviceId.trim()
}

function otherDeviceRedemption(redeemedBy: string | null | undefined, deviceId: string): boolean {
  if (redeemedByIsUnset(redeemedBy)) return false
  return (redeemedBy ?? '').trim() !== deviceId.trim()
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

  if (/abort|aborted|signal|timed?\s*out/i.test(combined)) {
    return `Could not ${step} this code: the request to Supabase took too long or was blocked. Try another network, disable VPN/ad blockers for this site, and confirm your Supabase project is not paused (Dashboard → project status).`
  }

  return msg ? `Could not ${step} this code: ${msg}` : `Could not ${step} this code. Try again.`
}

function activateCodeTimedOutError(): { success: false; error: string } {
  return {
    success: false,
    error:
      'Activation is taking too long. Open Supabase Dashboard and confirm the project is running (not paused). On your phone or laptop, try Wi‑Fi vs cellular, turn off VPN, and allow requests to *.supabase.co. Production builds must include VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. If it still fails, run supabase/rls_activation_and_decks.sql so anon (and authenticated) can SELECT/UPDATE activation_codes and SELECT decks.',
  }
}

async function activateCodeInner(
  trimmed: string,
  deviceId: string,
): Promise<{ success: boolean; deck?: DeckInfo; error?: string }> {
  const db = supabaseLibraryApi
  if (!db) {
    return { success: false, error: 'Activation service is not configured.' }
  }

  const candidates = activationCodeLookupValues(trimmed)
  const { data: rows, error: fetchErr } = await db
    .from('activation_codes')
    .select('id, code, deck_id, redeemed_by')
    .in('code', candidates)

  if (fetchErr) return { success: false, error: formatActivateSupabaseError('look up', fetchErr) }

  const list = (rows ?? []) as ActivationCodeRow[]
  if (list.length === 0) return { success: false, error: 'Invalid activation code.' }

  const codeRow = pickActivationCodeRow(list, candidates)
  if (!codeRow) return { success: false, error: 'Invalid activation code.' }

  if (import.meta.env.DEV) {
    console.debug('[activateCode]', {
      inputSample: trimmed.slice(0, 12),
      rowId: codeRow.id,
      hasRedeemedBy: Boolean((codeRow.redeemed_by ?? '').trim()),
    })
  }

  if (otherDeviceRedemption(codeRow.redeemed_by, deviceId)) {
    return { success: false, error: 'This code has already been used.' }
  }

  if (sameDeviceRedemption(codeRow.redeemed_by, deviceId)) {
    const { data: deck, error: deckErr } = await db
      .from('decks')
      .select('id, name, cover_image_url, shopify_url')
      .eq('id', codeRow.deck_id)
      .maybeSingle()
    if (deckErr) return { success: false, error: formatActivateSupabaseError('load deck', deckErr) }
    if (deck) return { success: true, deck: deck as DeckInfo }
    return { success: false, error: 'Deck not found.' }
  }

  /** Action plan §1 Cause C: confirm deck exists before consuming the code. */
  const { data: deckPre, error: deckPreErr } = await db
    .from('decks')
    .select('id, name, cover_image_url, shopify_url')
    .eq('id', codeRow.deck_id)
    .maybeSingle()

  if (deckPreErr) return { success: false, error: formatActivateSupabaseError('load deck', deckPreErr) }
  if (!deckPre) return { success: false, error: 'Deck not found.' }

  const { data: updated, error: updateErr } = await db
    .from('activation_codes')
    .update({ redeemed_by: deviceId, redeemed_at: new Date().toISOString() })
    .eq('id', codeRow.id)
    .or('redeemed_by.is.null,redeemed_by.eq.,redeemed_by.eq.EMPTY')
    .select('id')
    .maybeSingle()

  if (updateErr) return { success: false, error: formatActivateSupabaseError('save', updateErr) }
  if (!updated) {
    return { success: false, error: 'This code has already been used.' }
  }

  const deckInfo = deckPre as DeckInfo
  persistActivatedDeckIfNeeded(deckInfo)

  return { success: true, deck: deckInfo }
}

export async function activateCode(
  code: string,
): Promise<{ success: boolean; deck?: DeckInfo; error?: string }> {
  if (!supabaseLibraryApi) {
    return { success: false, error: 'Activation service is not configured.' }
  }

  const deviceId = getDeviceId()
  const trimmed = code.trim()
  if (!trimmed) return { success: false, error: 'Please enter a code.' }

  const edge = await redeemActivationViaEdgeFunction(trimmed, deviceId)
  if (edge !== null) {
    if (edge.success && edge.deck) persistActivatedDeckIfNeeded(edge.deck)
    return edge
  }

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
  const db = supabaseLibraryApi
  if (!db) return getLocalDecks()

  const deviceId = getDeviceId()
  const local = getLocalDecks()

  const { data: codes } = await db
    .from('activation_codes')
    .select('deck_id')
    .eq('redeemed_by', deviceId)

  if (!codes || codes.length === 0) return local

  const deckIds = [...new Set(codes.map((c: { deck_id: string }) => c.deck_id))]
  const { data: decks } = await db
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
