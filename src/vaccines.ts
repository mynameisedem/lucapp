import { addDays, addMonths, format, startOfDay } from 'date-fns'

/** Hungarian vaccination plan ("Védőoltási tervezet"). month may be fractional: 3.5 = 3 months + 15 days. */
export type Dose = { id: string; name: string; optional?: boolean; note?: string }
export const VACCINE_PLAN: { month: number; age: string; doses: Dose[] }[] = [
  { month: 0, age: 'Újszülött (max. 1 év)', doses: [{ id: 'bcg', name: 'BCG' }] },
  { month: 2, age: '2 hó', doses: [{ id: 'pentaxim-1', name: 'Pentaxim (I.)' }, { id: 'prevenar-1', name: 'Prevenar13 (I.)' }, { id: 'rotateq-1', name: 'Rotateq (I.)', optional: true }] },
  { month: 3, age: '3 hó', doses: [{ id: 'pentaxim-2', name: 'Pentaxim (II.)' }, { id: 'menc-1', name: 'Neisvac-C/Nimenrix (I.)', optional: true }, { id: 'rotateq-2', name: 'Rotateq (II.)', optional: true }] },
  { month: 3.5, age: '3,5 hó', doses: [{ id: 'bexsero-1', name: 'Bexsero (I.)', optional: true }] },
  { month: 4, age: '4 hó', doses: [{ id: 'pentaxim-3', name: 'Pentaxim (III.)' }, { id: 'prevenar-2', name: 'Prevenar13 (II.)' }, { id: 'rotateq-3', name: 'Rotateq (III.)', optional: true }] },
  { month: 6, age: '6 hó', doses: [{ id: 'menc-2', name: 'Neisvac-C/Nimenrix (II.)', optional: true }, { id: 'bexsero-2', name: 'Bexsero (II.)', optional: true }] },
  { month: 12, age: '12 hó', doses: [{ id: 'prevenar-3', name: 'Prevenar13 (III.)' }, { id: 'menc-3', name: 'Neisvac-C/Nimenrix (III.)', optional: true }, { id: 'twinrix-1', name: 'Twinrix (I.)', optional: true }] },
  { month: 13, age: '13 hó', doses: [{ id: 'varivax-1', name: 'Varivax (I.)' }, { id: 'twinrix-2', name: 'Twinrix (II.)', optional: true }] },
  { month: 15, age: '15 hó', doses: [{ id: 'mmr-1', name: 'M-M-RVaxPro/Priorix (I.)' }, { id: 'bexsero-3', name: 'Bexsero (III.)', optional: true }] },
  { month: 16, age: '16 hó', doses: [{ id: 'varivax-2', name: 'Varivax (II.)' }] },
  { month: 18, age: '18 hó', doses: [{ id: 'pentaxim-4', name: 'Pentaxim (IV.)' }, { id: 'twinrix-3', name: 'Twinrix (III.)', optional: true }] },
  { month: 72, age: '6 év', doses: [{ id: 'tetraxim', name: 'Tetraxim/Adacel Polio' }] },
  { month: 108, age: '9 év', doses: [{ id: 'gardasil-1', name: 'Gardasil 9 (I.)', optional: true, note: 'lányok, fiúk' }] },
  { month: 114, age: '9,5 év', doses: [{ id: 'gardasil-2', name: 'Gardasil 9 (II.)', optional: true, note: 'lányok, fiúk' }] },
  { month: 132, age: '11 év (6. osztály)', doses: [{ id: 'mmr-2', name: 'M-M-RVaxPro/Priorix (II.)' }, { id: 'boostrix', name: 'Boostrix' }] },
  { month: 144, age: '12 év (7. osztály)', doses: [
    { id: 'engerix', name: 'Engerix-B', note: 'ha nem kapott korábban Twinrixet' },
    { id: 'cervarix-1', name: 'Cervarix (I.)', optional: true, note: 'lányok, önkéntes, ingyenes, ha nem kapott korábban Gardasil 9-et' },
  ] },
  { month: 150, age: '12,5 év', doses: [{ id: 'cervarix-2', name: 'Cervarix (II.)', optional: true }] },
]

export const DISEASES: Record<string, string> = {
  BCG: 'tuberculosis', Pentaxim: 'diftéria, tetanus, pertussis, polio, hemophilus', Prevenar13: 'pneumococcus',
  Varivax: 'varicella', 'M-M-RVaxPro/Priorix': 'mumps, morbilli, rubeola', 'Tetraxim/Adacel Polio': 'diftéria, tetanus, pertussis, polio',
  Boostrix: 'diftéria, tetanus, pertussis', 'Engerix-B': 'hepatitis B', Rotateq: 'rotavirus',
  'Neisvac-C/Nimenrix': 'meningococcus C / ACWY', Bexsero: 'meningococcus B', Twinrix: 'hepatitis A+B',
  'Gardasil 9': 'HPV (6, 11, 16, 18, 31, 33, 45, 52, 58)', Cervarix: 'HPV (16, 18)',
}
export const disease = (dose: Dose) => DISEASES[dose.name.replace(/ \(.*\)$/, '')]

export const vaccineDue = (birthDate: string, month: number) =>
  addDays(addMonths(new Date(birthDate + 'T00:00'), Math.floor(month)), Math.round((month % 1) * 30))

type Row = (typeof VACCINE_PLAN)[number]
type Rec = { birthDate: string; vaccines?: Record<string, string>; vaccineAppts?: Record<string, string> }

/**
 * Home reminder. A booked appointment (local yyyy-MM-ddTHH:mm) shows from the day before until it starts.
 * Otherwise the first row with an unchecked mandatory dose shows from a week before its due date,
 * unless it already has an appointment still ahead.
 */
export function vaccineReminder(c: Rec, now = Date.now()): { row: Row; at?: number } | undefined {
  const given = c.vaccines ?? {}, appts = c.vaccineAppts ?? {}
  const apptAt = (r: Row) => (appts[r.month] ? new Date(appts[r.month]).getTime() : undefined)
  for (const row of VACCINE_PLAN) {
    const at = apptAt(row)
    if (at && now < at && addDays(startOfDay(at), -1).getTime() <= now && row.doses.some(d => !given[d.id])) return { row, at }
  }
  const row = VACCINE_PLAN.find(r => r.doses.some(d => !d.optional && !given[d.id]))
  if (!row || addDays(vaccineDue(c.birthDate, row.month), -7).getTime() > now) return
  const at = apptAt(row)
  return at && at > now ? undefined : { row }
}

export const fmtDate = (d: Date) => format(d, 'yyyy-MM-dd')
