import React from 'react'
import { BUILTIN_CHINESE_CHARACTERS_1, type DeckInfo } from '../lib/deckService'
import {
  DECK_CATALOG,
  LOCKED_DECK_UNLOCK_HINT,
  catalogAccentClass,
  catalogBarGradient,
  findOwnedDeck,
  getCatalogPreviewCoverUrl,
} from '../data/deckCatalog'

type Props = {
  decks: DeckInfo[]
  /** From Supabase `decks` — same covers as owned; shown dimmed when not purchased. */
  catalogCoverByKey?: Record<string, string>
  onSelectOwnedDeck: (deck: DeckInfo) => void
}

export default function DeckCatalogGrid({ decks, catalogCoverByKey, onSelectOwnedDeck }: Props) {
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
        const bar = catalogBarGradient(item.accent)
        const previewCover =
          getCatalogPreviewCoverUrl(item) ?? catalogCoverByKey?.[item.key]

        const onActivate = () => {
          if (owned && matched) {
            onSelectOwnedDeck(matched)
            return
          }
          window.open(item.shopUrl, '_blank', 'noopener')
        }

        return (
          <button
            key={item.key}
            type="button"
            onClick={onActivate}
            className={`overflow-hidden rounded-xl border text-left transition-transform active:scale-[0.98] ${catalogAccentClass(item.accent, owned)}`}
          >
            <div className="relative aspect-[3/4] w-full overflow-hidden">
              {owned && matched?.cover_image_url ? (
                <img
                  src={matched.cover_image_url}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : !owned ? (
                <>
                  {previewCover ? (
                    <>
                      <img
                        src={previewCover}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover brightness-[0.52] contrast-[0.82] saturate-[0.85]"
                      />
                      <div className="absolute inset-0 bg-black/32" />
                    </>
                  ) : (
                    <div className={`absolute inset-0 bg-gradient-to-br ${bar} opacity-[0.55]`} />
                  )}
                  <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center px-3 text-center">
                    <span className="text-2xl font-bold leading-tight tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)] sm:text-[1.65rem]">
                      {item.lockOverlayTitle ?? item.title}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className={`absolute inset-0 bg-gradient-to-br ${bar}`} />
                  <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center p-3 text-center">
                    <span className="text-xl font-bold leading-tight tracking-tight text-white drop-shadow">
                      {matched?.name ?? item.title}
                    </span>
                  </div>
                </>
              )}
            </div>
            <div className="px-3 py-2">
              <div className={`text-xs font-semibold leading-tight ${owned ? 'truncate text-white' : 'text-white'}`}>
                {owned ? (matched?.name ?? item.title) : (item.lockOverlayTitle ?? item.title)}
              </div>
              <div className={`mt-0.5 text-[10px] leading-snug ${owned ? 'truncate text-white/60' : 'text-white/55'}`}>
                {owned ? 'Tap for contents' : LOCKED_DECK_UNLOCK_HINT}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
