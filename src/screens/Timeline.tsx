import { useRef, useState, type CSSProperties } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { addDays, format, parse } from 'date-fns'
import { db, EVENT_META, sideMs, type BabyEvent, type EventType } from '../db'
import { go, useChild } from '../App'
import { useSettings } from '../settings'
import { fmtDur, fmtTime, volume } from '../format'
import { dayBounds } from '../logic'
import { useNow } from '../hooks'

const DAY_KEY = 'yyyy-MM-dd'

export function Timeline({ date }: { date?: string }) {
  const s = useSettings()
  const cid = useChild().id!
  const now = useNow(30_000)
  const day = date ? parse(date, DAY_KEY, new Date()) : new Date()
  const [from, to] = dayBounds(day)
  const [hidden, setHidden] = useState<Set<EventType>>(new Set())
  const touchX = useRef(0)

  // Start a day early so sleeps that cross midnight show on both days.
  const events = useLiveQuery(
    () => db.events.where('[childId+startTime]').between([cid, from - 86_400_000], [cid, to]).toArray(), [cid, from, to]) ?? []
  const today = events.filter(e => (e.endTime ?? now) > from || e.startTime >= from)
  const shown = today.filter(e => !hidden.has(e.type))

  const shift = (n: number) => go('/timeline/' + format(addDays(day, n), DAY_KEY))
  const toggle = (t: EventType) => {
    const next = new Set(hidden)
    if (!next.delete(t)) next.add(t)
    setHidden(next)
  }

  return (
    <div
      onTouchStart={e => { touchX.current = e.touches[0].clientX }}
      onTouchEnd={e => {
        const dx = e.changedTouches[0].clientX - touchX.current
        if (Math.abs(dx) > 70) shift(dx < 0 ? 1 : -1)
      }}
    >
      <header className="row between">
        <button aria-label="Previous day" onClick={() => shift(-1)}>‹</button>
        <input type="date" aria-label="Jump to date" value={format(day, DAY_KEY)} onChange={e => e.target.value && go('/timeline/' + e.target.value)} />
        <button aria-label="Next day" onClick={() => shift(1)}>›</button>
      </header>

      <div className="strip" role="img" aria-label="24-hour overview">
        {shown.map(e => {
          const a = Math.max(e.startTime, from), b = Math.min(e.endTime ?? now, to)
          const style = { left: `${((a - from) / (to - from)) * 100}%`, width: `${Math.max(0.6, ((b - a) / (to - from)) * 100)}%`, background: EVENT_META[e.type].color }
          return <span key={e.id} style={style} />
        })}
        {[6, 12, 18].map(h => <i key={h} style={{ left: `${(h / 24) * 100}%` }}>{h}</i>)}
      </div>

      <div className="chips" aria-label="Filter">
        {(Object.keys(EVENT_META) as EventType[]).map(t => (
          <button key={t} aria-pressed={!hidden.has(t)} onClick={() => toggle(t)} style={{ '--c': EVENT_META[t].color } as CSSProperties}>
            <span aria-hidden>{EVENT_META[t].icon}</span> {EVENT_META[t].label}
          </button>
        ))}
      </div>

      {shown.length === 0 && <p className="muted">Nothing logged.</p>}
      <ul className="list">
        {[...shown].reverse().map(e => (
          <li key={e.id}>
            <a href={`#/event/${e.id}`} style={{ '--c': EVENT_META[e.type].color } as CSSProperties}>
              <time>{fmtTime(e.startTime, s)}</time>
              <span aria-hidden>{EVENT_META[e.type].icon}</span>
              <span>{EVENT_META[e.type].label} <span className="muted">{describe(e, now, s)}</span></span>
            </a>
          </li>
        ))}
      </ul>
      <AddMenu />
    </div>
  )
}

function AddMenu() {
  return (
    <details className="add-menu">
      <summary>Add past event</summary>
      <div className="chips">
        {(Object.keys(EVENT_META) as EventType[]).map(t => <a key={t} className="chip" href={`#/event/new/${t}`}>{EVENT_META[t].icon} {EVENT_META[t].label}</a>)}
      </div>
    </details>
  )
}

export function describe(e: BabyEvent, now: number, s: ReturnType<typeof useSettings>) {
  const dur = e.endTime === null ? `running ${fmtDur(now - e.startTime)}` : e.endTime > e.startTime ? fmtDur(e.endTime - e.startTime) : ''
  const extra = (() => {
    switch (e.type) {
      case 'BOTTLE': return `${volume(e.payload.ml, s)} ${e.payload.contents === 'breast' ? 'breast milk' : 'formula'}`
      case 'BREAST': return `L ${fmtDur(sideMs(e.payload, 'L', now))} · R ${fmtDur(sideMs(e.payload, 'R', now))}`
      case 'DIAPER': return e.payload.kind
      case 'PUMP': return volume(e.payload.leftMl + e.payload.rightMl, s)
      case 'SOLIDS': return e.payload.food
      case 'MED': return `${e.payload.name} ${e.payload.dose}`
      case 'ACTIVITY': return `${e.payload.kind} ${e.payload.minutes}m`
      case 'SLEEP': return e.payload.location ?? ''
    }
  })()
  return [dur, extra, e.notes].filter(Boolean).join(' · ')
}
