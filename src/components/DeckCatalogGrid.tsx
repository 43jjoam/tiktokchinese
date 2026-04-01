import React, { useState } from 'react'
import { BUILTIN_CHINESE_CHARACTERS_1, type DeckInfo } from '../lib/deckService'
import { HSK1_CHECKOUT_URL } from '../lib/hsk1Checkout'
import {
  DECK_CATALOG,
  LOCKED_DECK_UNLOCK_HINT,
  catalogAccentClass,
  catalogBarGradient,
  findOwnedDeck,
  formatCatalogComingSoonFooter,
  getCatalogPreviewCoverUrl,
} from '../data/deckCatalog'

type Props = {
  decks: DeckInfo[]
  /** From Supabase `decks` — same covers as owned; shown dimmed when not purchased. */
  catalogCoverByKey?: Record<string, string>
  onSelectOwnedDeck: (deck: DeckInfo) => void
}

export default function DeckCatalogGrid({ decks, catalogCoverByKey, onSelectOwnedDeck }: Props) {
  const [hsk1CheckoutBusy, setHsk1CheckoutBusy] = useState(false)
  const builtin = BUILTIN_CHINESE_CHARACTERS_1
  const builtinBar = catalogBarGradient('emerald')

  return (
    <div className="mt-3 grid grid-cols-2 gap-3">
      <button
        type="button"
        onClick={() => onSelectOwnedDeck(builtin)}
        className={`overflow-hidden rounded-xl border text-left transition-transform active:scale-[0.98] ${catalogAccentClass('emerald', true)}`}
      >
        <div className="relative aspect-[3/4] w-full overflow-hidden">
          {builtin.cover_image_url ? (
            <img
              src={builtin.cover_image_url}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <>
              <div className={`absolute inset-0 bg-gradient-to-br ${builtinBar}`} />
              <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center p-3 text-center">
                <span className="text-xl font-bold leading-tight tracking-tight text-white drop-shadow">
                  {builtin.name}
                </span>
              </div>
            </>
          )}
        </div>
        <div className="px-3 py-2">
          <div className="truncate text-xs font-semibold text-white">{builtin.name}</div>
          <div className="truncate text-[10px] text-white/60">Tap for contents</div>
        </div>
      </button>

      {DECK_CATALOG.map((item) => {
        const matched = findOwnedDeck(item, decks)
        const owned = matched !== undefined
        /** Only HSK 1 opens the shop or deck contents; HSK 2–6 / Pinyin stay visible but non-interactive. */
        const canTap = item.key === 'hsk-1'
        const staticCatalogCard = !canTap
        const hideCoverTitleOverlay = owned && item.key === 'hsk-1'
        const bar = catalogBarGradient(item.accent)
        const previewCover =
          getCatalogPreviewCoverUrl(item) ?? catalogCoverByKey?.[item.key]
        const ownedCover = matched?.cover_image_url?.trim()
        /** Same product art as when owned; locked cards stay readable but muted vs purchased. */
        const coverUrl = ownedCover || previewCover
        const lockedDimmed = !owned && Boolean(coverUrl)
        const dimCoverArt = staticCatalogCard || lockedDimmed

        const onActivate = () => {
          if (!canTap) return
          if (owned && matched) {
            onSelectOwnedDeck(matched)
            return
          }
          if (item.key === 'hsk-1') {
            if (hsk1CheckoutBusy) return
            setHsk1CheckoutBusy(true)
            window.setTimeout(() => {
              window.location.href = HSK1_CHECKOUT_URL
            }, 50)
            return
          }
          window.open(item.shopUrl, '_blank', 'noopener')
        }

        const cardClassName = `overflow-hidden rounded-xl border text-left ${catalogAccentClass(item.accent, owned)} ${
          canTap ? 'transition-transform active:scale-[0.98]' : 'cursor-default'
        }`

        const coverBlock = (
          <div className="relative aspect-[3/4] w-full overflow-hidden">
            {coverUrl ? (
              <>
                <img
                  src={coverUrl}
                  alt=""
                  className={`absolute inset-0 h-full w-full object-cover ${
                    dimCoverArt ? 'brightness-[0.8] contrast-[0.9] saturate-[0.88]' : ''
                  }`}
                />
                {dimCoverArt ? (
                  <div
                    className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 via-black/28 to-black/45"
                    aria-hidden
                  />
                ) : null}
                {!hideCoverTitleOverlay ? (
                  <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center px-3 text-center">
                    <span
                      className={
                        dimCoverArt
                          ? 'text-2xl font-bold leading-tight tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)] sm:text-[1.65rem]'
                          : 'text-xl font-bold leading-tight tracking-tight text-white drop-shadow'
                      }
                    >
                      {staticCatalogCard
                        ? 'Coming soon'
                        : lockedDimmed
                          ? (item.lockOverlayTitle ?? item.title)
                          : (matched?.name ?? item.title)}
                    </span>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className={`absolute inset-0 bg-gradient-to-br ${bar} opacity-[0.55]`} />
                {!hideCoverTitleOverlay ? (
                  <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center px-3 text-center">
                    <span className="text-2xl font-bold leading-tight tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)] sm:text-[1.65rem]">
                      {staticCatalogCard ? 'Coming soon' : (item.lockOverlayTitle ?? item.title)}
                    </span>
                  </div>
                ) : null}
              </>
            )}
          </div>
        )

        const footerBlock = (
          <div className="px-3 py-2">
            {staticCatalogCard ? (
              <p className="text-[10px] font-medium leading-snug text-white/55">
                {formatCatalogComingSoonFooter(item)}
              </p>
            ) : (
              <>
                <div className={`text-xs font-semibold leading-tight ${owned ? 'truncate text-white' : 'text-white'}`}>
                  {owned ? (matched?.name ?? item.title) : (item.lockOverlayTitle ?? item.title)}
                </div>
                <div
                  className={`mt-0.5 text-[10px] leading-snug ${owned ? 'truncate text-white/60' : 'text-white/55'}`}
                >
                  {owned
                    ? 'Tap for contents'
                    : item.key === 'hsk-1' && hsk1CheckoutBusy
                      ? 'Securing Checkout...'
                      : LOCKED_DECK_UNLOCK_HINT}
                </div>
              </>
            )}
          </div>
        )

        if (!canTap) {
          return (
            <div
              key={item.key}
              className={cardClassName}
              aria-label={formatCatalogComingSoonFooter(item)}
            >
              {coverBlock}
              {footerBlock}
            </div>
          )
        }

        const hsk1Disabled = item.key === 'hsk-1' && hsk1CheckoutBusy
        return (
          <button
            key={item.key}
            type="button"
            onClick={onActivate}
            disabled={hsk1Disabled}
            className={`${cardClassName}${hsk1Disabled ? ' cursor-not-allowed opacity-80' : ''}`}
          >
            {coverBlock}
            {footerBlock}
          </button>
        )
      })}
    </div>
  )
}
