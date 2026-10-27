# Offline Baby Tracker PWA – Implementation Spec

Personal-use, fully offline baby tracker built as a Progressive Web App (PWA): a website you install on your phone's home screen. No accounts, no sync, no subscriptions, no backend and no hosting. Your PC is only used to build the app and hand it to the phone.

## 1. Goals and non-goals

**Goals**

- Log any baby event in one or two taps, even at 3 a.m. with one hand
- Show a clear daily timeline and simple trends
- Suggest the next nap/bedtime from the baby's own recent data
- Work fully offline after the first install, with all data on the phone
- Manual backup and restore

**Non-goals**

- Native Android/iOS app, app stores
- Backend server, cloud sync, accounts, multi-device sharing
- Hosting (GitHub Pages, Netlify and similar)
- Subscriptions, ads, analytics
- Home-screen widgets and background push notifications (not possible in a PWA without a server)
- Medical advice or expert content

## 2. How it runs (no hosting)

- **Build:** Vite produces static files (HTML/JS/CSS) on your PC
- **Install:** serve the build from your PC once, open it in Chrome on the phone, choose Add to Home screen
- **Afterwards:** a service worker caches every file and data lives in IndexedDB on the phone, so it works in airplane mode and the PC can be off
- **Updates:** rebuild, serve again, open the app on the phone while the PC is serving; it picks up the new version

**Important constraint:** service workers (needed for install and offline) run only on HTTPS or on localhost. A plain `http://192.168.x.x` address from your PC does not qualify. Pick one option:

1. **USB forwarding (recommended):** enable USB debugging on the phone, connect it, run `adb reverse tcp:4173 tcp:4173`, then open `http://localhost:4173` on the phone. Localhost counts as secure and the address is always the same, so data is never orphaned.
2. **Chrome flag (Android, no cable):** on the phone open `chrome://flags/#unsafe-treat-insecure-origin-as-secure`, add `http://<pc-ip>:4173`, relaunch Chrome. Give the PC a fixed IP, because data is tied to that exact address.
3. **Local HTTPS with mkcert (needed for iPhone):** create a certificate for the PC, install its root certificate on the phone, serve over https. Most setup.

**Data is stored per address (origin).** If the host or port changes, the app opens empty. Always use the same address for installs and updates, and export a backup before changing it. Test the full flow (install, then airplane mode) in the first milestone, because browser behavior differs by phone.

This spec assumes Android with Chrome. iPhone Safari has stricter storage limits and no flag option.

## 3. Functional requirements

### 3.1 Event tracking

| Event | Fields |
| --- | --- |
| Sleep | start, end (timer or manual), location/notes (optional) |
| Breastfeeding | start, end, left/right durations (two timers) |
| Bottle | time, amount (ml/oz), contents (breast milk/formula) |
| Solids | time, food, notes |
| Diaper | time, wet / dirty / both, notes |
| Pumping | start, end, amount per side |
| Medication | time, name, dose, notes |
| Growth | date, weight, length, head circumference |
| Activity | time, type (tummy time, bath, walk), duration |

Behavior:

- Home screen has one large button per event type; tapping starts a timer (sleep, feeding, pumping) or logs instantly (diaper)
- Timers are stored as start timestamps, so they survive closing the app, a reload or a phone restart
- Only one sleep timer can run at a time; running timers show as a banner on the home screen
- Screen Wake Lock keeps the screen on during a feeding timer (optional setting)
- Every event can be edited, deleted or backdated; undo snackbar after delete

### 3.2 Timeline and history

- Daily view: chronological list plus a 24-hour visual strip colored by event type
- Swipe between days; jump to date
- Filters by event type

### 3.3 Stats

- Per day: total sleep, longest sleep stretch, number of naps, feed count and volume, diaper counts
- Trends over 7 and 30 days
- Growth chart for weight, length and head circumference

### 3.4 Nap and bedtime suggestions (local, rule-based)

- Lookup table of typical wake windows by age
- Adjust using the average of the baby's last 7 days of actual wake windows, weighted toward recent days
- Output on the home screen: next nap window, labeled as a rough guide
- Notifications work only while the app is open; there are no background reminders

### 3.5 Multiple children (optional)

- More than one child profile on the same phone (name, birth date)
- Child switcher on the home screen

### 3.6 Backup and restore

