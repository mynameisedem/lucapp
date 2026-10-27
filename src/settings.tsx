import { createContext, useContext, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'

export const DEFAULTS = {
  units: 'metric' as 'metric' | 'imperial',
  clock: '24' as '12' | '24',
  theme: 'auto' as 'light' | 'dark' | 'auto',
  feedDefault: 'BREAST' as 'BREAST' | 'BOTTLE',
  bottleStepMl: 10,
  wakeLock: true,
  backupEveryDays: 7,
  lastBackup: 0,
  pinHash: '',
  childId: 0,
  lastBreastSide: 'L' as 'L' | 'R',
}
export type Settings = typeof DEFAULTS

const Ctx = createContext<Settings>(DEFAULTS)

export function SettingsProvider({ children }: { children: (s: Settings) => ReactNode }) {
  const rows = useLiveQuery(() => db.settings.toArray())
  if (!rows) return null
  const s = { ...DEFAULTS, ...Object.fromEntries(rows.map(r => [r.key, r.value])) } as Settings
  return <Ctx.Provider value={s}>{children(s)}</Ctx.Provider>
}

export const useSettings = () => useContext(Ctx)
export const setSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => db.settings.put({ key, value })
