import React, { useCallback, useEffect, useState } from 'react'
import { activateCode, getActivatedDecks, type DeckInfo } from '../lib/deckService'
import DeckCatalogGrid from './DeckCatalogGrid'

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

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">My Decks</h2>
        <p className="mt-1.5 text-xs text-white/45 leading-relaxed">
          After purchase, your activation code is sent to the email address you provide at checkout.
        </p>
        <DeckCatalogGrid decks={decks} />
      </div>
    </div>
  )
}
