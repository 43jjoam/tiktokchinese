import { randomUuidV4 } from './randomUuid'

const UID_KEY = 'tiktokchinese_uid'

function getRawDeviceId(): string {
  let uid = localStorage.getItem(UID_KEY)
  if (!uid) {
    uid = randomUuidV4()
    localStorage.setItem(UID_KEY, uid)
  }
  return uid
}

/**
 * PRD: SHA-256(device_id + salt) hex64 in production (HTTPS).
 * Local dev (localhost): `dev-` + device_id — blocked from production Edge by CORS; dev Supabase only.
 */
export async function getDeviceHashForEngagement(): Promise<string> {
  const id = getRawDeviceId()
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return `dev-${id}`
  }
  const salt =
    (import.meta.env.VITE_APP_ENGAGEMENT_SALT as string | undefined)?.trim() ||
    'chineseflash-engagement-salt-v1'
  const enc = new TextEncoder().encode(`${id}${salt}`)
  const buf = await crypto.subtle.digest('SHA-256', enc)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
