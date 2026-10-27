import { EVENT_META, markSyncTx, type BabyEvent, type Child, type Growth, type LucaDB, type Tombstone } from './db'

type Stamped = { uid: string; updatedAt: number }
type SyncChild = Omit<Child, 'id'> & Stamped
type SyncEvent = Omit<BabyEvent, 'id' | 'childId' | 'running'> & Stamped & { childUid: string }
type SyncGrowth = Omit<Growth, 'id' | 'childId'> & Stamped & { childUid: string }

/** The file shared by all phones. Rows reference children by uid, since local ids differ per phone. */
export interface SyncDoc {
  format: 'luca-sync'
  version: 2
  children: SyncChild[]
  events: SyncEvent[]
  growth: SyncGrowth[]
  deleted: Tombstone[]
}

export interface RemoteIO {
  read(): Promise<unknown | null>
  write(doc: SyncDoc): Promise<void>
}

export async function snapshot(db: LucaDB): Promise<SyncDoc> {
  const [children, events, growth, deleted] = await Promise.all([db.children.toArray(), db.events.toArray(), db.growth.toArray(), db.deleted.toArray()])
  const childUid = new Map(children.map(c => [c.id!, c.uid!]))
  return {
    format: 'luca-sync', version: 2, deleted,
    children: children.map(({ id: _, ...c }) => c as SyncChild),
    events: events.map(({ id: _, childId, running: __, ...e }) => ({ ...e, childUid: childUid.get(childId)! }) as SyncEvent),
    growth: growth.map(({ id: _, childId, ...g }) => ({ ...g, childUid: childUid.get(childId)! }) as SyncGrowth),
  }
}

/** Per uid the newest write wins; a delete newer than (or equal to) the last edit removes the row. */
export function merge(a: SyncDoc, b: SyncDoc): SyncDoc {
  const deleted = new Map<string, number>()
  for (const t of [...a.deleted, ...b.deleted]) deleted.set(t.uid, Math.max(t.deletedAt, deleted.get(t.uid) ?? 0))
  const pick = <T extends Stamped>(x: T[], y: T[]) => {
    const out = new Map<string, T>()
    for (const r of [...x, ...y]) if (!out.has(r.uid) || r.updatedAt > out.get(r.uid)!.updatedAt) out.set(r.uid, r)
    return [...out.values()].filter(r => !(deleted.get(r.uid)! >= r.updatedAt))
  }
  return {
    format: 'luca-sync', version: 2,
    children: pick(a.children, b.children),
    events: pick(a.events, b.events),
    growth: pick(a.growth, b.growth),
    deleted: [...deleted].map(([uid, deletedAt]) => ({ uid, deletedAt })),
  }
}

/** Trust boundary: the Drive file could be anything. */
export function parseDoc(data: unknown): SyncDoc {
  const d = data as SyncDoc
  const arrays = ['children', 'events', 'growth', 'deleted'] as const
  if (d?.format !== 'luca-sync' || !arrays.every(k => Array.isArray(d[k]))) throw new Error('Drive file is not Luca sync data')
  if (d.version > 2) throw new Error('Drive data is from a newer app version; update the app first')
  const stamped = (r: Stamped) => typeof r?.uid === 'string' && typeof r.updatedAt === 'number'
  if (!d.children.every(stamped) || !d.growth.every(stamped)) throw new Error('Drive file contains invalid rows')
  for (const e of d.events)
    if (!stamped(e) || typeof e.startTime !== 'number' || !(e.type in EVENT_META) || typeof e.payload !== 'object' || typeof e.childUid !== 'string')
      throw new Error('Drive file contains an invalid event')
  return d
}

/**
 * Writes the merged doc into the local DB without clobbering local writes made while the
 * network request was in flight: a row is replaced only by a strictly newer version.
 */
export async function apply(db: LucaDB, doc: SyncDoc) {
  await db.transaction('rw', [db.children, db.events, db.growth, db.deleted], async tx => {
    markSyncTx(tx)
    const tomb = new Map(doc.deleted.map(t => [t.uid, t.deletedAt]))
    await db.deleted.bulkPut(doc.deleted)

    const upsert = async <L extends { id?: number; uid?: string; updatedAt?: number }>(table: { toArray(): Promise<L[]>; bulkPut(r: L[]): Promise<unknown>; bulkDelete(k: number[]): Promise<void> }, rows: (Stamped & object)[], toLocal: (r: never) => L | null) => {
      const local = new Map((await table.toArray()).map(r => [r.uid!, r]))
      const puts: L[] = []
      for (const r of rows) {
        const l = local.get(r.uid)
        if (l && (l.updatedAt ?? 0) >= r.updatedAt) continue
        const row = toLocal(r as never)
        if (row) puts.push({ ...row, ...(l ? { id: l.id } : {}) })
      }
      await table.bulkPut(puts)
      await table.bulkDelete([...local.values()].filter(l => tomb.get(l.uid!)! >= (l.updatedAt ?? 0)).map(l => l.id!))
    }

    await upsert(db.children, doc.children, (c: SyncChild) => c)
    const childId = new Map((await db.children.toArray()).map(c => [c.uid!, c.id!]))
    await upsert(db.events, doc.events, ({ childUid, ...e }: SyncEvent) => {
      if (!childId.has(childUid)) return null
      const ev = { ...e, childId: childId.get(childUid)! } as BabyEvent
      if (ev.endTime === null) ev.running = 1
      return ev
    })
    await upsert(db.growth, doc.growth, ({ childUid, ...g }: SyncGrowth) =>
      childId.has(childUid) ? { ...g, childId: childId.get(childUid)! } : null)
  })
}

export async function sync(db: LucaDB, io: RemoteIO) {
  const raw = await io.read()
  const local = await snapshot(db)
  const merged = raw == null ? local : merge(local, parseDoc(raw))
  await apply(db, merged)
  await io.write(merged)
}
