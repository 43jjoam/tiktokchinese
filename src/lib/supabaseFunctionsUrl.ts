/** Base URL for Supabase Edge Functions (`.../functions/v1`), no trailing slash. */
export function getSupabaseFunctionsBaseUrl(): string | null {
  const u = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL as string | undefined
  if (u?.trim()) return u.replace(/\/$/, '')
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined
  if (!base?.trim()) return null
  return `${base.replace(/\/$/, '')}/functions/v1`
}
