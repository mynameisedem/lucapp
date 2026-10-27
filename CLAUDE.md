# Luca – offline baby tracker PWA

Spec: `SPEC.md`. Stack: Vite, React, TypeScript, Dexie (IndexedDB), vite-plugin-pwa, date-fns.

## Commands
- `npm run build` – type-check + production build (service worker exists only here, not in `npm run dev`)
- `npm run preview -- --host --port 4173` – serve `dist/` for the phone (`adb reverse tcp:4173 tcp:4173`, open `http://localhost:4173`)
- `npm test` – Vitest unit tests (TZ=Europe/Budapest for DST cases)
- `npm run e2e` – Playwright, incl. offline check

## Rules
- Bump `version` in package.json for each release to the phones (`npm version patch --no-git-tag-version`); it shows at the bottom of Home
- No network requests at runtime except the Google Drive API (sync); no CDNs or Google scripts. CSP `connect-src https://www.googleapis.com` is injected at build (vite.config.ts)
- Sync (`src/sync.ts`, `src/drive.ts`): rows carry `uid` + `updatedAt` stamped by Dexie hooks (db.ts), deletes leave tombstones in `deleted`; merge = newest wins per uid. Writes done by sync/restore/migration must run in a `markSyncTx` transaction. Settings are per phone and never synced
- Drive needs `VITE_GOOGLE_CLIENT_ID` in `.env.local` at build time (see README)
- Times are UTC epoch ms + `tz`; day boundaries via date-fns local math (DST-safe)
- Timers are start timestamps (`endTime: null`, sparse `running: 1` index), never counters
- Never edit a released Dexie `version(n)`; add `version(n+1)` with `upgrade()` and a test
