import React, { useCallback, useEffect, useState } from 'react'
import { activateCode, getActivatedDecks, type DeckInfo } from '../lib/deckService'
import DeckCatalogGrid from './DeckCatalogGrid'

const SHOP_URL =
  'https://bestling.net/collections/all?filter.p.product_type=flashcards&sort_by=title-ascending'

export default function LibraryTab() {
  const [code, setCode] = useState('')
  const [activating, setActivating] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [decks, setDecks] = useState<DeckInfo[]>([])

  useEffect(() => {
    getActivatedDecks().then(setDecks)
  }, [])

  const handleActivate = useCallback(async () => {
    if (!code.trim()) return
    setActivating(true)
    setMessage(null)
    const result = await activateCode(code)
    setActivating(false)

    if (result.success && result.deck) {
      setMessage({ text: `"${result.deck.name}" activated!`, ok: true })
      setCode('')
      setDecks((prev) =>
        prev.some((d) => d.id === result.deck!.id) ? prev : [...prev, result.deck!],
      )
    } else {
      setMessage({ text: result.error ?? 'Activation failed.', ok: false })
    }
  }, [code])

  return (
    <div className="relative z-10 h-dvh overflow-y-auto bg-black pb-20 pt-4 px-5">
      <h1 className="text-xl font-bold">Library</h1>

      {/* Shop link */}
      <button
        onClick={() => window.open(SHOP_URL, '_blank', 'noopener')}
        className="mt-4 flex w-full items-center gap-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-4 text-left shadow-lg active:scale-[0.98] transition-transform"
      >
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </svg>
        <div>
          <div className="text-sm font-semibold">Browse Flashcard Decks</div>
          <div className="text-xs text-white/70">Shop on bestling.net</div>
        </div>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto shrink-0 opacity-60">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      {/* Activation section */}
      <div className="mt-6">
        <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Activate a Deck</h2>
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleActivate()}
            placeholder="Enter activation code"
            className="flex-1 rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
          />
          <button
            onClick={handleActivate}
            disabled={activating || !code.trim()}
            className="rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold disabled:opacity-40 active:scale-95 transition-all"
          >
            {activating ? '...' : 'Activate'}
          </button>
        </div>
        {message && (
          <p className={`mt-2 text-xs ${message.ok ? 'text-green-400' : 'text-red-400'}`}>
            {message.text}
          </p>
        )}
      </div>

      {/* HSK 1–6 + Pinyin: grey until purchased, colored when activated */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">My Decks</h2>
        <p className="mt-1.5 text-xs text-white/40">
          All decks are available on{' '}
          <span className="text-white/55">bestling.net</span>. Grey = not yours yet · Color = purchased
          (activate with your code above).
        </p>
        <DeckCatalogGrid decks={decks} />
      </div>
    </div>
  )
}
