# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Divvo Guardian is a cargo theft prevention/recovery dashboard — a Vite + React 18 SPA (plain JS/JSX, no TypeScript) styled with Tailwind. It is currently a pilot/demo prototype for three customers ("Owlet", "Meridian Freight", "Coastal Logistics", switchable in the sidebar): most operational data (shipments, alerts, incidents, recovery cases) is static in-memory mock data seeded per company, and Supabase is used as a live layer for authentication, per-company alert/detection settings, and a few real-time device-simulator features (GPS pings, WebRTC signaling, saved routes).

**Two Supabase schema generations coexist.** A v1 set of ad-hoc tables (`companies`, `alert_settings`, `gps_pings`, `saved_routes`, `webrtc_signals`) backs everything actually wired into the UI today. A v2 "Mission Engine" schema (`supabase_migration_001_mission_engine.sql`, 22 tables: `organizations`, `users`, `missions`, `drivers`, `digital_bols`, `chain_of_custody_events`, etc. — see `DIVVO_ARCHITECTURE_V2.md`) is live and RLS-enforced in the same database, but **only `organizations`/`users`/`user_roles` are actually used** (by the auth system below). The other ~19 v2 tables have no UI reading or writing them yet — don't assume mission/driver/BOL data exists anywhere in the app just because the schema does.

This repo also contains a `divvo-guardian` Claude Code skill (`.claude/skills/divvo-guardian/`) covering the broader Divvo Guardian *hardware/firmware/business* project (trailer security hardware, engineering roles, product requirements, decision log, etc.). That skill's YAML foundation files are the source of truth for product/engineering questions about the physical product — consult it for anything beyond this web dashboard's code.

## Commands

```bash
npm install       # install dependencies
npm run dev       # start Vite dev server
npm run build     # production build to dist/
npm run preview   # preview a production build locally
```

There is no lint script and no test runner configured in this repo (no `test`/`lint` entries in `package.json`, no test files present). Don't assume `npm test` or `npm run lint` exist.

Deployment is via Vercel (`vercel.json`): SPA rewrite (`/(.*)` → `/index.html`) plus the four functions in `api/` (`add-company.js`, `create-user.js`, `send-sms.js`, `send-email.js`) deployed as serverless functions.

## Architecture

### Routing: no router, manual page switch

`src/App.jsx` holds a single `page` string in state and renders pages via a `switch` — there is no `react-router` or similar. Navigation happens two ways:
- Direct callbacks passed down as props (`onNav`, `onViewShipment`, `onViewIncident`, etc.)
- A global `window` `CustomEvent("divvo-nav")` that `App.jsx` listens for — used by components that need to navigate without prop-drilling through several layers (event `detail` can be a page string, or `{ page, deviceId }` to also set the selected device).

