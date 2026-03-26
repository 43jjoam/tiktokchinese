const STORAGE_KEY = 'tiktokchinese_likes'

function getStore(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'))
  } catch {
    return new Set()
  }
}

function saveStore(set: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]))
}

export function isVideoLiked(videoId: string): boolean {
  return getStore().has(videoId)
}

export function toggleVideoLike(videoId: string): boolean {
  const store = getStore()
  const wasLiked = store.has(videoId)
  if (wasLiked) {
    store.delete(videoId)
  } else {
    store.add(videoId)
  }
  saveStore(store)
  return !wasLiked
}
