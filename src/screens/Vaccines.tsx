import { db, type Child } from '../db'
import { useChild } from '../App'
import { disease, fmtDate, VACCINE_PLAN, vaccineDue } from '../vaccines'

/** Sets or clears one key of a child's map; modify() reads the stored row so quick edits don't clobber each other. */
const setKey = (id: number, field: 'vaccines' | 'vaccineAppts', key: string, value: string) =>
  db.children.where('id').equals(id).modify((c: Child) => {
    const m = { ...c[field] }
    if (value) m[key] = value
    else delete m[key]
    c[field] = m
  })

export function Vaccines() {
  const child = useChild()
  const given = child.vaccines ?? {}
  const appts = child.vaccineAppts ?? {}
  const today = fmtDate(new Date())

  return (
    <>
      <h1>Védőoltások</h1>
      <p className="muted small">Választható oltások dőlt betűvel. Pipáld ki, ha beadták; az előjegyzésről előtte egy nappal a Home emlékeztet.</p>
      {VACCINE_PLAN.map(row => {
        const done = row.doses.every(d => given[d.id])
        return (
          <section key={row.month} className="card">
            <h2 className="row between"><span>{done && '✅ '}{row.age}</span><span className="muted small">esedékes {fmtDate(vaccineDue(child.birthDate, row.month))}</span></h2>
            {row.doses.map(d => (
              <div key={d.id} className="vaccine">
                <label className="row">
                  <input type="checkbox" checked={!!given[d.id]} onChange={e => setKey(child.id!, 'vaccines', d.id, e.target.checked ? today : '')} />
                  <span>
                    {d.optional ? <em>{d.name}</em> : <strong>{d.name}</strong>}
                    <small className="muted"> {[disease(d), d.note].filter(Boolean).join(' · ')}</small>
                  </span>
                </label>
                {given[d.id] && (
                  <label className="row small">Beadva
                    <input type="date" required aria-label={`${d.name} beadás dátuma`} value={given[d.id]} onChange={e => e.target.value && setKey(child.id!, 'vaccines', d.id, e.target.value)} />
                  </label>
                )}
              </div>
            ))}
            {!done && (
              <label className="row small vaccine">Előjegyzés
                <input type="datetime-local" aria-label={`${row.age} előjegyzés`} value={appts[row.month] ?? ''} onChange={e => setKey(child.id!, 'vaccineAppts', String(row.month), e.target.value)} />
              </label>
            )}
          </section>
        )
      })}
    </>
  )
}
