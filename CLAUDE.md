# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Divvo Guardian is a cargo theft prevention/recovery dashboard — a Vite + React 18 SPA (plain JS/JSX, no TypeScript) styled with Tailwind. It is currently a pilot/demo prototype for one customer ("Owlet"): most data is static in-memory mock data, and Supabase is used as a thin live-data layer for a few real-time features (GPS pings, WebRTC signaling, saved routes, alert settings).

This repo also contains a `divvo-guardian` Claude Code skill (`.claude/skills/divvo-guardian/`) covering the broader Divvo Guardian *hardware/firmware/business* project (trailer security hardware, engineering roles, product requirements, decision log, etc.). That skill's YAML foundation files are the source of truth for product/engineering questions about the physical product — consult it for anything beyond this web dashboard's code.

## Commands

```bash
npm install       # install dependencies
npm run dev       # start Vite dev server
npm run build     # production build to dist/
npm run preview   # preview a production build locally
```

There is no lint script and no test runner configured in this repo (no `test`/`lint` entries in `package.json`, no test files present). Don't assume `npm test` or `npm run lint` exist.

Deployment is via Vercel (`vercel.json`): SPA rewrite (`/(.*)` → `/index.html`) plus the two functions in `api/` deployed as serverless functions.

## Architecture

### Routing: no router, manual page switch

`src/App.jsx` holds a single `page` string in state and renders pages via a `switch` — there is no `react-router` or similar. Navigation happens two ways:
- Direct callbacks passed down as props (`onNav`, `onViewShipment`, `onViewIncident`, etc.)
- A global `window` `CustomEvent("divvo-nav")` that `App.jsx` listens for — used by components that need to navigate without prop-drilling through several layers (event `detail` can be a page string, or `{ page, deviceId }` to also set the selected device).

Three generations of a "command center" view coexist and are all reachable from the sidebar: `CommandCenter.jsx`, `FleetDashboard.jsx`, and `UnifiedCommandCenter.jsx` (the current default landing page — `App.jsx`'s initial `page` state is `"unified-command"`). Check which one is actually being iterated on before assuming a change to one affects the others.

### Data layer: mostly in-memory mock state, no backend for core entities

`src/data/*.js` (`shipments.js`, `alerts.js`, `incidents.js`, `recoveryMock.js`) export static arrays that seed React state in `App.jsx` (`SHIPMENTS`, `INITIAL_ALERTS`, `INITIAL_INCIDENTS`). All mutations (new alerts, status changes, incident creation) happen via `setState` in `App.jsx` and are **not persisted** — a refresh resets everything to the mock data.

`src/lib/detectionEngine.js` is the theft-detection simulation:
- `DETECTION_RULES` is an array of rule objects (`check`, `severity`, `description`, `recommendedAction`) evaluated against shipment mock data — e.g. route deviation, unauthorized stop, door opened, seal tampering, IMU physical-tamper thresholds (`evaluateIncomingThreatMetrics`).
- `runTheftDetectionScan(shipments, existingAlerts)` runs all rules and returns new alerts, de-duping against existing open/under-review alerts from the same rule.
- `createIncidentFromAlert(alert, shipment)` builds an incident from an alert.
- Alert/incident ID counters are module-level `let` variables seeded at import time — they reset on full reload (not on HMR alone), so IDs are not stable/unique across sessions.

### Live layer: Supabase (hardcoded, duplicated per file)

A handful of features talk directly to a Supabase REST endpoint over `fetch` (no `supabase-js` client). The Supabase project URL and anon key are hardcoded and duplicated **verbatim in ~8 places**: `src/lib/notifications.js`, `src/pages/CommandCenter.jsx`, `src/pages/UnifiedCommandCenter.jsx`, `src/pages/FleetDashboard.jsx`, `src/pages/CameraView.jsx`, `src/pages/Settings.jsx`, `public/gps.html`, `public/camera.html`. If the key/URL ever needs to change, all of these need updating together — there's no shared config module for it today.

Tables in use: `alert_settings` (notification preferences, read/written from `Settings.jsx` and read by `notifications.js`), `gps_pings` (location pings from the device simulator), `saved_routes`, `webrtc_signals` (used as a polling-based WebRTC signaling channel — see below).

`public/gps.html` and `public/camera.html` are standalone, non-React HTML pages meant to be opened on a phone and act as a fake tracker/camera device for pilot demos — they push GPS pings and WebRTC offers/ICE candidates into Supabase tables that the dashboard (`CameraView.jsx`, `FleetDashboard.jsx`, `CommandCenter.jsx`) polls to establish a live WebRTC connection. This is a stand-in for real device firmware, not production hardware integration.

### Alert dispatch

`src/lib/notifications.js`'s `dispatchAlert()` is the single fan-out point: it loads `alert_settings` from Supabase, then conditionally triggers (by severity + per-channel toggle): browser `Notification` API, `/api/send-sms`, and `/api/send-email`.

`api/send-sms.js` and `api/send-email.js` are Vercel serverless functions (plain Node handlers, `export default async function handler(req, res)`, manual CORS headers) that call Twilio (WhatsApp sandbox) and Resend respectively.

**Heads up:** both `api/send-sms.js` and `api/send-email.js` have live third-party credentials (Twilio SID/auth token, Resend API key) hardcoded directly in the source rather than read from environment variables. If you touch these files, prefer moving secrets to Vercel env vars over adding more hardcoded values — but don't do a silent secret rotation/removal without flagging it, since it'll break the deployed functions until env vars are configured on Vercel.

### Map rendering

`mapbox-gl` is used directly (imported in `CommandCenter.jsx`, CSS loaded dynamically in `FleetDashboard.jsx`) with a hardcoded Mapbox access token — same "check before assuming it's centralized" caveat as the Supabase keys.
