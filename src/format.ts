import { format } from 'date-fns'
import type { Settings } from './settings'

export const fmtTime = (ms: number, s: Pick<Settings, 'clock'>) => format(ms, s.clock === '12' ? 'h:mm a' : 'HH:mm')

export function fmtDur(ms: number) {
  const m = Math.max(0, Math.round(ms / 60000))
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

export const fmtClock = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60
  return `${h ? h + ':' : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(sec).padStart(2, '0')}`
}

const ML_PER_OZ = 29.5735
export const volume = (ml: number, s: Pick<Settings, 'units'>) =>
  s.units === 'imperial' ? `${(ml / ML_PER_OZ).toFixed(1)} oz` : `${Math.round(ml)} ml`
export const toMl = (v: number, s: Pick<Settings, 'units'>) => (s.units === 'imperial' ? v * ML_PER_OZ : v)
export const fromMl = (ml: number, s: Pick<Settings, 'units'>) => (s.units === 'imperial' ? +(ml / ML_PER_OZ).toFixed(1) : ml)
export const volUnit = (s: Pick<Settings, 'units'>) => (s.units === 'imperial' ? 'oz' : 'ml')

// Growth: stored as grams/mm, shown as kg/cm or lb/in.
export const weightUnit = (s: Pick<Settings, 'units'>) => (s.units === 'imperial' ? 'lb' : 'kg')
export const lenUnit = (s: Pick<Settings, 'units'>) => (s.units === 'imperial' ? 'in' : 'cm')
export const fromGrams = (g: number, s: Pick<Settings, 'units'>) => +(s.units === 'imperial' ? g / 453.592 : g / 1000).toFixed(2)
export const toGrams = (v: number, s: Pick<Settings, 'units'>) => Math.round(s.units === 'imperial' ? v * 453.592 : v * 1000)
export const fromMm = (mm: number, s: Pick<Settings, 'units'>) => +(s.units === 'imperial' ? mm / 25.4 : mm / 10).toFixed(1)
export const toMm = (v: number, s: Pick<Settings, 'units'>) => Math.round(s.units === 'imperial' ? v * 25.4 : v * 10)

// <input type="datetime-local"> works in local wall time.
export const toLocalInput = (ms: number) => format(ms, "yyyy-MM-dd'T'HH:mm")
export const fromLocalInput = (v: string) => new Date(v).getTime()
