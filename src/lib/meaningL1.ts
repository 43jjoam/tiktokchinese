import type { Locale } from './types'

/** Pick best gloss for the app’s supported locales (navigator-driven `locale` from VideoFeed / Profile). */
export function pickL1Meaning(
  l1: Partial<Record<Locale, string>> | undefined,
  locale: Locale,
  fallbackEn: string,
): string {
  if (!l1) return fallbackEn
  return l1[locale] ?? l1.en ?? l1['zh-TW'] ?? fallbackEn
}
