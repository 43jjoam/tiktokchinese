/**
 * UUID v4 for anonymous client IDs.
 * `crypto.randomUUID` is missing on some HTTP origins (e.g. http://192.168.x.x:5173 from a phone);
 * `getRandomValues` is usually still available.
 */
export function randomUuidV4(): string {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID()
  }
  if (c && typeof c.getRandomValues === 'function') {
    const bytes = new Uint8Array(16)
    c.getRandomValues(bytes)
    bytes[6] = (bytes[6]! & 0x0f) | 0x40
    bytes[8] = (bytes[8]! & 0x3f) | 0x80
    let hex = ''
    for (let i = 0; i < 16; i++) hex += bytes[i]!.toString(16).padStart(2, '0')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  return `fb-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}
