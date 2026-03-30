/**
 * Client-side email shape check before magic-link send (Pre-Push Test Plan §2).
 * Leading/trailing whitespace invalidates — user must not submit padded addresses.
 */
export function isValidEmail(email: string): boolean {
  if (email !== email.trim()) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
