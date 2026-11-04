import { useSyncExternalStore } from 'react'
import { changes, db } from './db'
import { sync, type RemoteIO, type SyncDoc } from './sync'

const SCOPE = 'https://www.googleapis.com/auth/drive' // a service account only sees files shared with it
const FILE_NAME = 'luca-data.json'
const API = 'https://www.googleapis.com'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

// Per-phone credentials live in localStorage; they're not app data and must not be synced or backed up.
const store = {
  get: (k: string) => { try { return localStorage.getItem('luca.' + k) } catch { return null } },
  set: (k: string, v: string | null) => { try { v === null ? localStorage.removeItem('luca.' + k) : localStorage.setItem('luca.' + k, v) } catch { /* private mode */ } },
}

type ServiceKey = { client_email: string; private_key: string }
const savedKey = (): ServiceKey | null => { try { return JSON.parse(store.get('saKey')!) } catch { return null } }
export const hasKey = () => !!savedKey()
export const keyEmail = () => savedKey()?.client_email ?? ''

const b64url = (b: ArrayBuffer | string) =>
  btoa(typeof b === 'string' ? b : String.fromCharCode(...new Uint8Array(b))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')

function importKey(pem: string) {
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, '')), c => c.charCodeAt(0))
  return crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
}

/** Trust boundary: the pasted file must be a Google service account JSON key with a usable private key. */
export async function setKey(text: string) {
  let k: ServiceKey & { type?: string }
  try { k = JSON.parse(text) } catch { throw new Error('Not a JSON file') }
  if (k?.type !== 'service_account' || typeof k.client_email !== 'string' || typeof k.private_key !== 'string')
    throw new Error('Not a Google service account key')
  try { await importKey(k.private_key) } catch { throw new Error('The private key in this file is invalid') }
  store.set('saKey', JSON.stringify({ client_email: k.client_email, private_key: k.private_key }))
  store.set('token', null)
  setStatus({ error: '' })
  syncNow()
}

/** Service account flow: sign a JWT with the key and swap it for a 1-hour access token. */
async function token() {
  const t = store.get('token'), exp = Number(store.get('tokenExp'))
  if (t && exp > Date.now() + 60_000) return t
  const key = savedKey()
  if (!key) throw new NeedsKey()
  const now = Math.floor(Date.now() / 1000)
  const unsigned = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' +
    b64url(JSON.stringify({ iss: key.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }))
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await importKey(key.private_key), new TextEncoder().encode(unsigned))
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + b64url(sig) }),
  })
  if (!res.ok) throw new Error(`Google rejected the key (${res.status}); was it deleted?`)
  const body = await res.json()
  store.set('token', body.access_token)
  store.set('tokenExp', String(Date.now() + Number(body.expires_in ?? 3600) * 1000))
  return body.access_token as string
}

export function removeKey() {
  for (const k of ['saKey', 'token', 'tokenExp', 'fileId', 'lastSync']) store.set(k, null)
  setStatus({ error: '', lastSync: 0 })
}

class NeedsKey extends Error {}

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(API + path, { ...init, headers: { ...init.headers, Authorization: 'Bearer ' + await token() } })
  if (res.status === 401) store.set('token', null)
  return res
}

async function findFile(): Promise<string | null> {
  const cached = store.get('fileId')
  if (cached) return cached
  const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`)
  const res = await api(`/drive/v3/files?q=${q}&orderBy=modifiedTime desc&fields=files(id)&spaces=drive`)
  if (!res.ok) throw new Error(`Drive search failed (${res.status})`)
  const id = (await res.json()).files?.[0]?.id ?? null
  store.set('fileId', id)
  return id
}

export const driveIO: RemoteIO = {
  async read() {
    const id = await findFile()
    if (!id) return null
    const res = await api(`/drive/v3/files/${id}?alt=media`)
    if (res.status === 404) { store.set('fileId', null); return driveIO.read() }
    if (!res.ok) throw new Error(`Drive download failed (${res.status})`)
    const text = await res.text()
    return text.trim() ? JSON.parse(text) : null // an empty shared file means no data yet
  },
  async write(doc: SyncDoc) {
    const id = await findFile()
    // A service account has no storage of its own, so the file must be created by a person and shared with it.
    if (!id) throw new Error(`Share ${FILE_NAME} in your Drive with ${keyEmail()}`)
    const res = await api(`/upload/drive/v3/files/${id}?uploadType=media`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc),
    })
    if (!res.ok) throw new Error(`Drive upload failed (${res.status})`)
  },
}

// --- status store for the UI ---
type Status = { syncing: boolean; error: string; lastSync: number; signedIn: boolean }
let status: Status = { syncing: false, error: '', lastSync: Number(store.get('lastSync')) || 0, signedIn: hasKey() }
const listeners = new Set<() => void>()
function setStatus(p: Partial<Status>) {
  status = { ...status, ...p, signedIn: hasKey() }
  listeners.forEach(l => l())
}
export const useSyncStatus = () => useSyncExternalStore(l => (listeners.add(l), () => listeners.delete(l)), () => status)

let running: Promise<void> | null = null
let again = false
/** Safe to call often: concurrent calls coalesce into one extra run. Does nothing without a key. */
export function syncNow(): Promise<void> {
  if (!hasKey()) { setStatus({}); return Promise.resolve() }
  if (running) { again = true; return running }
  setStatus({ syncing: true })
  running = sync(db, driveIO)
    .then(() => {
      store.set('lastSync', String(Date.now()))
      setStatus({ error: '', lastSync: Date.now() })
    })
    .catch(e => setStatus({ error: e instanceof NeedsKey ? '' : navigator.onLine ? String(e.message ?? e) : 'Offline – will sync later' }))
    .finally(() => {
      running = null
      setStatus({ syncing: false })
      if (again) { again = false; syncNow() }
    })
  return running
}

/** Sync on start, when the app comes to the foreground, every 2 minutes while open, and shortly after local edits. */
export function startAutoSync() {
  let debounce: ReturnType<typeof setTimeout>
  changes.addEventListener('change', () => { clearTimeout(debounce); debounce = setTimeout(syncNow, 3000) })
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && syncNow())
  addEventListener('online', () => syncNow())
  setInterval(() => document.visibilityState === 'visible' && syncNow(), 120_000)
  syncNow()
}
