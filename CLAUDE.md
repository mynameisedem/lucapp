# Luca – offline baby tracker PWA

Spec: `SPEC.md`. Stack: Vite, React, TypeScript, Dexie (IndexedDB), vite-plugin-pwa, date-fns.

## Commands
- `npm run build` – type-check + production build (service worker exists only here, not in `npm run dev`)
- `npm run preview -- --host --port 4173` – serve `dist/` for the phone (`adb reverse tcp:4173 tcp:4173`, open `http://localhost:4173`)
- `npm test` – Vitest unit tests (TZ=Europe/Budapest for DST cases)
- `npm run e2e` – Playwright, incl. offline check

## Rules
- No network requests at runtime, no CDNs; CSP `connect-src 'none'` is injected at build (vite.config.ts)
- Times are UTC epoch ms + `tz`; day boundaries via date-fns local math (DST-safe)
- Timers are start timestamps (`endTime: null`, sparse `running: 1` index), never counters
- Never edit a released Dexie `version(n)`; add `version(n+1)` with `upgrade()` and a test
