/**
 * Direct-to-checkout Shopify URL (cart line → payment / customer info).
 */
export const HSK1_CHECKOUT_URL = 'https://bestling.net/cart/48710686376173:1?checkout'

/** Fired when checkout successfully opens in a new tab (stay in app to use Library). */
export const HSK1_CHECKOUT_OPENED_EVENT = 'tiktokchinese:hsk1-checkout-opened' as const

/**
 * Opens checkout in a **new tab** so the app stays in this window for Library activation.
 * If the browser blocks the popup, falls back to navigating this window (same as before).
 * @returns `true` if a new tab was opened, `false` if this window navigated away
 */
export function openHsk1Checkout(): boolean {
  if (typeof window === 'undefined') return false
  const w = window.open(HSK1_CHECKOUT_URL, '_blank', 'noopener,noreferrer')
  if (w) {
    try {
      w.opener = null
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent(HSK1_CHECKOUT_OPENED_EVENT))
    return true
  }
  window.location.href = HSK1_CHECKOUT_URL
  return false
}
