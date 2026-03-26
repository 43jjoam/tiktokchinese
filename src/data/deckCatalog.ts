import type { DeckInfo } from '../lib/deckService'

export type CatalogDeck = {
  key: string
  title: string
  subtitle: string
  shopUrl: string
  matches: (deck: DeckInfo) => boolean
  accent: 'emerald' | 'green' | 'teal' | 'sky' | 'indigo' | 'violet' | 'rose'
}

function matchHskLevel(name: string, level: number): boolean {
  return new RegExp(`hsk[\\s_-]*${level}\\b`, 'i').test(name)
}

function matchPinyin(name: string): boolean {
  return /\bpinyin\b/i.test(name)
}

const searchUrl = (q: string) =>
  `https://bestling.net/search?q=${encodeURIComponent(q)}`

export const DECK_CATALOG: CatalogDeck[] = [
  {
    key: 'hsk-1',
    title: 'HSK 1',
    subtitle: 'Digital flashcards',
    shopUrl: searchUrl('HSK 1 Digital Flashcards'),
    matches: (d) => matchHskLevel(d.name, 1),
    accent: 'emerald',
  },
  {
    key: 'hsk-2',
    title: 'HSK 2',
    subtitle: 'Digital flashcards',
    shopUrl: searchUrl('HSK 2 Digital Flashcards'),
    matches: (d) => matchHskLevel(d.name, 2),
    accent: 'green',
  },
  {
    key: 'hsk-3',
    title: 'HSK 3',
    subtitle: 'Digital flashcards',
    shopUrl: searchUrl('HSK 3 Digital Flashcards'),
    matches: (d) => matchHskLevel(d.name, 3),
    accent: 'teal',
  },
  {
    key: 'hsk-4',
    title: 'HSK 4',
    subtitle: 'Digital flashcards',
    shopUrl: searchUrl('HSK 4 Digital Flashcards'),
    matches: (d) => matchHskLevel(d.name, 4),
    accent: 'sky',
  },
  {
    key: 'hsk-5',
    title: 'HSK 5',
    subtitle: 'Digital flashcards',
    shopUrl: searchUrl('HSK 5 Digital Flashcards'),
    matches: (d) => matchHskLevel(d.name, 5),
    accent: 'indigo',
  },
  {
    key: 'hsk-6',
    title: 'HSK 6',
    subtitle: 'Digital flashcards',
    shopUrl: searchUrl('HSK 6 Digital Flashcards'),
    matches: (d) => matchHskLevel(d.name, 6),
    accent: 'violet',
  },
  {
    key: 'pinyin',
    title: 'Pinyin',
    subtitle: 'Flashcards',
    shopUrl: searchUrl('Pinyin Flashcards'),
    matches: (d) => matchPinyin(d.name),
    accent: 'rose',
  },
]

export function findOwnedDeck(item: CatalogDeck, decks: DeckInfo[]): DeckInfo | undefined {
  return decks.find((d) => item.matches(d))
}

export function catalogAccentClass(accent: CatalogDeck['accent'], owned: boolean): string {
  if (!owned) {
    return 'border-white/10 bg-white/[0.04] opacity-[0.72] grayscale'
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
