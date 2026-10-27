import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Child } from './db'
import { SettingsProvider, setSetting, type Settings } from './settings'
import { Home } from './screens/Home'
import { Timeline } from './screens/Timeline'
import { EventEditor } from './screens/EventEditor'
import { Stats } from './screens/Stats'
import { Growth } from './screens/Growth'
import { Backup } from './screens/Backup'
import { SettingsScreen, ChildForm, sha256 } from './screens/Settings'
import { driveConfigured, signIn, useSyncStatus } from './drive'
import { Quick } from './screens/Quick'

export const go = (path: string) => { location.hash = '#' + path }

function useRoute() {
  const read = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const on = () => { setRoute(read()); window.scrollTo(0, 0) }
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  return route
}

type Toast = { msg: string; undo?: () => void }
const ToastCtx = createContext<(t: Toast) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

const ChildCtx = createContext<Child>(null!)
export const useChild = () => useContext(ChildCtx)

export function App() {
  return <SettingsProvider>{s => <Shell s={s} />}</SettingsProvider>
}

function Shell({ s }: { s: Settings }) {
  const route = useRoute()
  const [toast, setToast] = useState<Toast | null>(null)
  const [unlocked, setUnlocked] = useState(false)
  const children = useLiveQuery(() => db.children.toArray())

  useEffect(() => {
    const dark = s.theme === 'dark' || (s.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [s.theme])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(t)
  }, [toast])

  if (!children) return null
  if (s.pinHash && !unlocked) return <PinLock hash={s.pinHash} onOk={() => setUnlocked(true)} />
  if (!children.length)
    return <Welcome />

  const child = children.find(c => c.id === s.childId) ?? children[0]
  const [screen, ...args] = route
  let page: ReactNode
  switch (screen) {
    case 'timeline': page = <Timeline date={args[0]} />; break
    case 'event': page = <EventEditor id={args[0]} type={args[1]} />; break
    case 'stats': page = <Stats />; break
    case 'growth': page = <Growth />; break
    case 'backup': page = <Backup />; break
    case 'settings': page = <SettingsScreen kids={children} />; break
    case 'quick': page = <Quick what={args[0]} />; break
    default: page = <Home kids={children} />
  }

  return (
    <ChildCtx.Provider value={child}>
      <ToastCtx.Provider value={setToast}>
        <WakeLock enabled={s.wakeLock} childId={child.id!} />
        <main className="page">{page}</main>
        {toast && (
          <div className="toast" role="status">
            <span>{toast.msg}</span>
            {toast.undo && <button onClick={() => { toast.undo!(); setToast(null) }}>Undo</button>}
          </div>
        )}
        <nav className="tabs" aria-label="Main">
          {[['', '🏠', 'Home'], ['timeline', '📅', 'Timeline'], ['stats', '📊', 'Stats'], ['growth', '📈', 'Growth'], ['settings', '⚙️', 'More']].map(([p, icon, label]) => (
            <a key={p} href={'#/' + p} aria-current={(screen ?? '') === p ? 'page' : undefined}>
              <span aria-hidden>{icon}</span>{label}
            </a>
          ))}
        </nav>
      </ToastCtx.Provider>
    </ChildCtx.Provider>
  )
}

/** Keeps the screen on while a breastfeeding timer runs (Screen Wake Lock API). */
function WakeLock({ enabled, childId }: { enabled: boolean; childId: number }) {
  const feeding = useLiveQuery(
    () => db.events.where('running').equals(1).filter(e => e.childId === childId && e.type === 'BREAST').count(), [childId])
  useEffect(() => {
    if (!enabled || !feeding || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | undefined
    const acquire = () => { if (document.visibilityState === 'visible') navigator.wakeLock.request('screen').then(l => (lock = l), () => {}) }
    acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => { document.removeEventListener('visibilitychange', acquire); lock?.release() }
  }, [enabled, feeding])
  return null
}

function Welcome() {
  const st = useSyncStatus()
  return (
    <main className="page">
      <h1>Welcome</h1>
      {driveConfigured && (
        <section className="card">
          <h2>Already using Luca on another phone?</h2>
          {st.signedIn
            ? <p>{st.syncing ? 'Loading data from Google Drive…' : st.error || 'No data found in Drive yet. Sync on the other phone first, or add your baby below.'}</p>
            : <><p>Sign in with the same Google account to load its data.</p><button className="primary" onClick={signIn}>Sign in to Google</button></>}
        </section>
      )}
      <h2>New here?</h2>
      <p>Add your baby to get started.</p>
      <ChildForm onSaved={id => setSetting('childId', id)} />
    </main>
  )
}

function PinLock({ hash, onOk }: { hash: string; onOk: () => void }) {
  const [pin, setPin] = useState('')
  const [bad, setBad] = useState(false)
  const check = async (p: string) => {
    setPin(p)
    if (p.length >= 4 && (await sha256(p)) === hash) onOk()
    else setBad(p.length >= 8)
  }
  return (
    <main className="page center">
      <h1>🌙 Luca</h1>
      <label>Enter PIN
        <input type="password" inputMode="numeric" autoFocus value={pin} onChange={e => check(e.target.value)} aria-invalid={bad} />
      </label>
    </main>
  )
}
