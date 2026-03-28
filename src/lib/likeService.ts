import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUuidV4 } from './randomUuid'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const LOCAL_KEY = 'tiktokchinese_likes'

let supabase: SupabaseClient | null = null
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
}

let cachedIpHash: string | null = null

async function getIpHash(): Promise<string> {
  if (cachedIpHash) return cachedIpHash
  try {
    const resp = await fetch('https://api.ipify.org?format=json')
    const { ip } = await resp.json()
    const data = new TextEncoder().encode(ip + '_tiktokchinese')
    const buf = await crypto.subtle.digest('SHA-256', data)
    cachedIpHash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
    return cachedIpHash
  } catch {
    let uid = localStorage.getItem('tiktokchinese_uid')
    if (!uid) {
      uid = randomUuidV4()
      localStorage.setItem('tiktokchinese_uid', uid)
    }
    cachedIpHash = uid
    return uid
  }
}

function localLikes(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]')) }
  catch { return new Set() }
}
function saveLocal(set: Set<string>) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify([...set]))
}

export async function getLikeStatus(videoId: string): Promise<{ liked: boolean; count: number }> {
  if (!supabase) {
    const liked = localLikes().has(videoId)
    return { liked, count: liked ? 1 : 0 }
  }

  const ipHash = await getIpHash()
  const [{ data: row }, { count }] = await Promise.all([
    supabase.from('likes').select('id').eq('video_id', videoId).eq('ip_hash', ipHash).maybeSingle(),
    supabase.from('likes').select('*', { count: 'exact', head: true }).eq('video_id', videoId),
  ])
  return { liked: !!row, count: count ?? 0 }
}

export async function toggleLike(videoId: string): Promise<{ liked: boolean; count: number }> {
  if (!supabase) {
    const store = localLikes()
    const wasLiked = store.has(videoId)
    if (wasLiked) store.delete(videoId); else store.add(videoId)
    saveLocal(store)
    return { liked: !wasLiked, count: !wasLiked ? 1 : 0 }
  }

  const ipHash = await getIpHash()
  const { data: existing } = await supabase
    .from('likes').select('id').eq('video_id', videoId).eq('ip_hash', ipHash).maybeSingle()

  if (existing) {
    await supabase.from('likes').delete().eq('video_id', videoId).eq('ip_hash', ipHash)
  } else {
    await supabase.from('likes').insert({ video_id: videoId, ip_hash: ipHash })
  }

  const { count } = await supabase
    .from('likes').select('*', { count: 'exact', head: true }).eq('video_id', videoId)

  return { liked: !existing, count: count ?? 0 }
}
