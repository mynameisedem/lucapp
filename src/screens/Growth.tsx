import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { db, type Growth as G } from '../db'
import { useChild, useToast } from '../App'
import { useSettings } from '../settings'
import { fromGrams, fromMm, lenUnit, toGrams, toMm, weightUnit } from '../format'
import { Line } from '../Chart'

export function Growth() {
  const s = useSettings()
  const toast = useToast()
  const cid = useChild().id!
  const rows = useLiveQuery(() => db.growth.where('childId').equals(cid).sortBy('date'), [cid]) ?? []
  const [form, setForm] = useState({ date: format(new Date(), 'yyyy-MM-dd'), w: '', l: '', h: '' })
  const num = (v: string) => (v.trim() === '' ? undefined : +v)

  const add = async () => {
    const w = num(form.w), l = num(form.l), h = num(form.h)
    if (w === undefined && l === undefined && h === undefined) return
    await db.growth.add({
      childId: cid, date: form.date,
      weightGrams: w === undefined ? undefined : toGrams(w, s),
      lengthMm: l === undefined ? undefined : toMm(l, s),
      headMm: h === undefined ? undefined : toMm(h, s),
    })
    setForm({ ...form, w: '', l: '', h: '' })
  }
  const remove = async (g: G) => {
    await db.growth.delete(g.id!)
    toast({ msg: 'Entry deleted', undo: () => db.growth.put(g) })
  }
  const pts = (k: 'weightGrams' | 'lengthMm' | 'headMm') =>
    rows.filter(r => r[k] != null).map(r => ({ x: new Date(r.date).getTime(), y: k === 'weightGrams' ? fromGrams(r[k]!, s) : fromMm(r[k]!, s) }))

  return (
    <>
      <h1>Growth</h1>
      <form className="form card" onSubmit={e => { e.preventDefault(); add() }}>
        <label>Date<input type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></label>
        <div className="row">
          <label>Weight ({weightUnit(s)})<input type="number" step="any" inputMode="decimal" value={form.w} onChange={e => setForm({ ...form, w: e.target.value })} /></label>
          <label>Length ({lenUnit(s)})<input type="number" step="any" inputMode="decimal" value={form.l} onChange={e => setForm({ ...form, l: e.target.value })} /></label>
          <label>Head ({lenUnit(s)})<input type="number" step="any" inputMode="decimal" value={form.h} onChange={e => setForm({ ...form, h: e.target.value })} /></label>
        </div>
        <button className="primary">Add</button>
      </form>
      <Line label="Weight" unit={weightUnit(s)} color="#f0a03c" points={pts('weightGrams')} />
      <Line label="Length" unit={lenUnit(s)} color="#42a5f5" points={pts('lengthMm')} />
      <Line label="Head circumference" unit={lenUnit(s)} color="#ab47bc" points={pts('headMm')} />
      <ul className="list">
        {[...rows].reverse().map(r => (
          <li key={r.id} className="row between">
            <span>{r.date}: {[
              r.weightGrams != null && `${fromGrams(r.weightGrams, s)} ${weightUnit(s)}`,
              r.lengthMm != null && `${fromMm(r.lengthMm, s)} ${lenUnit(s)}`,
              r.headMm != null && `head ${fromMm(r.headMm, s)} ${lenUnit(s)}`,
            ].filter(Boolean).join(' · ')}</span>
            <button aria-label={`Delete entry ${r.date}`} onClick={() => remove(r)}>✕</button>
          </li>
        ))}
      </ul>
    </>
  )
}
