import { AnimatePresence } from 'framer-motion'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { getAuthEmail, uploadLearningProfileWithLocalMeta } from '../lib/accountSync'
import { APP_EVENT, logAppEvent } from '../lib/appEvents'
import { tryNotifyReferrerJoinEmail } from '../lib/notifyReferrerJoin'
import { applyReferralCodeFromManualEntry } from '../lib/referralLanding'
import { fetchPublicCatalogCoverUrls } from '../lib/catalogCovers'
import { activateCode, getActivatedDecks, getSupabaseClient, type DeckInfo } from '../lib/deckService'
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
  const [authEmail, setAuthEmail] = useState<string | null>(null)
  const [authUserId, setAuthUserId] = useState<string | null>(null)
  const [friendInviteCode, setFriendInviteCode] = useState('')
  const [friendInviteBusy, setFriendInviteBusy] = useState(false)
  const [friendInviteMessage, setFriendInviteMessage] = useState<{ text: string; ok: boolean } | null>(
    null,
  )
  const activatePendingRef = useRef(0)
  const friendInvitePendingRef = useRef(0)

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

  useEffect(() => {
    const client = getSupabaseClient()
    if (!client) {
      setAuthEmail(null)
      setAuthUserId(null)
      return
    }
    void getAuthEmail().then(setAuthEmail)
    void client.auth.getSession().then(({ data: { session } }) => {
      setAuthUserId(session?.user?.id ?? null)
    })
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      setAuthEmail(session?.user?.email ?? null)
      setAuthUserId(session?.user?.id ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleActivate = useCallback(async () => {
    if (!code.trim()) return
    activatePendingRef.current += 1
    setActivating(true)
    setMessage(null)
    try {
      const result = await activateCode(code)
      if (result.success && result.deck) {
        logAppEvent(APP_EVENT.DECK_UNLOCKED, { deck_name: result.deck.name })
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

  const handleFriendInviteSubmit = useCallback(async () => {
    if (!friendInviteCode.trim()) return
    const uid = authUserId
    if (!uid) {
      setFriendInviteMessage({ text: 'Sign in from the Home tab to connect a friend invite.', ok: false })
      return
    }
    friendInvitePendingRef.current += 1
    setFriendInviteBusy(true)
    setFriendInviteMessage(null)
    try {
      const result = await applyReferralCodeFromManualEntry(friendInviteCode, uid)
      if (!result.ok) {
        logAppEvent(APP_EVENT.MANUAL_CODE_APPLY_FAILED, { reason: result.message })
        setFriendInviteMessage({ text: result.message, ok: false })
        return
      }
      const up = await uploadLearningProfileWithLocalMeta()
      if (!up.ok) {
        logAppEvent(APP_EVENT.MANUAL_CODE_APPLY_FAILED, { reason: 'upload', detail: up.error })
        setFriendInviteMessage({
          text: 'Invite saved locally but cloud sync failed. Open Home and try again in a moment.',
          ok: false,
        })
        return
      }
      logAppEvent(APP_EVENT.MANUAL_CODE_APPLIED)
      void tryNotifyReferrerJoinEmail()
      setFriendInviteMessage({
        text: 'Connected! You and your friend each get bonus cards when the server applies the reward.',
        ok: true,
      })
      setFriendInviteCode('')
    } catch (e) {
      console.error('[Library] friend invite', e)
      logAppEvent(APP_EVENT.MANUAL_CODE_APPLY_FAILED, {
        reason: 'exception',
        detail: e instanceof Error ? e.message : String(e),
      })
      setFriendInviteMessage({
        text: e instanceof Error ? e.message : 'Something went wrong. Try again.',
        ok: false,
      })
    } finally {
      friendInvitePendingRef.current -= 1
      if (friendInvitePendingRef.current < 0) friendInvitePendingRef.current = 0
      if (friendInvitePendingRef.current === 0) setFriendInviteBusy(false)
    }
  }, [friendInviteCode, authUserId])

  return (
    <div className="relative z-10 mx-auto h-dvh w-full max-w-lg overflow-y-auto bg-black px-5 pb-20 pt-4 md:max-w-xl">
      <AnimatePresence>
        {openDeck && (
          <DeckContentsPanel
            key={openDeck.id}
            deck={openDeck}
            onBack={() => setOpenDeck(null)}
            isSignedIn={Boolean(authEmail)}
          />
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
        <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Have an invite code from a friend?</h2>
        <p className="mt-1.5 text-xs text-white/45 leading-relaxed">
          Got a code by text instead of a link? Enter it here after you sign in — same reward as opening an invite
          link.
        </p>
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            value={friendInviteCode}
            onChange={(e) => setFriendInviteCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleFriendInviteSubmit()}
            placeholder="8-character code"
            disabled={!authUserId}
            className="flex-1 rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm uppercase tracking-wide text-white placeholder-white/30 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleFriendInviteSubmit}
            disabled={friendInviteBusy || !authUserId}
            className="shrink-0 rounded-lg bg-sky-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-sky-900/40 transition-colors hover:bg-sky-500 active:scale-[0.98] active:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
          >
            {friendInviteBusy ? '…' : 'Apply'}
          </button>
        </div>
        {friendInviteMessage && (
          <p className={`mt-2 text-xs ${friendInviteMessage.ok ? 'text-green-400' : 'text-red-400'}`}>
            {friendInviteMessage.text}
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
