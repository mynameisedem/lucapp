import type { CSSProperties } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { formatDistanceStrict } from 'date-fns'
import { addEvent, db, EVENT_META, runningTimers, sideMs, startTimer, stopTimer, switchSide, type BabyEvent, type Child, type EventType } from '../db'
import { go, useChild, useToast } from '../App'
import { setSetting, useSettings } from '../settings'
import { fmtClock, fmtTime } from '../format'
import { useNow } from '../hooks'
import { suggestNap } from '../logic'

const DAY = 86_400_000

export function Home({ kids }: { kids: Child[] }) {
  const child = useChild()
  const s = useSettings()
  const toast = useToast()
  const now = useNow()
  const cid = child.id!
  const running = useLiveQuery(() => runningTimers(cid), [cid]) ?? []
  const recent = useLiveQuery(
    () => db.events.where('[childId+startTime]').between([cid, Date.now() - 8 * DAY], [cid, Infinity]).toArray(), [cid]) ?? []
  const lastOf = (...types: EventType[]) => recent.filter(e => types.includes(e.type)).at(-1)

  const logDiaper = async (kind: 'wet' | 'dirty' | 'both') => {
    const id = await addEvent(cid, 'DIAPER', { payload: { kind } })
    toast({ msg: `Diaper (${kind}) logged`, undo: () => db.events.delete(id) })
  }
  const start = (type: EventType) => startTimer(cid, type, type === 'BREAST' ? switchSide(
    { leftMs: 0, rightMs: 0, side: null, sideSince: null }, 'L') : undefined)

  const nap = suggestNap(recent.filter(e => e.type === 'SLEEP'), child, now)
  const backupDue = s.backupEveryDays > 0 && now - s.lastBackup > s.backupEveryDays * DAY

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

      {running.map(ev => <TimerBanner key={ev.id} ev={ev} now={now} />)}

      <section className="grid" aria-label="Quick log">
        <Big type="SLEEP" label={running.some(e => e.type === 'SLEEP') ? 'Sleeping…' : 'Start sleep'} onClick={() => start('SLEEP')} />
        {s.feedDefault === 'BREAST'
          ? <Big type="BREAST" label="Start feed" onClick={() => start('BREAST')} />
          : <Big type="BOTTLE" label="Bottle" onClick={() => go('/event/new/BOTTLE')} />}
        <Big type="DIAPER" label="Wet" onClick={() => logDiaper('wet')} />
        <Big type="DIAPER" label="Dirty" onClick={() => logDiaper('dirty')} />
        <Big type="DIAPER" label="Both" onClick={() => logDiaper('both')} />
        {s.feedDefault === 'BREAST'
          ? <Big type="BOTTLE" label="Bottle" onClick={() => go('/event/new/BOTTLE')} />
          : <Big type="BREAST" label="Breastfeed" onClick={() => start('BREAST')} />}
        <Big type="PUMP" label="Pump" onClick={() => start('PUMP')} />
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
        <Last label="Sleep" ev={lastOf('SLEEP')} now={now} />
        <Last label="Feed" ev={lastOf('BREAST', 'BOTTLE', 'SOLIDS')} now={now} />
        <Last label="Diaper" ev={lastOf('DIAPER')} now={now} />
      </section>
      <p><a href="#/backup">Backup &amp; export</a></p>
    </>
  )
}

function Big({ type, label, onClick }: { type: EventType; label: string; onClick: () => void }) {
  return (
    <button className="big-btn" style={{ '--c': EVENT_META[type].color } as CSSProperties} onClick={onClick}>
      <span aria-hidden className="icon">{EVENT_META[type].icon}</span>{label}
    </button>
  )
}

function Last({ label, ev, now }: { label: string; ev?: BabyEvent; now: number }) {
  const s = useSettings()
  if (!ev) return <p>{label}: —</p>
  const ref = ev.endTime ?? ev.startTime
  return (
    <p>
      <a href={`#/event/${ev.id}`}>{label}: {EVENT_META[ev.type].label} at {fmtTime(ev.startTime, s)}</a>
      <span className="muted"> · {ev.endTime === null ? 'running' : formatDistanceStrict(ref, now) + ' ago'}</span>
    </p>
  )
}

function TimerBanner({ ev, now }: { ev: BabyEvent; now: number }) {
  const m = EVENT_META[ev.type]
  const toast = useToast()
  const stop = async () => {
    await stopTimer(ev)
    toast({ msg: `${m.label} saved`, undo: () => db.events.update(ev.id!, { endTime: null, running: 1, payload: ev.payload }) })
  }
  const side = (sd: 'L' | 'R') => {
    if (ev.type !== 'BREAST') return
    db.events.update(ev.id!, { payload: switchSide(ev.payload, ev.payload.side === sd ? null : sd) })
  }
  return (
    <section className="banner timer" style={{ '--c': m.color } as CSSProperties} aria-live="off">
      <a href={`#/event/${ev.id}`} className="timer-main">
        <span aria-hidden>{m.icon}</span> {m.label} <strong className="clock">{fmtClock(now - ev.startTime)}</strong>
      </a>
      {ev.type === 'BREAST' && (['L', 'R'] as const).map(sd => (
        <button key={sd} aria-pressed={ev.payload.side === sd} onClick={() => side(sd)}>
          {sd === 'L' ? 'Left' : 'Right'} {fmtClock(sideMs(ev.payload, sd, now))}
        </button>
      ))}
      <button className="primary" onClick={stop}>Stop</button>
    </section>
  )
}
