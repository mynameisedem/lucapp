import { addDays, differenceInCalendarMonths, startOfDay } from 'date-fns'
import type { BabyEvent, Child } from './db'

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR

const end = (e: BabyEvent, now: number) => e.endTime ?? now

/** Overlap of an event with [from, to), so a sleep across midnight counts toward both days. */
export const overlap = (e: BabyEvent, from: number, to: number, now: number) =>
  Math.max(0, Math.min(end(e, now), to) - Math.max(e.startTime, from))

/** Local-midnight bounds; uses date math, so DST days are 23 or 25 hours long. */
export function dayBounds(day: Date | number) {
  const from = startOfDay(day)
  return [from.getTime(), addDays(from, 1).getTime()] as const
}

export interface DayStats {
  day: number
  sleepMs: number
  longestSleepMs: number
  naps: number
  feeds: number
  bottleMl: number
  breastMs: number
  wet: number
  dirty: number
}

export function dayStats(events: BabyEvent[], day: Date | number, now = Date.now()): DayStats {
  const [from, to] = dayBounds(day)
  const s: DayStats = { day: from, sleepMs: 0, longestSleepMs: 0, naps: 0, feeds: 0, bottleMl: 0, breastMs: 0, wet: 0, dirty: 0 }
  for (const e of events) {
    const startsToday = e.startTime >= from && e.startTime < to
    switch (e.type) {
      case 'SLEEP': {
        const ms = overlap(e, from, to, now)
        s.sleepMs += ms
        s.longestSleepMs = Math.max(s.longestSleepMs, ms)
        // A nap: a sleep that starts today during the day and is shorter than 4 hours.
        const h = new Date(e.startTime).getHours()
        if (startsToday && h >= 6 && h < 19 && end(e, now) - e.startTime < 4 * HOUR) s.naps++
        break
      }
      case 'BREAST':
        if (startsToday) { s.feeds++; s.breastMs += end(e, now) - e.startTime }
        break
      case 'BOTTLE':
        if (startsToday) { s.feeds++; s.bottleMl += e.payload.ml }
        break
      case 'DIAPER':
        if (startsToday) {
          if (e.payload.kind !== 'dirty') s.wet++
          if (e.payload.kind !== 'wet') s.dirty++
        }
        break
    }
  }
  return s
}

export function rangeStats(events: BabyEvent[], lastDay: Date | number, days: number, now = Date.now()) {
  const first = addDays(startOfDay(lastDay), -(days - 1))
  return Array.from({ length: days }, (_, i) => dayStats(events, addDays(first, i), now))
}

export function average(stats: DayStats[]) {
  const n = stats.length || 1
  const sum = (k: keyof DayStats) => stats.reduce((a, s) => a + s[k], 0) / n
  return { sleepMs: sum('sleepMs'), naps: sum('naps'), feeds: sum('feeds'), bottleMl: sum('bottleMl'), wet: sum('wet'), dirty: sum('dirty') }
}

/** Typical wake windows in minutes by age in months: [maxAgeMonths, min, max]. General guidance only. */
export const WAKE_WINDOWS: [number, number, number][] = [
  [1, 35, 60], [3, 60, 90], [5, 75, 120], [7, 120, 180], [10, 150, 210], [14, 180, 240], [18, 240, 300], [Infinity, 300, 360],
]

export function tableWindow(birthDate: string, now: number) {
  const months = differenceInCalendarMonths(now, new Date(birthDate + 'T00:00'))
  const [, min, max] = WAKE_WINDOWS.find(([m]) => months < m)!
  return { min, max }
}

/** Gaps between finished sleeps (ms), with the time each gap ended. */
export function wakeWindows(sleeps: BabyEvent[]) {
  const done = sleeps.filter(s => s.endTime !== null).sort((a, b) => a.startTime - b.startTime)
  const out: { ms: number; at: number }[] = []
  for (let i = 1; i < done.length; i++) {
    const ms = done[i].startTime - done[i - 1].endTime!
    if (ms > 10 * MIN && ms < 8 * HOUR) out.push({ ms, at: done[i].startTime })
  }
  return out
}

export interface NapSuggestion { sleeping: boolean; from: number; to: number; windowMin: number; basis: 'own' | 'age' }

/**
 * Next nap = last wake-up + wake window. The window is the recency-weighted average of the last
 * 7 days of real wake windows, kept within a sane band around the age table; the table alone
 * is used until there are at least 3 samples.
 */
export function suggestNap(sleeps: BabyEvent[], child: Child, now = Date.now()): NapSuggestion | null {
  if (sleeps.some(s => s.endTime === null)) return { sleeping: true, from: 0, to: 0, windowMin: 0, basis: 'own' }
  const last = sleeps.filter(s => s.endTime !== null).sort((a, b) => b.endTime! - a.endTime!)[0]
  if (!last) return null
  const { min, max } = tableWindow(child.birthDate, now)
  const recent = wakeWindows(sleeps).filter(w => now - w.at < 7 * DAY)
  let windowMin = (min + max) / 2, basis: NapSuggestion['basis'] = 'age'
  if (recent.length >= 3) {
    let wsum = 0, sum = 0
    for (const w of recent) {
      const weight = 7 - Math.floor((now - w.at) / DAY)
      wsum += weight
      sum += weight * w.ms / MIN
    }
    windowMin = Math.min(max * 1.25, Math.max(min * 0.75, sum / wsum))
    basis = 'own'
  }
  windowMin = Math.round(windowMin)
  const center = last.endTime! + windowMin * MIN
  return { sleeping: false, from: center - 15 * MIN, to: center + 15 * MIN, windowMin, basis }
}