There is a single command center (`UnifiedCommandCenter.jsx`, the default landing page — `App.jsx`'s initial `page` state is `"unified-command"`). Two earlier iterations (`CommandCenter.jsx`, `FleetDashboard.jsx`) were deleted as dead code; if you see either name referenced anywhere, it's stale.

**Real current redundancy: two separate, non-shared recovery-case UIs.** `Recovery.jsx` (the "Recovery Cases" list, reachable from the sidebar) drills into `RecoveryDetail.jsx` — the fuller-featured page, backed by `recoveryDetails` state in `App.jsx`, with real chain-of-custody logging, evidence checklist, and law-enforcement/carrier/adjuster contact actions. Separately, `UnifiedCommandCenter.jsx`'s per-device "Recovery Actions" button navigates to `RecoveryCase.jsx` — a different, older page with its own hardcoded `CASE_DATA` object keyed by device ID (not incident ID), local-only `useState`, and no connection to `recoveryDetails`/`incidents`. Both are live and reachable today; treat them as separate data models when editing either one, and check which one a bug report is actually about.

### Data layer: mostly in-memory mock state, no backend for core entities

`src/data/*.js` (`shipments.js`, `alerts.js`, `incidents.js`, `recoveryMock.js`) export static arrays that seed React state in `App.jsx` (`SHIPMENTS`, `INITIAL_ALERTS`, `INITIAL_INCIDENTS`). All mutations (new alerts, status changes, incident creation) happen via `setState` in `App.jsx` and are **not persisted** — a refresh resets everything to the mock data. `companies` is the one exception among "core" data — it's a real Supabase table (see below), read via `src/lib/companies.js` and written via `api/add-company.js`.

`src/lib/detectionEngine.js` is the theft-detection simulation:
- `buildDetectionRules(thresholds)` returns the rule array (`check`, `severity`, `description`, `recommendedAction`) evaluated against shipment mock data — route deviation, unauthorized stop, door opened, low battery, critical risk score, seal tampering, IMU physical-tamper (`evaluateIncomingThreatMetrics`). The six numeric thresholds are **not** hardcoded — they come from the caller (per-company `alert_settings` columns: `route_deviation_miles`, `unauthorized_stop_minutes`, `low_battery_pct`, `critical_risk_score`, `imu_impact_g`, `angular_tilt_deg`), editable in Settings > Detection Thresholds. `DETECTION_RULES` (no args) and `DEFAULT_THRESHOLDS` are exported for callers that just want the defaults.
- `runTheftDetectionScan(shipments, existingAlerts, thresholds)` runs all rules and returns new alerts, de-duping against existing open/under-review alerts from the same rule. `App.jsx`'s `handleScan` fetches the active company's thresholds from Supabase before calling this.
- `createIncidentFromAlert(alert, shipment)` builds an incident from an alert.
- Alert/incident ID counters are module-level `let` variables seeded at import time — they reset on full reload (not on HMR alone), so IDs are not stable/unique across sessions.

### Live layer: Supabase

All Supabase config is centralized in `src/lib/supabase.js` (`SB_URL`, `SB_KEY` from `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, plus `sbHeaders()`/`authHeaders()` helpers) and `src/lib/mapbox.js` (`MAPBOX_TOKEN` from `VITE_MAPBOX_TOKEN`) — no hardcoded/duplicated credentials anywhere in the codebase. Most data-layer calls are raw `fetch` against the Supabase REST endpoint using `sbHeaders()`/`authHeaders()`; the one exception is auth (see below), which uses the real `@supabase/supabase-js` SDK via `src/lib/supabaseClient.js`.

v1 tables in use: `companies` (per-tenant company records, read by every page via `companyInfo`), `alert_settings` (notification preferences, detection thresholds, escalation timing, law-enforcement contacts — one row per company, read/written from `Settings.jsx`, read by `notifications.js`/`detectionEngine.js` callers), `gps_pings` (location pings from the device simulator), `saved_routes`, `webrtc_signals` (polling-based WebRTC signaling channel — see below). v2 tables in use: `organizations`, `users`, `user_roles` (see Auth below); the rest of the 22-table v2 schema is live but unused.

`public/gps.html` and `public/camera.html` are standalone, non-React HTML pages meant to be opened on a phone and act as a fake tracker/camera device for pilot demos — they push GPS pings and WebRTC offers/ICE candidates into Supabase tables that the dashboard (`CameraView.jsx`, `UnifiedCommandCenter.jsx`) polls to establish a live WebRTC connection. This is a stand-in for real device firmware, not production hardware integration.

### Auth: real Supabase Auth, gates the whole app

The entire app is gated behind a Supabase Auth session — `App.jsx` renders only `<Login />` (or `<ResetPassword />`, if the auth event is a password-recovery landing) until a session exists, then `<Sidebar>`/pages once a matching `users`/`user_roles` row is also found via `fetchCurrentUser()`. Account creation is invite-only: there's no public signup form; admins invite teammates from Settings > Team, which calls `api/create-user.js` (validates the caller is a real, currently-logged-in admin via their bearer token before doing anything privileged, then uses Supabase's Admin API to invite-and-email the new user).

The Supabase client (`src/lib/supabaseClient.js`) is configured with `flowType: "pkce"` specifically because email security scanners (Gmail Safe Browsing, etc.) prefetch links server-side and silently burn single-use recovery/invite tokens under the default implicit flow — PKCE requires a verifier secret held only in the requesting browser, which a prefetch can't have. If you ever see `otp_expired`/`access_denied` errors on auth links, this is almost certainly why; don't revert to implicit flow to "simplify" it.

`roles` (`admin`/`dispatcher`/`analyst`/`viewer`) currently only gate whether the Team section renders — they are not yet enforced anywhere else in the UI (any logged-in user can trigger notify/recovery/settings actions regardless of role).

### Alert dispatch

`src/lib/notifications.js`'s `dispatchAlert()` is the single fan-out point: it loads `alert_settings` from Supabase, then conditionally triggers (by severity + per-channel toggle): browser `Notification` API, `/api/send-sms`, and `/api/send-email`. The browser-notification step is wrapped in its own try/catch — `Notification.requestPermission()` can throw when called outside a synchronous user gesture (which it no longer is, after the `await fetchAlertSettings()` above it), and that must never be allowed to abort the SMS/email sends below it.

`api/send-sms.js` and `api/send-email.js` are Vercel serverless functions (plain Node handlers, `export default async function handler(req, res)`, manual CORS headers) that call Twilio (standard SMS, not WhatsApp) and Resend respectively. Credentials (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM`, `RESEND_API_KEY`) are read from Vercel environment variables — not hardcoded.

Recovery-workflow "contact" actions (Notify Law Enforcement, Contact Carrier, Contact Adjuster/Agency, in both `RecoveryCase.jsx` and `RecoveryDetail.jsx`) are real too, but through a different channel than `dispatchAlert()`: they open a pre-filled `mailto:`/`tel:` link in the operator's own mail/phone app, using per-case contact data (`recoveryMock.js`'s `insurance`/`lawEnforcement` objects, `shipments.js`'s `CARRIER_CONTACTS`, or a company-configured `alert_settings.le_contacts` jurisdiction match for law enforcement) rather than sending anything server-side.

### Map rendering

`mapbox-gl` is used directly (imported in `UnifiedCommandCenter.jsx`, CSS loaded dynamically) with `MAPBOX_TOKEN` from `src/lib/mapbox.js` (see above). `src/lib/mapbox.js` also exports `geocode()` (forward) and `reverseGeocode()` (coordinates → city/county/state, used by `RecoveryCase.jsx`'s law-enforcement jurisdiction lookup).
