import React from 'react'
import type { ResolvedCompounds } from '../lib/characterCompounds'
import type { WordMetadata } from '../lib/types'
import { pickL1Meaning } from '../lib/meaningL1'
import { getWordContentKind } from '../lib/wordContentKind'

type SupportedLocale = 'en' | 'zh-TW' | 'th'

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
  /** Character cards: bundled compounds only (pinyin + L1 gloss each); omit for vocab/grammar. */
  compoundResult?: ResolvedCompounds | null
}

/** System CJK fonts + heavy weight so dense glyphs (e.g. 屁) stay readable on dark blur. */
const hanHeadline =
  "font-black text-white [font-family:'PingFang_SC','Hiragino_Sans_GB','Microsoft_YaHei','Noto_Sans_SC','Source_Han_Sans_SC',system-ui,sans-serif] [text-shadow:0_2px_6px_rgba(0,0,0,0.95),0_0_1px_rgba(0,0,0,1)]"

const hanBody =
  "font-semibold text-white [font-family:'PingFang_SC','Hiragino_Sans_GB','Microsoft_YaHei','Noto_Sans_SC','Source_Han_Sans_SC',system-ui,sans-serif] [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]"

function headlineSizeClass(zh: string): string {
  const n = [...zh].length
  if (n <= 1) return 'text-[2.85rem] leading-none tracking-wide sm:text-[3.25rem]'
  if (n <= 4) return 'text-3xl leading-tight tracking-wide sm:text-4xl'
  return 'text-2xl leading-snug sm:text-3xl'
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
  compoundResult,
}: Props) {
  const kind = getWordContentKind(word)
  const ill = word.illustrative_sentence
  const isCharacter = kind === 'character'
  const showIllustration = (kind === 'vocabulary' || kind === 'grammar') && ill

  const gloss = (l1: Partial<Record<SupportedLocale, string>> | undefined) =>
    pickL1Meaning(l1, locale, l1?.en ?? englishMeaning)

  const compoundExamples =
    isCharacter && compoundResult && compoundResult.examples.length > 0
      ? compoundResult.examples
      : []
  const showCompoundBlock = compoundExamples.length > 0
  const compoundAttribution =
    showCompoundBlock && compoundResult?.attribution ? compoundResult.attribution : ''

  return (
    <div className="pointer-events-auto max-h-[min(72vh,680px)] w-full overflow-y-auto overscroll-contain rounded-3xl border border-white/10 bg-black/82 px-5 pb-5 pt-7 text-left shadow-[0_16px_48px_rgba(0,0,0,0.55)] backdrop-blur-md sm:px-6 sm:pb-6 sm:pt-9">
      <div className="text-center">
        <div className={`${hanHeadline} ${headlineSizeClass(word.character)}`}>{word.character}</div>
        <div className="mt-2 text-base font-medium text-white/80">{word.pinyin}</div>
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

      {showCompoundBlock ? (
        <>
          <div className="mt-4 h-px w-full bg-white/12" />
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-white/45">
            Common compounds (dictionary-style)
          </p>
          <ul className="mt-2 space-y-2.5">
            {compoundExamples.map((ex, i) => (
              <li key={`${ex.zh}-${i}`} className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2">
                <div className={`text-xl leading-snug sm:text-2xl ${hanBody}`}>
                  {ex.zh}
                  {ex.pinyin ? (
                    <span className="ml-2 text-xs font-normal text-white/55">{ex.pinyin}</span>
                  ) : null}
                </div>
                <div className="mt-1 text-sm text-white/80">{gloss(ex.l1_meanings)}</div>
              </li>
            ))}
          </ul>
          {compoundAttribution ? (
            <p className="mt-3 text-[9px] leading-snug text-white/35">{compoundAttribution}</p>
          ) : null}
        </>
      ) : null}

      {showIllustration && ill && (
        <>
          <div className="mt-4 h-px w-full bg-white/12" />
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-white/45">
            Example sentence
          </p>
          <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2.5">
            <div className={`text-xl leading-relaxed sm:text-2xl ${hanBody}`}>{ill.zh}</div>
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
