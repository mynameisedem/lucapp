import { useEffect, useState } from 'react'
import { db, defaultPayload, EVENT_META, saveEvent, tz, TIMED, type BabyEvent, type EventType, type Payloads } from '../db'
import { go, useChild, useToast } from '../App'
import { useSettings } from '../settings'
import { fromLocalInput, fromMl, toLocalInput, toMl, volUnit } from '../format'

export function EventEditor({ id, type }: { id?: string; type?: string }) {
  const child = useChild()
  const [ev, setEv] = useState<BabyEvent | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (id === 'new') {
      const t = (type && type in EVENT_META ? type : 'DIAPER') as EventType
      const now = Date.now()
      setEv({
        childId: child.id!, type: t, startTime: TIMED.includes(t) ? now - 30 * 60_000 : now, endTime: now,
        payload: defaultPayload(t), tz: tz(), createdAt: now, updatedAt: now,
      } as BabyEvent)
    } else db.events.get(Number(id)).then(e => (e ? setEv(e) : setMissing(true)))
  }, [id, type, child.id])

  if (missing) return <p>Event not found. <a href="#/timeline">Back</a></p>
  if (!ev) return null
  return <Form initial={ev} />
}

function Form({ initial }: { initial: BabyEvent }) {
  const s = useSettings()
  const toast = useToast()
  const [ev, setEv] = useState(initial)
  const [error, setError] = useState('')
  const m = EVENT_META[ev.type]
  const timed = TIMED.includes(ev.type)
  const set = (patch: Partial<BabyEvent>) => setEv({ ...ev, ...patch } as BabyEvent)
  const pay = (patch: Partial<Payloads[EventType]>) => set({ payload: { ...ev.payload, ...patch } } as Partial<BabyEvent>)
  const p = ev.payload as Record<string, never>

  const save = async () => {
    if (ev.endTime !== null && ev.endTime < ev.startTime) return setError('End is before start')
    await saveEvent(ev)
    history.back()
  }
  const remove = async () => {
    await db.events.delete(ev.id!)
    toast({ msg: `${m.label} deleted`, undo: () => db.events.put(initial) })
    go('/timeline')
  }

  return (
    <form className="form" onSubmit={e => { e.preventDefault(); save() }}>
      <h1><span aria-hidden>{m.icon}</span> {ev.id ? 'Edit' : 'New'} {m.label.toLowerCase()}</h1>

      <label>{timed ? 'Start' : 'Time'}
        <input type="datetime-local" required value={toLocalInput(ev.startTime)}
          onChange={e => {
            const t = fromLocalInput(e.target.value)
            set(timed ? { startTime: t } : { startTime: t, endTime: t })
          }} />
      </label>
      {timed && (
        <>
          <label>End
            <input type="datetime-local" disabled={ev.endTime === null} value={ev.endTime ? toLocalInput(ev.endTime) : ''}
              onChange={e => set({ endTime: fromLocalInput(e.target.value) })} />
          </label>
          {ev.endTime === null && <p className="muted">Timer is running. Stop it on the home screen, or <button type="button" className="link" onClick={() => set({ endTime: Date.now() })}>end it now</button>.</p>}
        </>
      )}

      {ev.type === 'SLEEP' && <label>Location<input value={p.location ?? ''} onChange={e => pay({ location: e.target.value })} placeholder="Crib, stroller…" /></label>}

      {ev.type === 'BREAST' && (
        <div className="row">
          <label>Left (min)<input type="number" inputMode="numeric" min={0} value={Math.round(ev.payload.leftMs / 60000)}
            onChange={e => pay({ leftMs: +e.target.value * 60000 })} disabled={ev.payload.side !== null} /></label>
          <label>Right (min)<input type="number" inputMode="numeric" min={0} value={Math.round(ev.payload.rightMs / 60000)}
            onChange={e => pay({ rightMs: +e.target.value * 60000 })} disabled={ev.payload.side !== null} /></label>
        </div>
      )}

      {ev.type === 'BOTTLE' && (
        <>
          <Stepper label={`Amount (${volUnit(s)})`} value={fromMl(ev.payload.ml, s)} step={s.units === 'imperial' ? 0.5 : s.bottleStepMl}
            onChange={v => pay({ ml: toMl(v, s) })} />
          <Choice value={ev.payload.contents} options={[['breast', 'Breast milk'], ['formula', 'Formula']]} onChange={v => pay({ contents: v })} />
        </>
      )}

      {ev.type === 'SOLIDS' && <label>Food<input value={ev.payload.food} onChange={e => pay({ food: e.target.value })} /></label>}

      {ev.type === 'DIAPER' && <Choice value={ev.payload.kind} options={[['wet', 'Wet'], ['dirty', 'Poop'], ['both', 'Both']]} onChange={v => pay({ kind: v })} />}

      {ev.type === 'PUMP' && (
        <div className="row">
          <Stepper label={`Left (${volUnit(s)})`} value={fromMl(ev.payload.leftMl, s)} step={s.units === 'imperial' ? 0.5 : s.bottleStepMl} onChange={v => pay({ leftMl: toMl(v, s) })} />
          <Stepper label={`Right (${volUnit(s)})`} value={fromMl(ev.payload.rightMl, s)} step={s.units === 'imperial' ? 0.5 : s.bottleStepMl} onChange={v => pay({ rightMl: toMl(v, s) })} />
        </div>
      )}

      {ev.type === 'MED' && (
        <>
          <label>Name<input required value={ev.payload.name} onChange={e => pay({ name: e.target.value })} /></label>
          <label>Dose<input value={ev.payload.dose} onChange={e => pay({ dose: e.target.value })} placeholder="e.g. 2.5 ml" /></label>
        </>
      )}

      {ev.type === 'ACTIVITY' && (
        <>
          <Choice value={ev.payload.kind} options={[['tummy', 'Tummy time'], ['bath', 'Bath'], ['walk', 'Walk'], ['other', 'Other']]} onChange={v => pay({ kind: v })} />
          <Stepper label="Duration (min)" value={ev.payload.minutes} step={5} onChange={v => pay({ minutes: v })} />
        </>
      )}

      <label>Notes<textarea rows={2} value={ev.notes ?? ''} onChange={e => set({ notes: e.target.value })} /></label>
      {error && <p className="error" role="alert">{error}</p>}

      <div className="row">
        <button type="submit" className="primary">Save</button>
        <button type="button" onClick={() => history.back()}>Cancel</button>
        {ev.id && <button type="button" className="danger" onClick={remove}>Delete</button>}
      </div>
    </form>
  )
}

function Stepper({ label, value, step, onChange }: { label: string; value: number; step: number; onChange: (v: number) => void }) {
  const clamp = (v: number) => Math.max(0, +v.toFixed(1))
  return (
    <div className="stepper">
      <span>{label}</span>
      <div className="row">
        <button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(clamp(value - step))}>−</button>
        <input type="number" inputMode="decimal" aria-label={label} min={0} step="any" value={value} onChange={e => onChange(clamp(+e.target.value))} />
        <button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(clamp(value + step))}>+</button>
      </div>
    </div>
  )
}

function Choice<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="chips" role="radiogroup">
      {options.map(([v, l]) => (
        <button type="button" key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  )
}
