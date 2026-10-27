import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addEvent, db, runningTimers, startTimer, stopTimer } from './db'
import { eventsCsv, exportJson, importJson } from './backup'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('db', () => {
  it('opens at the current schema with the indexes the app queries', () => {
    expect(db.verno).toBe(2)
    const idx = db.events.schema.indexes.map(i => i.name)
    expect(idx).toEqual(expect.arrayContaining(['uid', 'running', '[childId+startTime]', '[childId+type+startTime]']))
  })

  it('keeps one sleep timer per child and clears the running flag on stop', async () => {
    const a = await startTimer(1, 'SLEEP')
    const b = await startTimer(1, 'SLEEP')
    expect(b).toBe(a)
    const [ev] = await runningTimers(1)
    await stopTimer(ev, ev.startTime + 1000)
    expect(await runningTimers(1)).toEqual([])
    const saved = await db.events.get(a)
    expect(saved!.endTime).toBe(ev.startTime + 1000)
    expect('running' in saved!).toBe(false)
  })
})

describe('backup', () => {
  it('round-trips all data through JSON', async () => {
    const childId = (await db.children.add({ name: 'Luca', birthDate: '2026-06-01' }))!
    await addEvent(childId, 'DIAPER', { payload: { kind: 'both' }, notes: 'a, "b"' })
    await startTimer(childId, 'SLEEP')
    await db.growth.add({ childId, date: '2026-10-01', weightGrams: 6200 })
    await db.settings.put({ key: 'units', value: 'imperial' })
    const json = await exportJson()

    await db.events.clear()
    await db.children.clear()
    await importJson(json)
    const strip = (j: string) => ({ ...JSON.parse(j), exportedAt: 0 })
    expect(strip(await exportJson())).toEqual(strip(json))
    expect(await runningTimers(childId)).toHaveLength(1)
  })

  it('rejects foreign files without touching data', async () => {
    await db.children.add({ name: 'Luca', birthDate: '2026-06-01' })
    await expect(importJson('{"hello":1}')).rejects.toThrow('Not a Luca backup')
    expect(await db.children.count()).toBe(1)
  })

  it('escapes CSV cells', async () => {
    await addEvent(1, 'DIAPER', { startTime: 0, endTime: 0, payload: { kind: 'wet' }, notes: 'a, "b"' })
    const csv = eventsCsv(await db.events.toArray(), 'DIAPER')
    expect(csv.split('\n')[0]).toBe('start,end,kind,notes,timezone')
    expect(csv.split('\n')[1]).toMatch(/,wet,"a, ""b""",/)
  })
})
