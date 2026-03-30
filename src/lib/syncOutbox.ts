import { getSupabaseClient } from './deckService'
import { getSupabaseFunctionsBaseUrl } from './supabaseFunctionsUrl'

const DB_NAME = 'tiktokchinese_sync_outbox_v1'
const DB_VERSION = 1
const STORE = 'jobs'

const MAX_ATTEMPTS = 50
const BASE_DELAY_MS = 800
const MAX_DELAY_MS = 120_000
const FLUSH_INTERVAL_MS = 12_000

export type SyncOutboxJobKind = 'record-engagement' | 'record-session-summary'

export type SyncOutboxJob = {
  id: string
  kind: SyncOutboxJobKind
  body: Record<string, unknown>
  attempts: number
  nextRetryAt: number
  createdAt: number
}

function randomId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('idb_open_failed'))
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
  })
}

export async function enqueueSyncOutboxJob(kind: SyncOutboxJobKind, body: Record<string, unknown>): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  const now = Date.now()
  const job: SyncOutboxJob = {
    id: randomId(),
    kind,
    body,
    attempts: 0,
    nextRetryAt: now,
    createdAt: now,
  }
  await new Promise<void>((resolve, reject) => {
    void openDb()
      .then((db) => {
        const tx = db.transaction(STORE, 'readwrite')
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error ?? new Error('idb_tx_failed'))
        const r = tx.objectStore(STORE).add(job)
        r.onerror = () => reject(r.error ?? new Error('idb_add_failed'))
      })
      .catch(reject)
  })
  void flushSyncOutboxSoon()
}

async function getDueJobs(): Promise<SyncOutboxJob[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const s = tx.objectStore(STORE)
    const req = s.getAll()
    req.onsuccess = () => {
      const all = (req.result as SyncOutboxJob[]) ?? []
      const now = Date.now()
      const priority = (kind: SyncOutboxJobKind) => (kind === 'record-engagement' ? 0 : 1)
      resolve(
        all
          .filter((j) => j.nextRetryAt <= now)
          .sort((a, b) => {
            const p = priority(a.kind) - priority(b.kind)
            if (p !== 0) return p
            return a.createdAt - b.createdAt
          }),
      )
    }
    req.onerror = () => reject(req.error ?? new Error('idb_getall_failed'))
  })
}

async function deleteJob(id: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    void openDb()
      .then((db) => {
        const tx = db.transaction(STORE, 'readwrite')
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error ?? new Error('idb_tx_failed'))
        const r = tx.objectStore(STORE).delete(id)
        r.onerror = () => reject(r.error ?? new Error('idb_delete_failed'))
      })
      .catch(reject)
  })
}

async function updateJob(job: SyncOutboxJob): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    void openDb()
      .then((db) => {
        const tx = db.transaction(STORE, 'readwrite')
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error ?? new Error('idb_tx_failed'))
        const r = tx.objectStore(STORE).put(job)
        r.onerror = () => reject(r.error ?? new Error('idb_put_failed'))
      })
      .catch(reject)
  })
}

function backoffMs(attempts: number): number {
  const exp = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.min(attempts, 16))
  const jitter = Math.floor(Math.random() * 400)
  return exp + jitter
}

function pathForKind(kind: SyncOutboxJobKind): string {
  if (kind === 'record-engagement') return '/record-engagement'
  return '/record-session-summary'
}

async function buildAuthHeaders(idempotencyKey: string): Promise<Record<string, string> | null> {
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!anon?.trim()) return null
  const client = getSupabaseClient()
  const session = client ? (await client.auth.getSession()).data.session : null
  const token = session?.access_token ?? anon
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    apikey: anon,
    'Idempotency-Key': idempotencyKey,
  }
}

async function sendJob(job: SyncOutboxJob): Promise<{ ok: boolean; retriable: boolean }> {
  const base = getSupabaseFunctionsBaseUrl()
  const headers = await buildAuthHeaders(job.id)
  if (!base || !headers) return { ok: false, retriable: true }

  const url = `${base}${pathForKind(job.kind)}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(job.body),
      keepalive: job.kind === 'record-session-summary',
    })
    const errBody = !res.ok ? await res.text().catch(() => '') : ''
    if (import.meta.env.DEV && !res.ok) {
      console.warn('[syncOutbox]', job.kind, res.status, errBody.slice(0, 220))
    }
    if (res.ok) return { ok: true, retriable: false }
    if (res.status === 401 || res.status === 403) return { ok: false, retriable: true }
    if (res.status >= 500 || res.status === 429) return { ok: false, retriable: true }
    /* 4xx other than auth: bad payload; drop */
    return { ok: false, retriable: false }
  } catch {
    return { ok: false, retriable: true }
  }
}

let flushing = false
let scheduled = false

export async function flushSyncOutbox(): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  if (flushing) return
  flushing = true
  try {
    for (let iter = 0; iter < 500; iter++) {
      const batch = await getDueJobs()
      if (batch.length === 0) break
      const job = batch[0]
      const result = await sendJob(job)
      if (result.ok) {
        await deleteJob(job.id)
        continue
      }
      if (!result.retriable || job.attempts + 1 >= MAX_ATTEMPTS) {
        await deleteJob(job.id)
        if (import.meta.env.DEV) {
          console.warn('[syncOutbox] dropped job after failures', job.kind, job.id)
        }
        continue
      }
      const next: SyncOutboxJob = {
        ...job,
        attempts: job.attempts + 1,
        nextRetryAt: Date.now() + backoffMs(job.attempts),
      }
      await updateJob(next)
      /** Keep flushing: a stuck session-summary must not block record-engagement in this same run. */
      continue
    }
  } finally {
    flushing = false
  }
}

export function flushSyncOutboxSoon(): void {
  if (scheduled) return
  scheduled = true
  queueMicrotask(() => {
    scheduled = false
    void flushSyncOutbox()
  })
}

let initDone = false

/** Interval + online/visibility hooks; safe to call multiple times. */
export function initSyncOutbox(): void {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') return
  if (initDone) return
  initDone = true

  window.setInterval(() => void flushSyncOutbox(), FLUSH_INTERVAL_MS)
  window.addEventListener('online', () => void flushSyncOutbox())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flushSyncOutbox()
  })
  void flushSyncOutbox()
}
