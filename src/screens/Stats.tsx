import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { addDays, format, startOfDay } from 'date-fns'
import { db, EVENT_META } from '../db'
import { useChild } from '../App'
import { useSettings } from '../settings'
import { fmtDur, volume } from '../format'
import { average, rangeStats } from '../logic'
import { Bars } from '../Chart'

const TABS = { day: 1, week: 7, month: 30 } as const

export function Stats() {
  const s = useSettings()
  const cid = useChild().id!
  const [tab, setTab] = useState<keyof typeof TABS>('day')
  const days = TABS[tab]
  const today = startOfDay(new Date())
  const from = addDays(today, -days).getTime() // one extra day for sleeps crossing midnight
  const events = useLiveQuery(() => db.events.where('[childId+startTime]').between([cid, from], [cid, Infinity]).toArray(), [cid, from])
  if (!events) return null
  const stats = rangeStats(events, today, days)
  const avg = average(stats)
  const d = stats.at(-1)!
  const label = (ms: number) => format(ms, 'd MMM')

  return (
    <>
      <h1>Stats</h1>
      <div className="chips" role="tablist">
        {(Object.keys(TABS) as (keyof typeof TABS)[]).map(t => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t === 'day' ? 'Today' : t === 'week' ? '7 days' : '30 days'}</button>
        ))}
      </div>
      {tab === 'day' ? (
        <dl className="kv card">
          <dt>Total sleep</dt><dd>{fmtDur(d.sleepMs)}</dd>
          <dt>Longest stretch</dt><dd>{fmtDur(d.longestSleepMs)}</dd>
          <dt>Naps</dt><dd>{d.naps}</dd>
          <dt>Feeds</dt><dd>{d.feeds}</dd>
          <dt>Bottle volume</dt><dd>{volume(d.bottleMl, s)}</dd>
          <dt>Breastfeeding</dt><dd>{fmtDur(d.breastMs)}</dd>
          <dt>Diapers</dt><dd>{d.wet} wet · {d.dirty} dirty</dd>
        </dl>
      ) : (
        <>
          <dl className="kv card">
            <dt>Avg sleep / day</dt><dd>{fmtDur(avg.sleepMs)}</dd>
            <dt>Avg naps</dt><dd>{avg.naps.toFixed(1)}</dd>
            <dt>Avg feeds</dt><dd>{avg.feeds.toFixed(1)}</dd>
            <dt>Avg bottle volume</dt><dd>{volume(avg.bottleMl, s)}</dd>
            <dt>Avg diapers</dt><dd>{avg.wet.toFixed(1)} wet · {avg.dirty.toFixed(1)} dirty</dd>
          </dl>
          <Bars label="Sleep per day" color={EVENT_META.SLEEP.color} fmt={fmtDur} data={stats.map(x => ({ x: label(x.day), y: x.sleepMs }))} />
          <Bars label="Feeds per day" color={EVENT_META.BREAST.color} fmt={v => String(Math.round(v))} data={stats.map(x => ({ x: label(x.day), y: x.feeds }))} />
          <Bars label="Bottle volume" color={EVENT_META.BOTTLE.color} fmt={v => volume(v, s)} data={stats.map(x => ({ x: label(x.day), y: x.bottleMl }))} />
          <Bars label="Diapers per day" color={EVENT_META.DIAPER.color} fmt={v => String(Math.round(v))} data={stats.map(x => ({ x: label(x.day), y: x.wet + x.dirty }))} />
        </>
      )}
    </>
  )
}
