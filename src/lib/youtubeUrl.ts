/** Parse YouTube watch / Shorts URLs for iframe + thumbnail use. */
export function extractYouTubeVideoId(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/shorts/')[1]?.split('/')[0] ?? null
    const v = u.searchParams.get('v')
    if (v) return v
    const parts = u.pathname.split('/').filter(Boolean)
    return parts.length ? parts[parts.length - 1] : null
  } catch {
    return null
  }
}
