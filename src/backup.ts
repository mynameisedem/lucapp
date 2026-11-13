import { format } from 'date-fns'
import type { BabyEvent, EventType } from './db'

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
