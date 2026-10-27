import { useEffect } from 'react'
import { startFeed, startTimer } from '../db'
import { go, useChild } from '../App'
import { useSettings } from '../settings'

/** Targets of the manifest shortcuts (long-press on the app icon). */
export function Quick({ what }: { what?: string }) {
  const cid = useChild().id!
  const s = useSettings()
  useEffect(() => {
    if (what === 'sleep') startTimer(cid, 'SLEEP').then(() => go('/'))
    else if (what === 'feed' && s.feedDefault === 'BREAST')
      startFeed(cid).then(() => go('/'))
    else if (what === 'feed') go('/event/new/BOTTLE')
    else if (what === 'diaper') go('/event/new/DIAPER')
    else go('/')
  }, []) // run once per shortcut launch
  return null
}
