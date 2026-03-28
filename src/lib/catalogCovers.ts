import { CATALOG_DECK_IDS, catalogKeyFromDeckId } from '../data/deckCatalog'
import { getSupabaseClient } from './deckService'

/**
 * Loads `cover_image_url` for every catalog deck from `public.decks` (anon SELECT).
 * Same artwork as owned cards; Library shows it dimmed when the user has not purchased.
 */
export async function fetchPublicCatalogCoverUrls(): Promise<Record<string, string>> {
  const supabase = getSupabaseClient()
  if (!supabase) return {}

  const ids = Object.values(CATALOG_DECK_IDS) as string[]
  const { data, error } = await supabase.from('decks').select('id, cover_image_url').in('id', ids)

  if (error || !data?.length) return {}

  const out: Record<string, string> = {}
  for (const row of data as { id: string; cover_image_url: string | null }[]) {
    const key = catalogKeyFromDeckId(row.id)
    const url = row.cover_image_url?.trim()
    if (key && url) out[key] = url
  }
  return out
}
