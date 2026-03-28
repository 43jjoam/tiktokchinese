const PREFIX = 'tiktokchinese_note_v1:'

export function getLocalNote(wordId: string): string {
  try {
    return localStorage.getItem(PREFIX + wordId) ?? ''
  } catch {
    return ''
  }
}

export function setLocalNote(wordId: string, body: string): void {
  try {
    if (!body.trim()) localStorage.removeItem(PREFIX + wordId)
    else localStorage.setItem(PREFIX + wordId, body)
  } catch {
    /* ignore quota */
  }
}
