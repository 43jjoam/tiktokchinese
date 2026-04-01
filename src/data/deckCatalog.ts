import type { DeckInfo } from '../lib/deckService'
import { HSK1_CHECKOUT_URL } from '../lib/hsk1Checkout'

/** Shown under locked deck art + footer; same for every unpurchased product deck. */
export const LOCKED_DECK_UNLOCK_HINT =
  'Tap to purchase or enter an activation code to unlock'

export type CatalogDeck = {
  key: string
  title: string
  subtitle: string
  /** Short line on locked card art (e.g. "HSK 1"); falls back to `title`. */
  lockOverlayTitle?: string
  /**
   * HSK 2–6 and Pinyin: not purchasable/openable from Library; card shows product art + footer
   * like "HSK-2 coming soon". Only catalog key `hsk-1` is interactive (shop / contents).
   */
  comingSoon?: boolean
  shopUrl: string
  /** Same image as `decks.cover_image_url` when owned — shown dimmed for unpurchased cards. */
  previewCoverUrl?: string
  matches: (deck: DeckInfo) => boolean
  accent: 'emerald' | 'green' | 'teal' | 'sky' | 'indigo' | 'violet' | 'rose'
}

/**
 * Unpurchased card art (override order):
 * 1. `previewCoverUrl` on the catalog row
 * 2. `VITE_LIBRARY_DECK_PREVIEWS` JSON in `.env.local`
 * 3. `catalogCoverByKey` from `fetchPublicCatalogCoverUrls()` (Supabase `decks.cover_image_url`)
 */
export function getCatalogPreviewCoverUrl(item: CatalogDeck): string | undefined {
  const fromItem = item.previewCoverUrl?.trim()
  if (fromItem) return fromItem
  try {
    const raw = import.meta.env.VITE_LIBRARY_DECK_PREVIEWS?.trim()
    if (!raw) return undefined
    const map = JSON.parse(raw) as Record<string, unknown>
    const u = map[item.key]
    return typeof u === 'string' && u.trim() ? u.trim() : undefined
  } catch {
    return undefined
  }
}

function matchHskLevel(name: string, level: number): boolean {
  return new RegExp(`hsk[\\s_-]*${level}\\b`, 'i').test(name)
}

function matchPinyin(name: string): boolean {
  return /\bpinyin\b/i.test(name)
}

/** Direct Shopify product pages on bestling.net (grey cards open these). */
const product = (handle: string) => `https://bestling.net/products/${handle}`

/** Supabase `decks.id` values (same as shopify-webhook SKU_TO_DECK) for reliable Library “owned” UI. */
export const CATALOG_DECK_IDS = {
  hsk1: '4d0a4205-8770-4c0e-ad4c-90ea8401eea9',
  hsk2: '538ccb54-df66-4bac-a220-f651ad1ca392',
  hsk3: 'd1843746-2869-4bc9-bfce-a9e9e057fb87',
  hsk4: 'efc3925d-54bd-4304-8854-c34e22e64561',
  hsk5: 'efe88cf9-649c-4565-babb-5e14a2c1b7f2',
  hsk6: 'fbfec73c-413b-452c-9d75-8ee59e6cb6b8',
  pinyin: '53f85f39-2242-4b4f-8bbc-4b24cfb4fa74',
} as const

/** Map Supabase `decks.id` → `DECK_CATALOG` item `key` (used for unpurchased preview art from DB). */
export function catalogKeyFromDeckId(deckId: string): string | undefined {
  const entry = Object.entries(CATALOG_DECK_IDS).find(([, id]) => id === deckId)
  if (!entry) return undefined
  const shortKey = entry[0]
  if (shortKey.startsWith('hsk')) {
    return `hsk-${shortKey.slice(3)}`
  }
  return shortKey
}

/** Bottom strip on HSK 1 deck contents — matches Library messaging for other products. */
export const DECK_PROFILE_COMING_SOON_LINE_HSK1 = 'HSK 2–6 and Pinyin: coming soon'

/** Footer line for Library “coming soon” product cards (e.g. `HSK-2 coming soon`). */
export function formatCatalogComingSoonFooter(item: CatalogDeck): string {
  if (item.key.startsWith('hsk-')) {
    const n = item.key.slice('hsk-'.length)
    return `HSK-${n} coming soon`
  }
  if (item.key === 'pinyin') return 'Pinyin coming soon'
  return 'Coming soon'
}

