import Dexie, { type EntityTable } from 'dexie'

export type EventType = 'SLEEP' | 'BREAST' | 'BOTTLE' | 'SOLIDS' | 'DIAPER' | 'PUMP' | 'MED' | 'ACTIVITY'

export interface Payloads {
  SLEEP: { location?: string }
  // Side timer is a timestamp (sideSince) so it survives reloads; leftMs/rightMs hold finished stretches.
  BREAST: { leftMs: number; rightMs: number; side: 'L' | 'R' | null; sideSince: number | null }
  BOTTLE: { ml: number; contents: 'breast' | 'formula' }
  SOLIDS: { food: string }
  DIAPER: { kind: 'wet' | 'dirty' | 'both' }
  PUMP: { leftMl: number; rightMl: number }
  MED: { name: string; dose: string }
  ACTIVITY: { kind: 'tummy' | 'bath' | 'walk' | 'other'; minutes: number }
}

type EventOf<T extends EventType> = {
  id?: number
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

export interface Child { id?: number; name: string; birthDate: string /* yyyy-MM-dd */ }
export interface Growth { id?: number; childId: number; date: string; weightGrams?: number; lengthMm?: number; headMm?: number }
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

  constructor(name = 'luca') {
    super(name)
    // Never edit a released version; add version(n+1) with an upgrade() instead.
    this.version(1).stores({
      children: '++id, name, birthDate',
      events: '++id, childId, type, startTime, endTime, running, [childId+startTime], [childId+type+startTime]',
      growth: '++id, childId, date',
      settings: 'key',
    })
  }
}

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
  return next
}

export const sideMs = (p: Payloads['BREAST'], side: 'L' | 'R', now = Date.now()) =>
  (side === 'L' ? p.leftMs : p.rightMs) + (p.side === side && p.sideSince ? now - p.sideSince : 0)

export async function saveEvent(ev: BabyEvent) {
  const clean = { ...ev, updatedAt: Date.now() } as BabyEvent
  if (clean.endTime === null) clean.running = 1
  else delete clean.running
  return db.events.put(clean)
}
