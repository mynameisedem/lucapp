import { describe, expect, it } from 'vitest'
import type { BabyEvent } from './db'
import { dayBounds, dayStats, suggestNap, tableWindow, wakeWindows } from './logic'

// vite.config sets TZ=Europe/Budapest; DST ended 2026-10-25 03:00 → 02:00.
const t = (s: string) => new Date(s).getTime()
const H = 3_600_000
let id = 0
const sleep = (start: string, end: string | null): BabyEvent => ({
  id: ++id, childId: 1, type: 'SLEEP', startTime: t(start), endTime: end ? t(end) : null, payload: {}, tz: 'Europe/Budapest', createdAt: 0, updatedAt: 0,
})
const diaper = (at: string, kind: 'wet' | 'dirty' | 'both'): BabyEvent => ({
  id: ++id, childId: 1, type: 'DIAPER', startTime: t(at), endTime: t(at), payload: { kind }, tz: 'Europe/Budapest', createdAt: 0, updatedAt: 0,
})

describe('day stats', () => {
  it('DST fall-back day is 25 hours', () => {
    const [from, to] = dayBounds(t('2026-10-25T12:00'))
    expect((to - from) / H).toBe(25)
  })

  it('splits a sleep across midnight and counts the repeated hour', () => {
    const ev = [sleep('2026-10-24T22:00', '2026-10-25T06:00')]
    expect(dayStats(ev, t('2026-10-24T12:00')).sleepMs).toBe(2 * H)
    expect(dayStats(ev, t('2026-10-25T12:00')).sleepMs).toBe(7 * H) // 00:00–06:00 local includes the extra hour
  })

  it('aggregates naps, longest stretch and diapers', () => {
    const ev = [
      sleep('2026-10-20T09:00', '2026-10-20T10:00'),
      sleep('2026-10-20T13:00', '2026-10-20T15:30'),
      sleep('2026-10-20T20:00', '2026-10-21T05:00'),
      diaper('2026-10-20T08:00', 'wet'), diaper('2026-10-20T11:00', 'both'), diaper('2026-10-20T16:00', 'dirty'),
    ]
    const s = dayStats(ev, t('2026-10-20T12:00'))
    expect(s.naps).toBe(2)
    expect(s.sleepMs).toBe(7.5 * H)
    expect(s.longestSleepMs).toBe(4 * H)
    expect([s.wet, s.dirty]).toEqual([2, 2])
  })
})

describe('nap suggestion', () => {
  const child = { id: 1, name: 'L', birthDate: '2026-06-01' } // ~4.8 months on 2026-10-20

  it('uses the age table with too few samples', () => {
    expect(tableWindow(child.birthDate, t('2026-10-20T12:00'))).toEqual({ min: 75, max: 120 })
    const n = suggestNap([sleep('2026-10-20T09:00', '2026-10-20T10:00')], child, t('2026-10-20T10:30'))!
    expect(n.basis).toBe('age')
    expect(n.windowMin).toBe(98) // round(97.5)
    expect(n.from).toBe(t('2026-10-20T10:00') + (98 - 15) * 60_000)
  })

  it('weights the baby\'s own wake windows toward recent days', () => {
    const ev = [
      // 3 days ago: 80-minute windows; today: 110-minute windows
      sleep('2026-10-17T08:00', '2026-10-17T09:00'), sleep('2026-10-17T10:20', '2026-10-17T11:00'),
      sleep('2026-10-20T07:00', '2026-10-20T08:00'), sleep('2026-10-20T09:50', '2026-10-20T10:30'), sleep('2026-10-20T12:20', '2026-10-20T13:00'),
    ]
    expect(wakeWindows(ev).map(w => w.ms / 60_000)).toEqual([80, 110, 110])
    const n = suggestNap(ev, child, t('2026-10-20T13:30'))!
    expect(n.basis).toBe('own')
    // weights: 80 → 7-3=4, 110 → 7 each: (4*80 + 7*110*2) / 18 = 103.33
    expect(n.windowMin).toBe(103)
  })

  it('reports sleeping while a sleep timer runs', () => {
    expect(suggestNap([sleep('2026-10-20T09:00', null)], child)!.sleeping).toBe(true)
  })
})
