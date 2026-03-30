export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Transient failures worth a short backoff retry (PostgREST / browser fetch). */
export function isRetryableSupabaseFailure(message: string, code?: string): boolean {
  const m = message.toLowerCase()
  if (m.includes('failed to fetch') || m.includes('network error') || m.includes('load failed')) return true
  if (m.includes('timeout') || m.includes('timed out')) return true
  if (/\b502\b|\b503\b|\b504\b/.test(m)) return true
  if (m.includes('econnreset') || m.includes('socket') || m.includes('aborted')) return true
  if (code === 'PGRST301' || code === 'PGRST302') return true
  return false
}
