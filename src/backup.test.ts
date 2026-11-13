import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addEvent, db, nextBreastSide, runningTimers, startFeed, startTimer, stopTimer, switchSide } from './db'
import { eventsCsv } from './backup'

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

describe('breast side', () => {
  it('offers the side not used last, from the latest feed', async () => {
    expect(await nextBreastSide(1)).toBe('L')
    const id = await startFeed(1) // L
    const ev = (await db.events.get(id))!
    if (ev.type !== 'BREAST') throw new Error()
    await db.events.update(id, { payload: switchSide(ev.payload, 'R') }) // switched to R during the feed
    await stopTimer((await db.events.get(id))!)
    expect(await nextBreastSide(1)).toBe('L')
    await startFeed(1)
    expect(await nextBreastSide(1)).toBe('R')
  })
})

describe('csv export', () => {
  it('escapes CSV cells', async () => {
    await addEvent(1, 'DIAPER', { startTime: 0, endTime: 0, payload: { kind: 'wet' }, notes: 'a, "b"' })
    const csv = eventsCsv(await db.events.toArray(), 'DIAPER')
    expect(csv.split('\n')[0]).toBe('start,end,kind,notes,timezone')
    expect(csv.split('\n')[1]).toMatch(/,wet,"a, ""b""",/)
  })
})
