import Dexie, { type EntityTable, type Table, type Transaction } from 'dexie'

export type EventType = 'SLEEP' | 'BREAST' | 'BOTTLE' | 'SOLIDS' | 'DIAPER' | 'PUMP' | 'MED' | 'ACTIVITY'

export interface Payloads {
  SLEEP: { location?: string }
  // Side timer is a timestamp (sideSince) so it survives reloads; leftMs/rightMs hold finished stretches.
  BREAST: { leftMs: number; rightMs: number; side: 'L' | 'R' | null; sideSince: number | null; lastSide?: 'L' | 'R' }
  BOTTLE: { ml: number; contents: 'breast' | 'formula' }
  SOLIDS: { food: string }
  DIAPER: { kind: 'wet' | 'dirty' | 'both' }
  PUMP: { leftMl: number; rightMl: number }
  MED: { name: string; dose: string }
  ACTIVITY: { kind: 'tummy' | 'bath' | 'walk' | 'other'; minutes: number }
}

type EventOf<T extends EventType> = {
  id?: number
  uid?: string // stable across phones; set by the creating hook
  childId: number
  type: T
  startTime: number // UTC epoch ms
  endTime: number | null // null while a timer runs
  running?: 1 // sparse index: present only on running timers
  payload: Payloads[T]
  notes?: string
  tz: string
  createdAt: number
  updatedAt: number
}
export type BabyEvent = { [T in EventType]: EventOf<T> }[EventType]

export interface Child { id?: number; uid?: string; updatedAt?: number; name: string; birthDate: string /* yyyy-MM-dd */ }
export interface Growth { id?: number; uid?: string; updatedAt?: number; childId: number; date: string; weightGrams?: number; lengthMm?: number; headMm?: number }
export interface Tombstone { uid: string; deletedAt: number }
export interface Setting { key: string; value: unknown }

export const TIMED: EventType[] = ['SLEEP', 'BREAST', 'PUMP']

export const EVENT_META: Record<EventType, { label: string; icon: string; color: string }> = {
  SLEEP: { label: 'Sleep', icon: '🌙', color: '#6c63d9' },
  BREAST: { label: 'Breastfeed', icon: '🤱', color: '#e0679a' },
  BOTTLE: { label: 'Bottle', icon: '🍼', color: '#f0a03c' },
  SOLIDS: { label: 'Solids', icon: '🥣', color: '#7cb342' },
  DIAPER: { label: 'Diaper', icon: '🧷', color: '#26a69a' },
  PUMP: { label: 'Pumping', icon: '🫙', color: '#ab47bc' },
  MED: { label: 'Medication', icon: '💊', color: '#ef5350' },
  ACTIVITY: { label: 'Activity', icon: '🧸', color: '#42a5f5' },
}

export const defaultPayload = <T extends EventType>(type: T): Payloads[T] => ({
  SLEEP: {},
  BREAST: { leftMs: 0, rightMs: 0, side: null, sideSince: null },
  BOTTLE: { ml: 90, contents: 'formula' },
  SOLIDS: { food: '' },
  DIAPER: { kind: 'wet' },
  PUMP: { leftMl: 0, rightMl: 0 },
  MED: { name: '', dose: '' },
  ACTIVITY: { kind: 'tummy', minutes: 10 },
} as Payloads)[type]

export class LucaDB extends Dexie {
  children!: EntityTable<Child, 'id'>
  events!: EntityTable<BabyEvent, 'id'>
  growth!: EntityTable<Growth, 'id'>
  settings!: EntityTable<Setting, 'key'>
  deleted!: EntityTable<Tombstone, 'uid'>

