import React from 'react'
import type { WordMetadata } from '../lib/types'
import { pickL1Meaning } from '../lib/meaningL1'
import { getWordContentKind } from '../lib/wordContentKind'

type SupportedLocale = 'en' | 'zh-TW' | 'th'

const DEFAULT_DICTIONARY_NOTE =
  'Compound examples curated from CC-CEDICT-style open lexical data (CC BY-SA 4.0). For authoritative definitions, consult 教育部《重編國語辭典》 or MDBG.'

type Props = {
  word: WordMetadata
  locale: SupportedLocale
  isNativelySupported: boolean
  userLangLabel: string
  staticMeaning: string
  englishMeaning: string
  translatedMeaning: string | null
  /** Machine translation of illustrative sentence gloss (EN → browser language) when needed. */
  illustrativeGlossTranslated: string | null
}

export function MeaningTapOverlayCard({
  word,
  locale,
  isNativelySupported,
  userLangLabel,
  staticMeaning,
  englishMeaning,
  translatedMeaning,
  illustrativeGlossTranslated,
}: Props) {
  const kind = getWordContentKind(word)
  const lexical = (word.character_lexical_examples ?? []).slice(0, 3)
  const ill = word.illustrative_sentence
  const showCharacterExamples = kind === 'character' && lexical.length > 0
  const showIllustration = (kind === 'vocabulary' || kind === 'grammar') && ill

  const gloss = (l1: Partial<Record<SupportedLocale, string>> | undefined) =>
    pickL1Meaning(l1, locale, l1?.en ?? englishMeaning)

  const attribution = word.dictionary_attribution?.trim() || (showCharacterExamples ? DEFAULT_DICTIONARY_NOTE : '')

  return (
    <div className="pointer-events-auto w-[min(92vw,400px)] max-h-[min(72vh,520px)] overflow-y-auto overscroll-contain rounded-2xl bg-black/65 px-5 py-4 text-left shadow-2xl backdrop-blur-md sm:px-6 sm:py-5">
      <div className="text-center">
        <div className="text-2xl font-bold">{word.character}</div>
        <div className="mt-1 text-sm text-white/70">{word.pinyin}</div>
      </div>
      <div className="mt-3 h-px w-full bg-white/15" />

      <div className="mt-3 text-center">
        {isNativelySupported ? (
          <div className="text-base font-semibold">{staticMeaning}</div>
        ) : (
          <>
            {translatedMeaning && (
              <div className="text-base font-semibold">
                <span className="mr-1.5 text-xs text-white/50">{userLangLabel}</span>
                {translatedMeaning}
              </div>
            )}
            <div
              className={
                translatedMeaning ? 'mt-2 text-sm text-white/80' : 'text-base font-semibold'
              }
            >
              <span className="mr-1.5 text-xs text-white/50">EN</span>
              {englishMeaning}
            </div>
          </>
        )}
      </div>

      {showCharacterExamples && (
        <>
          <div className="mt-4 h-px w-full bg-white/12" />
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-white/45">
            Common compounds (dictionary-style)
          </p>
          <ul className="mt-2 space-y-2.5">
            {lexical.map((ex, i) => (
              <li key={`${ex.zh}-${i}`} className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2">
                <div className="text-base font-semibold text-white">
                  {ex.zh}
                  {ex.pinyin ? (
                    <span className="ml-2 text-xs font-normal text-white/55">{ex.pinyin}</span>
                  ) : null}
                </div>
                <div className="mt-1 text-sm text-white/80">{gloss(ex.l1_meanings)}</div>
              </li>
            ))}
          </ul>
          {attribution ? (
            <p className="mt-3 text-[9px] leading-snug text-white/35">{attribution}</p>
          ) : null}
        </>
      )}

      {showIllustration && ill && (
        <>
          <div className="mt-4 h-px w-full bg-white/12" />
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-white/45">
            Example sentence
          </p>
          <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2.5">
            <div className="text-lg font-medium leading-snug text-white">{ill.zh}</div>
            {ill.pinyin ? (
              <div className="mt-1 text-xs text-white/55">{ill.pinyin}</div>
            ) : null}
            <div className="mt-2 border-t border-white/10 pt-2 text-sm text-white/85">
              {isNativelySupported ? (
                pickL1Meaning(ill.l1_meanings, locale, ill.l1_meanings.en ?? englishMeaning)
              ) : (
                <>
                  {(illustrativeGlossTranslated || ill.l1_meanings[locale]) && (
                    <div className="font-medium">
                      <span className="mr-1.5 text-[10px] text-white/45">{userLangLabel}</span>
                      {ill.l1_meanings[locale] ?? illustrativeGlossTranslated}
                    </div>
                  )}
                  {ill.l1_meanings.en ? (
                    <div
                      className={
                        illustrativeGlossTranslated || ill.l1_meanings[locale]
                          ? 'mt-1.5 text-xs text-white/65'
                          : 'text-sm font-medium text-white/90'
                      }
                    >
                      <span className="mr-1.5 text-[10px] text-white/40">EN</span>
                      {ill.l1_meanings.en}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