- Export all data to one JSON file (download or the phone's Share sheet, for example to Drive or a messenger to yourself)
- Import JSON through the file picker to restore or move to a new phone
- CSV export per event type; optional PDF summary for a date range
- In-app banner reminding you to back up every N days
- Ask the browser for persistent storage (`navigator.storage.persist()`), but treat backups as the real safety net: clearing Chrome's site data or uninstalling the app deletes everything

### 3.7 Shortcuts (replaces widgets)

- Web app manifest shortcuts on the long-press icon menu: start sleep, log diaper, start feed
- No home-screen widgets or quick-settings tile in a PWA

### 3.8 Settings

- Units (metric/imperial), 12/24-hour time, theme (light/dark/auto)
- Default feeding type, bottle amount step
- Optional in-app PIN (convenience only; rely on the phone lock for real security)

## 4. Architecture

- **Language/UI:** TypeScript and React (Svelte also works), built with Vite
- **PWA:** `vite-plugin-pwa` (Workbox) for the service worker and manifest; precache all assets
- **Storage:** IndexedDB via Dexie, versioned schema with migrations from day one
- **State:** React context or Zustand, with Dexie live queries
- **Charts:** uPlot or Recharts
- **Dates:** date-fns
- **PDF/CSV export:** jsPDF or a print stylesheet; CSV built in code
- **Routing:** hash router, so it works from any path
- **Deployment:** none; the `dist/` folder is served from your PC with `vite preview`

### Offline guarantee

- Service worker precaches everything; the app makes no network requests at runtime
- No CDN fonts, scripts or analytics; use system fonts or self-hosted fonts
- Content-Security-Policy with `connect-src 'none'` enforces this

## 5. Data model

```
children:  ++id, name, birthDate
events:    ++id, childId, type, startTime, endTime,
           [childId+startTime], [childId+type+startTime]
           // type: SLEEP, BREAST, BOTTLE, SOLIDS, DIAPER, PUMP, MED, ACTIVITY
           // plus payload (type-specific fields), notes, tz, createdAt, updatedAt
growth:    ++id, childId, date, weightGrams, lengthMm, headMm
settings:  key, value
```

Store times as UTC epoch milliseconds plus the time zone id, so daylight-saving changes and travel do not corrupt history. Keep type-specific data in one `payload` object and validate it with a TypeScript type per event type.

## 6. Screens

1. **Home:** child switcher, quick-log buttons, running timers, last-event summaries, next nap suggestion
2. **Timeline:** day view, filters, tap to edit
3. **Event editor:** type-specific form, date/time pickers
4. **Stats:** day, week, month tabs
5. **Growth:** entries list and chart
6. **Backup:** export, import, last backup date
7. **Settings**

## 7. Non-functional requirements

- **Reliability:** write each event immediately; timers stored as start timestamps, never counters
- **Performance:** home screen loads in under 1 second from cache; paged queries so years of data stay smooth
- **Usability:** dark theme option, large touch targets, one-handed use, minimal typing
- **Accessibility:** screen-reader labels, scalable fonts, sufficient contrast
- **Privacy:** all data stays on the phone; no external requests
- **Compatibility:** current Chrome on Android 8+; iPhone only with local HTTPS and with storage limits

## 8. Testing

- Unit tests (Vitest): wake-window calculation, stats aggregation, daylight-saving edge cases, export/import round trip
- Dexie migration tests
- End-to-end tests (Playwright) for logging flows, including offline mode
- Manual tests on the phone: install, then airplane mode; force-close mid-timer; change time zone; clear site data, then restore from a backup

## 9. Set up and kick off from your PC

**Install:** Node.js (LTS), Git, Claude Code (you have it), Chrome on the phone. For option 1 also Android platform-tools (`adb`); for option 2 allow the port in Windows Firewall.

1. Create a folder `baby-tracker`, run `git init`, save this spec as `SPEC.md`
2. Add a short `CLAUDE.md` with: stack (Vite, React, TypeScript, Dexie, vite-plugin-pwa); commands (`npm run build`, `npm run preview -- --host --port 4173`, `npm test`); rules (no network requests, no external CDNs, strict CSP, times in UTC, timers as timestamps)
3. Run `claude` in the folder and ask it to read `SPEC.md` and implement milestone 1 only, then commit
4. Test on the phone with `npm run build` then `npm run preview -- --host --port 4173`, and install using your chosen option. The service worker runs only in the production build, not in `npm run dev`.
5. Repeat for each milestone, committing after each

## 10. Milestones

1. **Foundation and PWA proof:** project setup, Dexie schema, home screen, log sleep/diaper/feed, install on the phone and verify airplane mode
2. **Timeline and editing:** day view, edit/delete/undo, remaining event types
3. **Stats and growth:** aggregation, charts
4. **Suggestions:** wake-window model, home screen suggestion
5. **Backup:** JSON/CSV export and import, backup reminder, PDF summary
6. **Polish:** manifest shortcuts, PIN, theming, accessibility

## 11. Legal and design notes

- Use your own name, icon, wording and visuals; do not reuse another app's branding, text or feature names
- Add a short disclaimer that suggestions are general guidance, not medical advice
- Because the app is for personal use only, there is no store-compliance burden; if you ever publish it, add a privacy policy and review child-data rules
