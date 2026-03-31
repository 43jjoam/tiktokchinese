const KEY = 'tiktokchinese_display_name'
const MAX_LEN = 48

/** When signed in, prefer the email local part (before @) for display and uploads. */
export function getProfileLabelFromAuthEmail(email: string | null | undefined): string | null {
  const m = email?.trim()
  if (!m?.includes('@')) return null
  const local = m.split('@')[0]?.trim()
  return local ? local.slice(0, MAX_LEN) : null
}

/** Readable in UI and bundled into `user_learning_profiles` for cross-device sync. */
export function getProfileDisplayName(): string {
  try {
    let name = localStorage.getItem(KEY)?.trim()
    if (!name) {
      const suffix = Math.floor(1000 + Math.random() * 9000)
      name = `Learner-${suffix}`
      localStorage.setItem(KEY, name)
    }
    return name.slice(0, MAX_LEN)
  } catch {
    return 'Learner-0000'
  }
}

/** Apply name from merged cloud profile (overwrites local so all devices match). */
export function setProfileDisplayNameFromCloud(name: string): void {
  const t = name.trim().slice(0, MAX_LEN)
  if (!t) return
  try {
    localStorage.setItem(KEY, t)
  } catch {
    /* ignore */
  }
}