  constructor(name = 'luca') {
    super(name)
    // Never edit a released version; add version(n+1) with an upgrade() instead.
    this.version(1).stores({
      children: '++id, name, birthDate',
      events: '++id, childId, type, startTime, endTime, running, [childId+startTime], [childId+type+startTime]',
      growth: '++id, childId, date',
      settings: 'key',
    })
    this.version(2).stores({
      children: '++id, &uid, name, birthDate',
      events: '++id, &uid, childId, type, startTime, endTime, running, [childId+startTime], [childId+type+startTime]',
      growth: '++id, &uid, childId, date',
      deleted: 'uid',
    }).upgrade(tx => {
      markSyncTx(tx) // keep original updatedAt
      return Promise.all(['children', 'events', 'growth'].map(t =>
        tx.table(t).toCollection().modify(r => { r.uid = crypto.randomUUID(); r.updatedAt ??= 0 })))
    })

    // Every local write stamps uid/updatedAt and logs deletes, so Drive sync can merge by uid.
    // Sync's own transactions are marked and skipped, so merged rows keep their original stamps.
    for (const table of [this.children, this.events, this.growth] as Table<{ uid?: string; updatedAt?: number }>[]) {
      table.hook('creating', (_key, obj, tx) => {
        if (isSyncTx(tx)) return
        obj.uid ??= crypto.randomUUID()
        obj.updatedAt = Date.now()
        changes.dispatchEvent(new Event('change'))
      })
      table.hook('updating', (_mods, _key, _obj, tx) => {
        if (isSyncTx(tx)) return
        changes.dispatchEvent(new Event('change'))
        return { updatedAt: Date.now() }
      })
      table.hook('deleting', (_key, obj, tx) => {
        if (isSyncTx(tx) || !obj.uid) return
        // shortcut: tombstone is written after the delete commits (hooks can't reach other tables); a crash in between could let sync resurrect the row
        tx.on('complete', () => this.deleted.put({ uid: obj.uid!, deletedAt: Date.now() }).then(() => changes.dispatchEvent(new Event('change'))))
      })
    }
  }
}

/** Fires after any local (non-sync) write; drives sync-on-change. */
export const changes = new EventTarget()
const SYNC = Symbol('sync')
export const markSyncTx = (tx: Transaction) => { (tx as unknown as Record<symbol, boolean>)[SYNC] = true }
const isSyncTx = (tx: Transaction) => !!(tx as unknown as Record<symbol, boolean>)[SYNC]

export const db = new LucaDB()

export const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone

export async function addEvent<T extends EventType>(childId: number, type: T, init: Partial<EventOf<T>> = {}) {
  const now = Date.now()
  const timed = TIMED.includes(type)
  const ev = {
    childId, type, startTime: now, endTime: timed ? null : now,
    ...(timed ? { running: 1 } : {}),
    payload: defaultPayload(type), tz: tz(), createdAt: now, updatedAt: now, ...init,
  } as BabyEvent
  if (ev.endTime !== null) delete ev.running
  return db.events.add(ev)
}

export async function startTimer(childId: number, type: EventType, payload?: Payloads[EventType]) {
  const running = await runningTimers(childId)
  const existing = running.find(e => e.type === type)
  if (existing) return existing.id! // one timer per type; spec requires it for sleep
  return addEvent(childId, type, payload ? { payload } as never : {})
}

export const runningTimers = (childId: number) =>
  db.events.where('running').equals(1).filter(e => e.childId === childId).toArray()

export async function stopTimer(ev: BabyEvent, at = Date.now()) {
  const changes: Partial<BabyEvent> = { endTime: at, running: undefined, updatedAt: Date.now() }
  if (ev.type === 'BREAST') changes.payload = switchSide(ev.payload, null, at)
  await db.events.update(ev.id!, changes)
}

export function switchSide(p: Payloads['BREAST'], side: 'L' | 'R' | null, at = Date.now()): Payloads['BREAST'] {
  const next = { ...p }
  if (p.side && p.sideSince) next[p.side === 'L' ? 'leftMs' : 'rightMs'] += at - p.sideSince
  next.side = side
  next.sideSince = side ? at : null
  if (side) next.lastSide = side
  return next
}

/** The side not used last, read from the latest feed so it is the same on every synced phone. */
export async function nextBreastSide(childId: number): Promise<'L' | 'R'> {
  const last = await db.events.where('[childId+type+startTime]').between([childId, 'BREAST', -Infinity], [childId, 'BREAST', Infinity]).last()
  return last?.type === 'BREAST' && last.payload.lastSide === 'L' ? 'R' : 'L'
}

export const startFeed = async (childId: number, side?: 'L' | 'R') =>
  startTimer(childId, 'BREAST', switchSide(defaultPayload('BREAST'), side ?? await nextBreastSide(childId)))

export const sideMs = (p: Payloads['BREAST'], side: 'L' | 'R', now = Date.now()) =>
  (side === 'L' ? p.leftMs : p.rightMs) + (p.side === side && p.sideSince ? now - p.sideSince : 0)

export async function saveEvent(ev: BabyEvent) {
  const clean = { ...ev, updatedAt: Date.now() } as BabyEvent
  if (clean.endTime === null) clean.running = 1
  else delete clean.running
  return db.events.put(clean)
}