export const DECK_CATALOG: CatalogDeck[] = [
  {
    key: 'hsk-1',
    title: 'HSK 1 Digital Flashcards',
    lockOverlayTitle: 'HSK 1',
    subtitle: 'Unlock with your purchase code',
    shopUrl: HSK1_CHECKOUT_URL,
    matches: (d) => d.id === CATALOG_DECK_IDS.hsk1 || matchHskLevel(d.name, 1),
    accent: 'emerald',
  },
  {
    key: 'hsk-2',
    title: 'HSK 2',
    subtitle: 'Digital flashcards',
    comingSoon: true,
    shopUrl:
      'https://bestling.net/products/hsk-2-digital-flashcards-learn-chinese-vocabulary-with-audio-support',
    matches: (d) => d.id === CATALOG_DECK_IDS.hsk2 || matchHskLevel(d.name, 2),
    accent: 'green',
  },
  {
    key: 'hsk-3',
    title: 'HSK 3',
    subtitle: 'Digital flashcards',
    comingSoon: true,
    shopUrl: product('hsk-3-digital-flashcards'),
    matches: (d) => d.id === CATALOG_DECK_IDS.hsk3 || matchHskLevel(d.name, 3),
    accent: 'teal',
  },
  {
    key: 'hsk-4',
    title: 'HSK 4',
    subtitle: 'Digital flashcards',
    comingSoon: true,
    shopUrl: product('hsk-4-digital-flashcards'),
    matches: (d) => d.id === CATALOG_DECK_IDS.hsk4 || matchHskLevel(d.name, 4),
    accent: 'sky',
  },
  {
    key: 'hsk-5',
    title: 'HSK 5',
    subtitle: 'Digital flashcards',
    comingSoon: true,
    shopUrl:
      'https://bestling.net/products/hsk-5-digital-flashcards?pr_prod_strat=e5_desc&pr_rec_id=1dc96617a&pr_rec_pid=9109905703149&pr_ref_pid=9108570833133&pr_seq=uniform',
    matches: (d) => d.id === CATALOG_DECK_IDS.hsk5 || matchHskLevel(d.name, 5),
    accent: 'indigo',
  },
  {
    key: 'hsk-6',
    title: 'HSK 6',
    subtitle: 'Digital flashcards',
    comingSoon: true,
    shopUrl:
      'https://bestling.net/products/hsk-6-digital-flashcards?pr_prod_strat=e5_desc&pr_rec_id=6316b7400&pr_rec_pid=9109915533549&pr_ref_pid=9109905703149&pr_seq=uniform',
    matches: (d) => d.id === CATALOG_DECK_IDS.hsk6 || matchHskLevel(d.name, 6),
    accent: 'violet',
  },
  {
    key: 'pinyin',
    title: 'Pinyin',
    subtitle: 'Flashcards',
    comingSoon: true,
    shopUrl: product('pinyin-flashcards'),
    matches: (d) => d.id === CATALOG_DECK_IDS.pinyin || matchPinyin(d.name),
    accent: 'rose',
  },
]

export function findOwnedDeck(item: CatalogDeck, decks: DeckInfo[]): DeckInfo | undefined {
  return decks.find((d) => item.matches(d))
}

export function catalogAccentClass(accent: CatalogDeck['accent'], owned: boolean): string {
  if (!owned) {
    return 'border-white/15 bg-black/30'
  }
  const map: Record<CatalogDeck['accent'], string> = {
    emerald:
      'border-emerald-400/50 bg-emerald-500/15 shadow-[0_0_24px_-4px_rgba(52,211,153,0.35)]',
    green:
      'border-green-400/50 bg-green-500/15 shadow-[0_0_24px_-4px_rgba(74,222,128,0.35)]',
    teal:
      'border-teal-400/50 bg-teal-500/15 shadow-[0_0_24px_-4px_rgba(45,212,191,0.35)]',
    sky:
      'border-sky-400/50 bg-sky-500/15 shadow-[0_0_24px_-4px_rgba(56,189,248,0.35)]',
    indigo:
      'border-indigo-400/50 bg-indigo-500/15 shadow-[0_0_24px_-4px_rgba(129,140,248,0.35)]',
    violet:
      'border-violet-400/50 bg-violet-500/15 shadow-[0_0_24px_-4px_rgba(167,139,250,0.35)]',
    rose:
      'border-rose-400/50 bg-rose-500/15 shadow-[0_0_24px_-4px_rgba(251,113,133,0.35)]',
  }
  return map[accent]
}

export function catalogBarGradient(accent: CatalogDeck['accent']): string {
  const map: Record<CatalogDeck['accent'], string> = {
    emerald: 'from-emerald-500/80 to-teal-600/80',
    green: 'from-green-500/80 to-emerald-600/80',
    teal: 'from-teal-500/80 to-cyan-600/80',
    sky: 'from-sky-500/80 to-blue-600/80',
    indigo: 'from-indigo-500/80 to-violet-600/80',
    violet: 'from-violet-500/80 to-purple-600/80',
    rose: 'from-rose-500/80 to-pink-600/80',
  }
  return map[accent]
}
