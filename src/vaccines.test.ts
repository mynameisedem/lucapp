import { describe, expect, it } from 'vitest'
import { fmtDate, vaccineDue, vaccineReminder } from './vaccines'

const t = (s: string) => new Date(s).getTime()

describe('vaccination plan', () => {
  const birthDate = '2026-06-01'
  it('computes due dates, including half months', () => {
    expect(fmtDate(vaccineDue(birthDate, 2))).toBe('2026-08-01')
    expect(fmtDate(vaccineDue(birthDate, 3.5))).toBe('2026-09-16')
  })

  it('reminds of the first unchecked mandatory dose from a week before it is due', () => {
    expect(vaccineReminder({ birthDate }, t('2026-06-01T12:00'))?.row.age).toMatch(/Újszülött/)
    const c = { birthDate, vaccines: { bcg: '2026-06-03' } }
    expect(vaccineReminder(c, t('2026-07-24T12:00'))).toBeUndefined()
    expect(vaccineReminder(c, t('2026-07-25T12:00'))?.row.month).toBe(2)
    // optional doses (Rotateq, 3.5-month Bexsero) never block or trigger the due reminder
    const vaccines = { bcg: 'x', 'pentaxim-1': 'x', 'prevenar-1': 'x', 'pentaxim-2': 'x' }
    expect(vaccineReminder({ birthDate, vaccines }, t('2026-09-20T12:00'))).toBeUndefined()
    expect(vaccineReminder({ birthDate, vaccines }, t('2026-09-25T12:00'))?.row.month).toBe(4)
  })

  it('reminds of a booked appointment from the day before, and not of its due date before then', () => {
    const c = { birthDate, vaccines: { bcg: 'x' }, vaccineAppts: { 2: '2026-08-05T10:30' } }
    expect(vaccineReminder(c, t('2026-08-01T12:00'))).toBeUndefined() // due, but booked
    expect(vaccineReminder(c, t('2026-08-03T23:59'))).toBeUndefined()
    expect(vaccineReminder(c, t('2026-08-04T00:00'))).toEqual({ row: expect.objectContaining({ month: 2 }), at: t('2026-08-05T10:30') })
    expect(vaccineReminder(c, t('2026-08-05T11:00'))?.at).toBeUndefined() // past and still unchecked: back to due reminder
    // an optional-only row with an appointment still reminds
    const opt = { birthDate, vaccines: { bcg: 'x', 'pentaxim-1': 'x', 'prevenar-1': 'x', 'pentaxim-2': 'x' }, vaccineAppts: { 3.5: '2026-09-16T09:00' } }
    expect(vaccineReminder(opt, t('2026-09-15T08:00'))?.row.month).toBe(3.5)
  })
})
