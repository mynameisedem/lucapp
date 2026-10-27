import { useState } from 'react'
import { addDays, differenceInCalendarDays, format, parse } from 'date-fns'
import { db, EVENT_META, type BabyEvent, type EventType } from '../db'
import { useChild, useToast } from '../App'
import { setSetting, useSettings } from '../settings'
import { eventsCsv, exportJson, importJson, saveFile } from '../backup'
import { average, rangeStats } from '../logic'
import { fmtDur, volume } from '../format'

const stamp = () => format(new Date(), 'yyyy-MM-dd')

export function Backup() {
  const s = useSettings()
  const toast = useToast()
  const child = useChild()
  const [msg, setMsg] = useState('')
  const [range, setRange] = useState({ from: format(addDays(new Date(), -6), 'yyyy-MM-dd'), to: stamp() })
  const [report, setReport] = useState<{ events: BabyEvent[]; days: number; to: Date } | null>(null)

  const run = (f: () => Promise<unknown>) => f().catch(e => e.name !== 'AbortError' && setMsg(String(e.message ?? e)))

  const exportAll = () => run(async () => {
    await saveFile(`luca-backup-${stamp()}.json`, await exportJson(), 'application/json')
    await setSetting('lastBackup', Date.now())
    toast({ msg: 'Backup exported' })
  })
  const importFile = (file?: File) => file && run(async () => {
    if (!confirm('Replace ALL data on this phone with the backup?')) return
    await importJson(await file.text())
    toast({ msg: 'Backup restored' })
  })
  const csv = (type: EventType) => run(async () => {
    const events = await db.events.where('[childId+startTime]').between([child.id!, -Infinity], [child.id!, Infinity]).toArray()
    await saveFile(`luca-${type.toLowerCase()}-${stamp()}.csv`, eventsCsv(events, type), 'text/csv')
  })
  const pdf = () => run(async () => {
    const from = parse(range.from, 'yyyy-MM-dd', new Date()), to = parse(range.to, 'yyyy-MM-dd', new Date())
    const days = differenceInCalendarDays(to, from) + 1
    if (days < 1) return setMsg('End date is before start date')
    const events = await db.events.where('[childId+startTime]').between([child.id!, addDays(from, -1).getTime()], [child.id!, addDays(to, 1).getTime()]).toArray()
    setReport({ events, days, to })
    setTimeout(() => print(), 100)
  })

  return (
    <>
      <div className="no-print">
        <h1>Backup</h1>
        <p className="muted">All data lives only on this phone. Clearing Chrome's site data or uninstalling the app deletes it. Back up regularly.</p>
        <p>Last backup: {s.lastBackup ? format(s.lastBackup, 'yyyy-MM-dd HH:mm') : 'never'}</p>
        <button className="primary wide" onClick={exportAll}>Export backup (JSON)</button>
        <label className="file-btn wide">Restore from backup…
          <input type="file" accept="application/json,.json" onChange={e => { importFile(e.target.files?.[0]); e.target.value = '' }} />
        </label>
        {msg && <p className="error" role="alert">{msg}</p>}

        <h2>CSV export ({child.name})</h2>
        <div className="chips">
          {(Object.keys(EVENT_META) as EventType[]).map(t => <button key={t} onClick={() => csv(t)}>{EVENT_META[t].label}</button>)}
        </div>

        <h2>Printable summary</h2>
        <div className="row">
          <label>From<input type="date" value={range.from} onChange={e => setRange({ ...range, from: e.target.value })} /></label>
          <label>To<input type="date" value={range.to} onChange={e => setRange({ ...range, to: e.target.value })} /></label>
        </div>
        <button onClick={pdf}>Print / save as PDF</button>
      </div>
      {report && <Summary name={child.name} {...report} />}
    </>
  )
}

function Summary({ name, events, days, to }: { name: string; events: BabyEvent[]; days: number; to: Date }) {
  const s = useSettings()
  const stats = rangeStats(events, to, days)
  const avg = average(stats)
  return (
    <section className="print-only">
      <h1>{name} – {format(stats[0].day, 'yyyy-MM-dd')} to {format(to, 'yyyy-MM-dd')}</h1>
      <p>Daily average: sleep {fmtDur(avg.sleepMs)}, naps {avg.naps.toFixed(1)}, feeds {avg.feeds.toFixed(1)}, bottle {volume(avg.bottleMl, s)}, diapers {avg.wet.toFixed(1)} wet / {avg.dirty.toFixed(1)} dirty</p>
      <table>
        <thead><tr><th>Date</th><th>Sleep</th><th>Longest</th><th>Naps</th><th>Feeds</th><th>Bottle</th><th>Wet</th><th>Dirty</th></tr></thead>
        <tbody>
          {stats.map(d => (
            <tr key={d.day}><td>{format(d.day, 'EEE d MMM')}</td><td>{fmtDur(d.sleepMs)}</td><td>{fmtDur(d.longestSleepMs)}</td><td>{d.naps}</td><td>{d.feeds}</td><td>{volume(d.bottleMl, s)}</td><td>{d.wet}</td><td>{d.dirty}</td></tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
