/** Magic-link / OAuth return lands here first — dedicated screen, then we send users to `/`. */
export const AUTH_CALLBACK_SEGMENT = 'auth/callback'

export function normalizePathname(pathname: string): string {
  if (!pathname || pathname === '/') return '/'
  return pathname.replace(/\/+$/, '') || '/'
}

export function isAuthCallbackPathname(pathname: string): boolean {
  return normalizePathname(pathname) === `/${AUTH_CALLBACK_SEGMENT}`
}
