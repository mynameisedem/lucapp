import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { LucaDB } from './db'
import { sync, type RemoteIO, type SyncDoc } from './sync'
import { dueFrom, dueSurvey, SURVEYS } from './surveys'

const t = (s: string) => new Date(s).getTime()

describe('védőnő questionnaires', () => {
  it('has the parent questions of each form', () => {
    expect(SURVEYS.map(s => [s.month, s.questions.length])).toEqual([[1, 8], [2, 12], [4, 12], [6, 12], [9, 12], [12, 12]])
  })

  it('is due from a week before the month of age the form belongs to', () => {
    const b = '2026-05-31'
    expect(dueSurvey(b, t('2026-06-22T12:00'))).toBeUndefined()
    expect(dueSurvey(b, t('2026-06-23T12:00'))?.month).toBe(1) // 1 month = Jun 30 (date-fns clamps May 31 + 1 month)
    expect(dueFrom(b, 1)).toBe('2026-06-23')
    expect(dueSurvey(b, t('2026-07-24T12:00'))?.month).toBe(2)
    expect(dueSurvey(b, t('2026-08-24T12:00'))).toBeUndefined() // 3 months: nurse-only form
    expect(dueSurvey(b, t('2027-05-24T00:00'))?.month).toBe(12)
  })

  it('answers sync to another phone', async () => {
    let file: string | null = null
    const io: RemoteIO = { async read() { return file && JSON.parse(file) }, async write(d: SyncDoc) { file = JSON.stringify(d) } }
    const a = new LucaDB('survey-a'), b = new LucaDB('survey-b')
    const id = (await a.children.add({ name: 'Luca', birthDate: '2026-06-01' }))!
    await a.children.update(id, { surveys: { 1: ['yes', null, 'no'] } })
    await sync(a, io)
    await sync(b, io)
    expect((await b.children.toArray())[0].surveys).toEqual({ 1: ['yes', null, 'no'] })
  })
})
