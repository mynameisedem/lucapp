import { useState } from 'react'
import { db, type Child } from '../db'
import { setSetting, useSettings, type Settings } from '../settings'
import { useToast } from '../App'

export async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export function SettingsScreen({ kids }: { kids: Child[] }) {
  const s = useSettings()
  const toast = useToast()
  const [editing, setEditing] = useState<Child | null>(null)
  const [pin, setPin] = useState('')

  const select = <K extends keyof Settings>(key: K, label: string, options: [Settings[K], string][]) => (
    <label>{label}
      <select value={String(s[key])} onChange={e => setSetting(key, options.find(o => String(o[0]) === e.target.value)![0])}>
        {options.map(([v, l]) => <option key={String(v)} value={String(v)}>{l}</option>)}
      </select>
    </label>
  )

  return (
    <div className="form">
      <h1>Settings</h1>
      <p><a href="#/backup">💾 Backup, restore &amp; export</a></p>

      <h2>Children</h2>
      <ul className="list">
        {kids.map(k => (
          <li key={k.id} className="row between">
            <span>{k.name} <span className="muted">born {k.birthDate}</span></span>
            <button onClick={() => setEditing(k)}>Edit</button>
          </li>
        ))}
      </ul>
      {editing
        ? <ChildForm child={editing} onSaved={() => setEditing(null)} />
        : <button onClick={() => setEditing({ name: '', birthDate: '' })}>Add child</button>}

      <h2>Display</h2>
      {select('units', 'Units', [['metric', 'Metric (ml, kg, cm)'], ['imperial', 'Imperial (oz, lb, in)']])}
      {select('clock', 'Time format', [['24', '24-hour'], ['12', '12-hour']])}
      {select('theme', 'Theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']])}

      <h2>Logging</h2>
      {select('feedDefault', 'Default feeding', [['BREAST', 'Breastfeeding'], ['BOTTLE', 'Bottle']])}
      {select('bottleStepMl', 'Bottle amount step', [[5, '5 ml'], [10, '10 ml'], [15, '15 ml'], [30, '30 ml']])}
      {select('wakeLock', 'Keep screen on while feeding', [[true, 'On'], [false, 'Off']])}
      {select('backupEveryDays', 'Backup reminder', [[3, 'Every 3 days'], [7, 'Every 7 days'], [14, 'Every 14 days'], [0, 'Off']])}

      <h2>PIN lock</h2>
      <p className="muted">Convenience only; your phone's lock screen is the real protection.</p>
      {s.pinHash
        ? <button onClick={() => { setSetting('pinHash', ''); toast({ msg: 'PIN removed' }) }}>Remove PIN</button>
        : (
          <div className="row">
            <input type="password" inputMode="numeric" aria-label="New PIN" placeholder="4–8 digits" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} />
            <button disabled={pin.length < 4} onClick={async () => { await setSetting('pinHash', await sha256(pin)); setPin(''); toast({ msg: 'PIN set' }) }}>Set PIN</button>
          </div>
        )}

      <p className="muted small">Suggestions are general guidance, not medical advice. Ask your pediatrician about your baby's health.</p>
    </div>
  )
}

export function ChildForm({ child = { name: '', birthDate: '' }, onSaved }: { child?: Child; onSaved: (id: number) => void }) {
  const [c, setC] = useState(child)
  return (
    <form className="form card" onSubmit={async e => { e.preventDefault(); onSaved((await db.children.put(c))!) }}>
      <label>Name<input required value={c.name} onChange={e => setC({ ...c, name: e.target.value })} /></label>
      <label>Birth date<input type="date" required value={c.birthDate} onChange={e => setC({ ...c, birthDate: e.target.value })} /></label>
      <button className="primary">Save</button>
    </form>
  )
}
