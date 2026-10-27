import { useState, type CSSProperties, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { formatDistanceStrict } from 'date-fns'
import { addEvent, db, EVENT_META, runningTimers, sideMs, startTimer, stopTimer, switchSide, type BabyEvent, type Child, type EventType } from '../db'
import { go, useChild, useToast } from '../App'
import { setSetting, useSettings } from '../settings'
import { fmtClock, fmtTime } from '../format'
import { useNow } from '../hooks'
import { suggestNap } from '../logic'
import { describe } from './Timeline'

const DAY = 86_400_000
type Panel = 'SLEEP' | 'BREAST' | 'DIAPER' | null

export const startFeed = (childId: number, side: 'L' | 'R') => {
  setSetting('lastBreastSide', side)
  return startTimer(childId, 'BREAST', switchSide({ leftMs: 0, rightMs: 0, side: null, sideSince: null }, side))
}

export function Home({ kids }: { kids: Child[] }) {
  const child = useChild()
  const s = useSettings()
  const toast = useToast()
  const now = useNow()
  const cid = child.id!
  const [open, setOpen] = useState<Panel>(null)
  const running = useLiveQuery(() => runningTimers(cid), [cid]) ?? []
  const recent = useLiveQuery(
    () => db.events.where('[childId+startTime]').between([cid, Date.now() - 8 * DAY], [cid, Infinity]).toArray(), [cid]) ?? []
  const runningOf = (t: EventType) => running.find(e => e.type === t)
  const toggle = (p: Panel) => setOpen(open === p ? null : p)

  const logDiaper = async (kind: 'wet' | 'dirty' | 'both') => {
    const id = await addEvent(cid, 'DIAPER', { payload: { kind } })
    setOpen(null)
    toast({ msg: `Diaper (${kind === 'dirty' ? 'poop' : kind}) logged`, undo: () => db.events.delete(id) })
  }
  const nextSide: 'L' | 'R' = s.lastBreastSide === 'L' ? 'R' : 'L'
  const sideName = (sd: 'L' | 'R') => (sd === 'L' ? 'Left' : 'Right')

  const sleepPanel = () => {
    const ev = runningOf('SLEEP')
    return ev ? <TimerBanner ev={ev} now={now} onStopped={() => setOpen(null)} />
      : <button className="primary huge" onClick={() => startTimer(cid, 'SLEEP')}>Start sleep</button>
  }
  const feedPanel = () => {
    const ev = runningOf('BREAST')
    return ev ? <TimerBanner ev={ev} now={now} onStopped={() => setOpen(null)} /> : (
      <div className="sides">
        {[nextSide, s.lastBreastSide].map(sd => (
          <button key={sd} className={sd === nextSide ? 'primary huge' : 'huge'} onClick={() => startFeed(cid, sd)}>
            Start {sideName(sd)}{sd === nextSide && <small>next side</small>}
          </button>
        ))}
      </div>
    )
  }
  const panel = (p: Panel, body: () => ReactNode) => open === p && <div className="panel">{body()}</div>

  const nap = suggestNap(recent.filter(e => e.type === 'SLEEP'), child, now)
  const backupDue = s.backupEveryDays > 0 && now - s.lastBackup > s.backupEveryDays * DAY
  const breast = <>
    <Big type="BREAST" label={s.feedDefault === 'BREAST' ? 'Feed' : 'Breastfeed'} active={!!runningOf('BREAST')} onClick={() => toggle('BREAST')} />
    {panel('BREAST', feedPanel)}
  </>
  const bottle = <Big type="BOTTLE" label="Bottle" onClick={() => go('/event/new/BOTTLE')} />

  return (
    <>
      <header className="row">
        {kids.length > 1 ? (
          <select aria-label="Child" value={cid} onChange={e => setSetting('childId', +e.target.value)}>
            {kids.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
        ) : <h1>{child.name}</h1>}
      </header>

      {backupDue && (
        <a className="banner warn" href="#/backup">
          {s.lastBackup ? `Last backup ${formatDistanceStrict(s.lastBackup, now)} ago.` : 'No backup yet.'} Tap to back up.
        </a>
      )}

      {running.filter(ev => ev.type !== open).map(ev => <TimerBanner key={ev.id} ev={ev} now={now} />)}

      <section className="grid" aria-label="Quick log">
        <Big type="SLEEP" label="Sleep" active={!!runningOf('SLEEP')} onClick={() => toggle('SLEEP')} />
        {panel('SLEEP', sleepPanel)}
        {s.feedDefault === 'BREAST' ? breast : bottle}
        <Big type="DIAPER" label="Diaper" onClick={() => toggle('DIAPER')} />
        {panel('DIAPER', () => (
          <div className="sides three">
            <button className="huge" onClick={() => logDiaper('wet')}>Wet</button>
            <button className="huge" onClick={() => logDiaper('dirty')}>Poop</button>
            <button className="huge" onClick={() => logDiaper('both')}>Both</button>
          </div>
        ))}
        {s.feedDefault === 'BREAST' ? bottle : breast}
        <Big type="PUMP" label="Pump" active={!!runningOf('PUMP')} onClick={() => startTimer(cid, 'PUMP')} />
        <Big type="SOLIDS" label="Solids" onClick={() => go('/event/new/SOLIDS')} />
        <Big type="MED" label="Medication" onClick={() => go('/event/new/MED')} />
        <Big type="ACTIVITY" label="Activity" onClick={() => go('/event/new/ACTIVITY')} />
      </section>

      {nap && (
        <section className="card">
          <h2>Next nap</h2>
          {nap.sleeping ? <p>Sleeping now.</p> : (
            <p className="big">
              {fmtTime(nap.from, s)} – {fmtTime(nap.to, s)}
              <small> · wake window ~{nap.windowMin} min ({nap.basis === 'own' ? 'from recent days' : 'typical for age'})</small>
            </p>
          )}
          <p className="muted">Rough guide only, not medical advice. Reminders show only while the app is open.</p>
        </section>
      )}

      <section className="card">
        <h2>Last</h2>
        {recent.length === 0 && <p className="muted">Nothing logged yet.</p>}
        <ul className="list">
          {recent.slice(-10).reverse().map(e => (
            <li key={e.id}>
              <a href={`#/event/${e.id}`} style={{ '--c': EVENT_META[e.type].color } as CSSProperties}>
                <time>{fmtTime(e.startTime, s)}</time>
                <span aria-hidden>{EVENT_META[e.type].icon}</span>
                <span>{EVENT_META[e.type].label} <span className="muted">{describe(e, now, s)}</span></span>
              </a>
            </li>
          ))}
        </ul>
      </section>
      <p><a href="#/backup">Backup &amp; export</a></p>
    </>
  )
}

function Big({ type, label, active, onClick }: { type: EventType; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button className="big-btn" aria-pressed={active} style={{ '--c': EVENT_META[type].color } as CSSProperties} onClick={onClick}>
      <span aria-hidden className="icon">{EVENT_META[type].icon}</span>{label}
    </button>
  )
}

function TimerBanner({ ev, now, onStopped }: { ev: BabyEvent; now: number; onStopped?: () => void }) {
  const m = EVENT_META[ev.type]
  const toast = useToast()
  const stop = async () => {
    await stopTimer(ev)
    onStopped?.()
    toast({ msg: `${m.label} saved`, undo: () => db.events.update(ev.id!, { endTime: null, running: 1, payload: ev.payload }) })
  }
  const side = (sd: 'L' | 'R') => {
    if (ev.type !== 'BREAST') return
    const next = ev.payload.side === sd ? null : sd
    if (next) setSetting('lastBreastSide', next)
    db.events.update(ev.id!, { payload: switchSide(ev.payload, next) })
  }
  return (
    <section className="banner timer" style={{ '--c': m.color } as CSSProperties} aria-live="off">
      <a href={`#/event/${ev.id}`} className="timer-main">
        <span aria-hidden>{m.icon}</span> {m.label} <strong className="clock">{fmtClock(now - ev.startTime)}</strong>
      </a>
      {ev.type === 'BREAST' && (
        <div className="sides">
          {(['L', 'R'] as const).map(sd => (
            <button key={sd} className="huge" aria-pressed={ev.payload.side === sd} onClick={() => side(sd)}>
              {sd === 'L' ? 'Left' : 'Right'}<small>{fmtClock(sideMs(ev.payload, sd, now))}</small>
            </button>
          ))}
        </div>
      )}
      <button className="primary stop" onClick={stop}>Stop</button>
    </section>
  )
}
