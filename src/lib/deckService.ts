import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const LOCAL_KEY = 'tiktokchinese_activated_decks'

let supabase: SupabaseClient | null = null
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
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
    uid = crypto.randomUUID()
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

export async function activateCode(
  code: string,
): Promise<{ success: boolean; deck?: DeckInfo; error?: string }> {
  if (!supabase) {
    return { success: false, error: 'Activation service is not configured.' }
  }

  const deviceId = getDeviceId()
  const trimmed = code.trim()
  if (!trimmed) return { success: false, error: 'Please enter a code.' }

  const { data: codeRow, error: fetchErr } = await supabase
    .from('activation_codes')
    .select('id, code, deck_id, redeemed_by')
    .eq('code', trimmed)
    .maybeSingle()

  if (fetchErr) return { success: false, error: 'Failed to verify code. Try again.' }
  if (!codeRow) return { success: false, error: 'Invalid activation code.' }
  if (codeRow.redeemed_by && codeRow.redeemed_by !== deviceId) {
    return { success: false, error: 'This code has already been used.' }
  }
  if (codeRow.redeemed_by === deviceId) {
    const { data: deck } = await supabase
      .from('decks')
      .select('id, name, cover_image_url, shopify_url')
      .eq('id', codeRow.deck_id)
      .single()
    if (deck) return { success: true, deck: deck as DeckInfo }
    return { success: false, error: 'Deck not found.' }
  }

  const { error: updateErr } = await supabase
    .from('activation_codes')
    .update({ redeemed_by: deviceId, redeemed_at: new Date().toISOString() })
    .eq('id', codeRow.id)

  if (updateErr) return { success: false, error: 'Failed to activate code. Try again.' }

  const { data: deck } = await supabase
    .from('decks')
    .select('id, name, cover_image_url, shopify_url')
    .eq('id', codeRow.deck_id)
    .single()

  if (!deck) return { success: false, error: 'Deck not found.' }

  const deckInfo = deck as DeckInfo
  const local = getLocalDecks()
  if (!local.some((d) => d.id === deckInfo.id)) {
    local.push(deckInfo)
    saveLocalDecks(local)
  }

  return { success: true, deck: deckInfo }
}

export async function getActivatedDecks(): Promise<DeckInfo[]> {
  if (!supabase) return getLocalDecks()

  const deviceId = getDeviceId()

  const { data: codes } = await supabase
    .from('activation_codes')
    .select('deck_id')
    .eq('redeemed_by', deviceId)

  if (!codes || codes.length === 0) return getLocalDecks()

  const deckIds = codes.map((c: any) => c.deck_id)
  const { data: decks } = await supabase
    .from('decks')
    .select('id, name, cover_image_url, shopify_url')
    .in('id', deckIds)

  if (!decks) return getLocalDecks()

  const result = decks as DeckInfo[]
  saveLocalDecks(result)
  return result
}
