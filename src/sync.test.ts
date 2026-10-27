import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { LucaDB } from './db'
import { sync, type RemoteIO, type SyncDoc } from './sync'

let n = 0
const fresh = () => new LucaDB('test-' + ++n)

/** Stands in for the Drive file; JSON round trip mimics upload/download. */
const memoryDrive = (): RemoteIO & { file: string | null } => ({
  file: null,
  async read() { return this.file && JSON.parse(this.file) },
  async write(doc: SyncDoc) { this.file = JSON.stringify(doc) },
})

describe('schema v2', () => {
  it('migrates v1 data by giving every row a uid', async () => {
    const name = 'migrate-' + ++n
    const v1 = new Dexie(name)
    v1.version(1).stores({ children: '++id, name, birthDate', events: '++id, childId, type, startTime, endTime, running, [childId+startTime], [childId+type+startTime]', growth: '++id, childId, date', settings: 'key' })
    await v1.table('children').add({ name: 'Luca', birthDate: '2026-06-01' })
    await v1.table('events').add({ childId: 1, type: 'DIAPER', startTime: 1, endTime: 1, payload: { kind: 'wet' }, tz: 'UTC', createdAt: 1, updatedAt: 1 })
    v1.close()

    const db = new LucaDB(name)
    const [child] = await db.children.toArray()
    const [ev] = await db.events.toArray()
    expect(child.uid).toMatch(/^[0-9a-f-]{36}$/)
    expect(ev.uid).toMatch(/^[0-9a-f-]{36}$/)
    expect([child.updatedAt, ev.updatedAt]).toEqual([0, 1])
  })

  it('stamps writes and records deletes', async () => {
    const db = fresh()
    const id = (await db.children.add({ name: 'Luca', birthDate: '2026-06-01' }))!
    const before = (await db.children.get(id))!
    expect(before.uid).toBeTruthy()
    await new Promise(r => setTimeout(r, 5))
    await db.children.update(id, { name: 'Luka' })
    expect((await db.children.get(id))!.updatedAt).toBeGreaterThan(before.updatedAt!)
    await db.children.delete(id)
    await new Promise(r => setTimeout(r, 20))
    expect((await db.deleted.toArray()).map(t => t.uid)).toEqual([before.uid])
  })
})

describe('two phones syncing through one file', () => {
  async function pair() {
    const drive = memoryDrive()
    const mine = fresh(), hers = fresh()
    await mine.children.add({ name: 'Luca', birthDate: '2026-06-01' })
    await sync(mine, drive)
    await sync(hers, drive) // her phone starts empty and pulls the child
    return { drive, mine, hers }
  }
  const kinds = async (db: LucaDB) => (await db.events.toArray()).map(e => e.type === 'DIAPER' ? e.payload.kind : e.type).sort()

  it('shares the child and both phones\' events', async () => {
    const { drive, mine, hers } = await pair()
    const herChild = (await hers.children.toArray())[0]
    expect(herChild.name).toBe('Luca')
    await mine.events.add({ childId: 1, type: 'DIAPER', startTime: 1, endTime: 1, payload: { kind: 'wet' }, tz: 'UTC', createdAt: 1, updatedAt: 1 })
    await hers.events.add({ childId: herChild.id!, type: 'DIAPER', startTime: 2, endTime: 2, payload: { kind: 'dirty' }, tz: 'UTC', createdAt: 2, updatedAt: 2 })
    await sync(mine, drive)
    await sync(hers, drive)
    await sync(mine, drive)
    expect(await kinds(mine)).toEqual(['dirty', 'wet'])
    expect(await kinds(hers)).toEqual(['dirty', 'wet'])
  })

  it('newest edit wins and deletes propagate', async () => {
    const { drive, mine, hers } = await pair()
    const id = (await mine.events.add({ childId: 1, type: 'DIAPER', startTime: 1, endTime: 1, payload: { kind: 'wet' }, tz: 'UTC', createdAt: 1, updatedAt: 1 }))!
    await sync(mine, drive)
    await sync(hers, drive)
    const herEv = (await hers.events.toArray())[0]
    await new Promise(r => setTimeout(r, 5))
    await hers.events.update(herEv.id!, { payload: { kind: 'both' } })
    await sync(hers, drive)
    await sync(mine, drive)
    expect(await kinds(mine)).toEqual(['both'])

    await mine.events.delete(id)
    await new Promise(r => setTimeout(r, 20))
    await sync(mine, drive)
    await sync(hers, drive)
    expect(await hers.events.count()).toBe(0)
  })

  it('keeps a running timer running on the other phone', async () => {
    const { drive, mine, hers } = await pair()
    await mine.events.add({ childId: 1, type: 'SLEEP', startTime: 5, endTime: null, running: 1, payload: {}, tz: 'UTC', createdAt: 5, updatedAt: 5 })
    await sync(mine, drive)
    await sync(hers, drive)
    expect(await hers.events.where('running').equals(1).count()).toBe(1)
  })

  it('rejects a foreign Drive file without touching local data', async () => {
    const db = fresh()
    await db.children.add({ name: 'Luca', birthDate: '2026-06-01' })
    const drive = memoryDrive()
    drive.file = '{"hello":1}'
    await expect(sync(db, drive)).rejects.toThrow('not Luca sync data')
    expect(await db.children.count()).toBe(1)
    expect(drive.file).toBe('{"hello":1}')
  })
})
