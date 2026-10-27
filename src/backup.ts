import { format } from 'date-fns'
import { db, EVENT_META, markSyncTx, type BabyEvent, type EventType } from './db'

const FORMAT = 'luca-backup'

export async function exportJson() {
  const [children, events, growth, settings] = await Promise.all([
    db.children.toArray(), db.events.toArray(), db.growth.toArray(), db.settings.toArray(),
  ])
  return JSON.stringify({ format: FORMAT, version: db.verno, exportedAt: Date.now(), children, events, growth, settings })
}

/** Replaces all data with the backup. Validates the shape first so a wrong file cannot wipe the DB. */
export async function importJson(text: string) {
  const data = JSON.parse(text)
  const arrays = ['children', 'events', 'growth', 'settings'] as const
  if (data?.format !== FORMAT || !arrays.every(k => Array.isArray(data[k]))) throw new Error('Not a Luca backup file')
  if (data.version > db.verno) throw new Error('Backup is from a newer app version; update the app first')
  for (const e of data.events) {
    if (typeof e.childId !== 'number' || typeof e.startTime !== 'number' || !(e.type in EVENT_META) || typeof e.payload !== 'object')
      throw new Error('Backup contains an invalid event')
  }
  // Keeps the backup's edit stamps so a restore doesn't override newer edits from the other phone on sync.
  const stamp = <T extends { uid?: string; updatedAt?: number }>(rows: T[]) => rows.map(r => ({ ...r, uid: r.uid ?? crypto.randomUUID(), updatedAt: r.updatedAt ?? 0 }))
  await db.transaction('rw', [db.children, db.events, db.growth, db.settings], async tx => {
    markSyncTx(tx)
    await Promise.all([db.children.clear(), db.events.clear(), db.growth.clear(), db.settings.clear()])
    await db.children.bulkAdd(stamp(data.children))
    await db.events.bulkAdd(stamp(data.events))
    await db.growth.bulkAdd(stamp(data.growth))
    await db.settings.bulkPut(data.settings)
  })
}

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function eventsCsv(events: BabyEvent[], type: EventType) {
  const rows = events.filter(e => e.type === type)
  const keys = [...new Set(rows.flatMap(e => Object.keys(e.payload)))]
  const iso = (ms: number | null) => (ms == null ? '' : format(ms, "yyyy-MM-dd'T'HH:mm:ssXXX"))
  const lines = [['start', 'end', ...keys, 'notes', 'timezone'].join(',')]
  for (const e of rows) {
    const p = e.payload as Record<string, unknown>
    lines.push([iso(e.startTime), iso(e.endTime), ...keys.map(k => p[k]), e.notes, e.tz].map(csvCell).join(','))
  }
  return lines.join('\n')
}

/** Uses the Share sheet when the browser can share files, else a plain download. */
export async function saveFile(name: string, content: string, mime: string) {
  const file = new File([content], name, { type: mime })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e
    }
  }
  const url = URL.createObjectURL(file)
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
