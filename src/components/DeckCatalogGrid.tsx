import React from 'react'
import { BUILTIN_CHINESE_CHARACTERS_1, type DeckInfo } from '../lib/deckService'
import {
  DECK_CATALOG,
  catalogAccentClass,
  catalogBarGradient,
  findOwnedDeck,
} from '../data/deckCatalog'

type Props = {
  decks: DeckInfo[]
  onSelectOwnedDeck: (deck: DeckInfo) => void
}

export default function DeckCatalogGrid({ decks, onSelectOwnedDeck }: Props) {
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
            <>
              <img
                src={builtin.cover_image_url}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-black/45" />
            </>
          ) : (
            <div className={`absolute inset-0 bg-gradient-to-br ${builtinBar}`} />
          )}
          <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center p-3 text-center">
            <span className="text-xl font-bold leading-tight tracking-tight text-white drop-shadow">
              {builtin.name}
            </span>
          </div>
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
                <>
                  <img
                    src={matched.cover_image_url}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/45" />
                </>
              ) : (
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${
                    owned ? bar : 'from-zinc-600 to-zinc-900'
                  }`}
                />
              )}
              <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center p-3 text-center">
                <span
                  className={`text-2xl font-bold tracking-tight drop-shadow ${owned ? 'text-white' : 'text-white/50'}`}
                >
                  {item.title}
                </span>
                <span
                  className={`mt-1 text-[10px] font-medium leading-tight ${owned ? 'text-white/90' : 'text-white/35'}`}
                >
                  {item.subtitle}
                </span>
              </div>
            </div>
            <div className="px-3 py-2">
              <div className={`text-xs font-semibold truncate ${owned ? 'text-white' : 'text-white/45'}`}>
                {item.title}
              </div>
              <div className={`text-[10px] truncate ${owned ? 'text-white/60' : 'text-white/30'}`}>
                {owned ? 'Purchased · tap for contents' : 'Not purchased · tap for product page'}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
