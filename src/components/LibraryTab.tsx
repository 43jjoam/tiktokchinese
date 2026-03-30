import { AnimatePresence } from 'framer-motion'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { fetchPublicCatalogCoverUrls } from '../lib/catalogCovers'
import { activateCode, getActivatedDecks, type DeckInfo } from '../lib/deckService'
import { ACTIVATED_DECKS_CHANGED_EVENT } from '../lib/deckWords'
import DeckCatalogGrid from './DeckCatalogGrid'
import DeckContentsPanel from './DeckContentsPanel'

export default function LibraryTab() {
  const [code, setCode] = useState('')
  const [activating, setActivating] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [decks, setDecks] = useState<DeckInfo[]>([])
  const [openDeck, setOpenDeck] = useState<DeckInfo | null>(null)
  const [catalogCoverByKey, setCatalogCoverByKey] = useState<Record<string, string>>({})
  const activatePendingRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    void fetchPublicCatalogCoverUrls().then((map) => {
      if (!cancelled) setCatalogCoverByKey(map)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const sync = () => {
      void getActivatedDecks().then((d) => {
        if (!cancelled) setDecks(d)
      })
    }
    sync()
    window.addEventListener(ACTIVATED_DECKS_CHANGED_EVENT, sync)
    return () => {
      cancelled = true
      window.removeEventListener(ACTIVATED_DECKS_CHANGED_EVENT, sync)
    }
  }, [])

  const handleActivate = useCallback(async () => {
    if (!code.trim()) return
    activatePendingRef.current += 1
    setActivating(true)
    setMessage(null)
    try {
      const result = await activateCode(code)
      if (result.success && result.deck) {
        setMessage({ text: `"${result.deck.name}" activated!`, ok: true })
        setCode('')
        window.dispatchEvent(new Event(ACTIVATED_DECKS_CHANGED_EVENT))
      } else {
        setMessage({ text: result.error ?? 'Activation failed.', ok: false })
      }
    } catch (e) {
      console.error('[Library] activateCode', e)
      setMessage({
        text: e instanceof Error ? e.message : 'Activation failed. Try again.',
        ok: false,
      })
    } finally {
      activatePendingRef.current -= 1
      if (activatePendingRef.current < 0) activatePendingRef.current = 0
      if (activatePendingRef.current === 0) setActivating(false)
    }
  }, [code])

  return (
    <div className="relative z-10 h-dvh overflow-y-auto bg-black pb-20 pt-4 px-5">
      <AnimatePresence>
        {openDeck && (
          <DeckContentsPanel key={openDeck.id} deck={openDeck} onBack={() => setOpenDeck(null)} />
        )}
      </AnimatePresence>

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
            type="button"
            onClick={handleActivate}
            disabled={activating}
            className="shrink-0 rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-900/40 transition-colors hover:bg-indigo-500 active:scale-[0.98] active:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
          >
            {activating ? '…' : 'Activate'}
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

        <DeckCatalogGrid
          decks={decks}
          catalogCoverByKey={catalogCoverByKey}
          onSelectOwnedDeck={(d) => setOpenDeck(d)}
        />
      </div>
    </div>
  )
}
