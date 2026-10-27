import { useSyncExternalStore } from 'react'
import { changes, db } from './db'
import { sync, type RemoteIO, type SyncDoc } from './sync'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
const SCOPE = 'https://www.googleapis.com/auth/drive.file' // only files this app created
const FILE_NAME = 'luca-data.json'
const API = 'https://www.googleapis.com'
export const driveConfigured = !!CLIENT_ID

// Per-phone sign-in state lives in localStorage; it's not app data and must not be synced or backed up.
const store = {
  get: (k: string) => { try { return localStorage.getItem('luca.' + k) } catch { return null } },
  set: (k: string, v: string | null) => { try { v === null ? localStorage.removeItem('luca.' + k) : localStorage.setItem('luca.' + k, v) } catch { /* private mode */ } },
}

export function token() {
  const t = store.get('token'), exp = Number(store.get('tokenExp'))
  return t && exp > Date.now() + 60_000 ? t : null
}

/** Implicit OAuth flow by full-page redirect: no Google script is loaded, so the CSP stays tight. */
export function signIn() {
  const state = crypto.randomUUID()
  sessionStorage.setItem('luca.oauthState', state)
  sessionStorage.setItem('luca.route', location.hash)
  const q = new URLSearchParams({
    client_id: CLIENT_ID!, redirect_uri: location.origin + location.pathname, response_type: 'token',
    scope: SCOPE, include_granted_scopes: 'true', state, ...(store.get('email') ? { login_hint: store.get('email')! } : {}),
  })
  location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + q
}

/** Call before the router reads location.hash: Google returns the token in the URL fragment. */
export function handleOAuthRedirect() {
  const h = new URLSearchParams(location.hash.slice(1))
  if (!h.has('access_token') && !h.has('error')) return
  const ok = h.get('state') === sessionStorage.getItem('luca.oauthState')
  if (ok && h.get('access_token')) {
    store.set('token', h.get('access_token'))
    store.set('tokenExp', String(Date.now() + Number(h.get('expires_in') ?? 3600) * 1000))
  } else setStatus({ error: ok ? `Google sign-in failed: ${h.get('error')}` : 'Google sign-in failed: state mismatch' })
  history.replaceState(null, '', location.pathname + (sessionStorage.getItem('luca.route') || '#/'))
}

export function signOut() {
  for (const k of ['token', 'tokenExp', 'fileId', 'lastSync']) store.set(k, null)
  setStatus({ error: '', lastSync: 0 })
}

class NeedsSignIn extends Error {}

async function api(path: string, init: RequestInit = {}) {
  const t = token()
  if (!t) throw new NeedsSignIn()
  const res = await fetch(API + path, { ...init, headers: { ...init.headers, Authorization: 'Bearer ' + t } })
  if (res.status === 401) { store.set('token', null); throw new NeedsSignIn() }
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
    return res.json()
  },
  async write(doc: SyncDoc) {
    let id = await findFile()
    if (!id) {
      const res = await api('/drive/v3/files?fields=id', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: FILE_NAME, mimeType: 'application/json' }),
      })
      if (!res.ok) throw new Error(`Drive create failed (${res.status})`)
      id = (await res.json()).id as string
      store.set('fileId', id)
    }
    const res = await api(`/upload/drive/v3/files/${id}?uploadType=media`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc),
    })
    if (!res.ok) throw new Error(`Drive upload failed (${res.status})`)
  },
}

// --- status store for the UI ---
type Status = { syncing: boolean; error: string; lastSync: number; signedIn: boolean }
let status: Status = { syncing: false, error: '', lastSync: Number(store.get('lastSync')) || 0, signedIn: !!token() }
const listeners = new Set<() => void>()
function setStatus(p: Partial<Status>) {
  status = { ...status, ...p, signedIn: !!token() }
  listeners.forEach(l => l())
}
export const useSyncStatus = () => useSyncExternalStore(l => (listeners.add(l), () => listeners.delete(l)), () => status)

let running: Promise<void> | null = null
let again = false
/** Safe to call often: concurrent calls coalesce into one extra run. Does nothing when signed out. */
export function syncNow(): Promise<void> {
  if (!driveConfigured || !token()) { setStatus({}); return Promise.resolve() }
  if (running) { again = true; return running }
  setStatus({ syncing: true })
  running = sync(db, driveIO)
    .then(() => {
      store.set('lastSync', String(Date.now()))
      setStatus({ error: '', lastSync: Date.now() })
    })
    .catch(e => setStatus({ error: e instanceof NeedsSignIn ? '' : navigator.onLine ? String(e.message ?? e) : 'Offline – will sync later' }))
    .finally(() => {
      running = null
      setStatus({ syncing: false })
      if (again) { again = false; syncNow() }
    })
  return running
}

/** Sync on start, when the app comes to the foreground, every 2 minutes while open, and shortly after local edits. */
export function startAutoSync() {
  if (!driveConfigured) return
  let debounce: ReturnType<typeof setTimeout>
  changes.addEventListener('change', () => { clearTimeout(debounce); debounce = setTimeout(syncNow, 3000) })
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && syncNow())
  addEventListener('online', () => syncNow())
  setInterval(() => document.visibilityState === 'visible' && syncNow(), 120_000)
  syncNow()
}
