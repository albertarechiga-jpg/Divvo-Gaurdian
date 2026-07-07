# Divvo Guardian — Architecture Review Package

**Purpose:** This is a complete, self-contained export of the Divvo Guardian web dashboard for an external AI architecture review. It covers the current codebase as-is (Sections 1–6), followed by proposed next-phase architecture for driver identity verification, biometric BOL signing, and chain-of-custody tracking (Sections 7–11).

**App identity:** Divvo Guardian is a cargo-theft prevention/recovery **dashboard** — a Vite + React 18 SPA (plain JS/JSX, no TypeScript), styled with Tailwind. It is currently a **pilot/demo prototype for one customer ("Owlet")** plus two additional demo companies (Meridian Freight, Coastal Logistics). Most data is static in-memory mock data seeded into React state; Supabase is used as a thin live-data layer for a handful of real-time features (GPS pings, WebRTC camera signaling, saved routes, alert settings, company registry).

**Live deployment:** https://divvo-guardian.vercel.app (Vercel, auto-deployed from `main`). Local dev runs at `http://localhost:5173` via `npm run dev`.

---

## 1. Project Structure

```
divvo-guardian/
├── api/                          # Vercel serverless functions (Node, plain export default handler)
│   ├── add-company.js            # Creates a company row (service_role key, bypasses RLS)
│   ├── send-email.js             # Sends alert emails via Resend
│   └── send-sms.js               # Sends alert SMS via Twilio
├── public/
│   ├── camera.html               # Standalone phone-camera simulator (WebRTC "cam" peer)
│   └── gps.html                  # Standalone phone-GPS simulator (pushes gps_pings rows)
├── src/
│   ├── App.jsx                   # Root component — page-switch router (no react-router), top-level state
│   ├── main.jsx                  # Entry point — Sentry + Vercel Analytics + ReactDOM.render
│   ├── index.css                 # Tailwind entry
│   ├── components/
│   │   ├── AddCompanyModal.jsx   # "Add Company" form (geocodes region, calls createCompany)
│   │   ├── Badges.jsx            # Small badge/pill components (Risk/Status/Severity/AlertStatus)
│   │   ├── CasePacketModal.jsx   # Shared printable packet (LE evidence packet + shipment case file)
│   │   ├── RouteMap.jsx          # Reusable small Mapbox map (markers + optional route line)
│   │   └── Sidebar.jsx           # Left nav, company switcher, "+ Add Company"
│   ├── data/                     # Static mock data (seeds React state; NOT a database)
│   │   ├── alerts.js             # INITIAL_ALERTS — 10 seeded alerts across 3 companies
│   │   ├── companyFleets.js      # COMPANY_DEVICES / COMPANY_SHIPMENT_ROUTES / COMPANY_DEVICE_CONTEXT
│   │   ├── incidents.js          # INITIAL_INCIDENTS (9) + WORKFLOW_STAGES (7-stage recovery workflow)
│   │   ├── recoveryMock.js       # RECOVERY_MOCK (per-incident case detail) + INVESTIGATOR_ROSTER
│   │   └── shipments.js          # SHIPMENTS — 12 shipments across 3 companies
│   ├── lib/
│   │   ├── companies.js          # fetchCompanies()/createCompany() — Supabase `companies` table
│   │   ├── detectionEngine.js    # DETECTION_RULES (8 rules) + scan/incident-creation functions
│   │   ├── mapbox.js             # Shared MAPBOX_TOKEN + geocode()
│   │   ├── notifications.js      # dispatchAlert() — the single alert fan-out point
│   │   ├── supabase.js           # Shared SB_URL/SB_KEY/sbHeaders()
│   │   ├── utils.js              # Formatters (fmtCurrency, fmtDate) + badge style maps
│   │   └── webrtcSignaling.js    # Shared sendSignal()/pollSignal() for WebRTC handshake
│   └── pages/
│       ├── Alerts.jsx            # Alert list, detail modal, detection-engine scan trigger
│       ├── CameraView.jsx        # Live WebRTC camera viewer grid (up to 3 feeds)
│       ├── Dashboard.jsx         # Per-company KPI dashboard + executive summary
│       ├── Recovery.jsx          # Recovery case list
│       ├── RecoveryCase.jsx      # ⚠️ SEPARATE device-centric recovery UI (see §3 redundancy note)
│       ├── RecoveryDetail.jsx    # Real incident-based recovery case detail (stage workflow, evidence, LE/insurance, custody log)
│       ├── Reports.jsx           # Per-company analytics/reporting page
│       ├── Settings.jsx          # Alert contact/notification config (Supabase-backed)
│       ├── ShipmentDetail.jsx    # Single shipment detail + live map + case file export
│       ├── Shipments.jsx         # Shipment list
│       └── UnifiedCommandCenter.jsx  # Default landing page — live map, AI alert response, AI route planner, WebRTC preview (1656 lines, largest file)
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── vercel.json
├── vite.config.js
├── .env.example                  # Documents required env vars (no real secrets)
└── package-lock.json              # excluded from this package (2816 lines / 92KB, pure lockfile)
```

**Notably absent** (do not exist in this codebase — flagged since the request template asked about them): `src/routes/`, `src/services/`, `src/hooks/`, `src/types/`, `src/store/`, any backend/server framework beyond the 3 Vercel functions, any ORM/Prisma/schema files, any GraphQL. This is a flat React SPA with a single top-level state object in `App.jsx`, no client-side router (navigation is a `page` string switched in `App.jsx`, plus a `window` `CustomEvent("divvo-nav")` some components use to navigate without prop-drilling).

---

## 2. Key Source Files (full contents)

### 2.1 `package.json`
```json
{
  "name": "divvo-guardian",
  "private": true,
  "version": "1.0.0",
  "description": "Divvo Guardian — Cargo Theft Prevention & Recovery Platform",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@sentry/react": "^10.63.0",
    "@vercel/analytics": "^2.0.1",
    "mapbox-gl": "^3.4.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.14",
    "vite": "^5.4.10"
  }
}
```
No test runner, no lint script, no TypeScript, no state-management library (Redux/Zustand/etc.), no data-fetching library (React Query/SWR/etc.), no form library, no router.

### 2.2 `vite.config.js`
```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
  },
});
```

### 2.3 `vercel.json`
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

### 2.4 `tailwind.config.js`
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

### 2.5 `index.html`
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Divvo Guardian — Cargo Security Platform</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

### 2.6 `.env.example`
```
# Frontend (exposed to the browser bundle — VITE_ prefix required by Vite)
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_MAPBOX_TOKEN=
VITE_SENTRY_DSN=

# Serverless-only (Vercel Functions in api/ — read via process.env, never exposed to the client)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_SMS_FROM=
RESEND_API_KEY=
```
**Note:** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (server-only, used by `api/add-company.js`) are configured directly in Vercel's env var UI and are intentionally *not* listed in `.env.example` alongside the `VITE_`-prefixed public ones — worth tightening for the next dev who touches this file.

### 2.7 `src/main.jsx`
```jsx
import React from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from "@sentry/react";
import { Analytics } from "@vercel/analytics/react";
import App from "./App.jsx";
import "./index.css";

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 1.0,
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<p>Something went wrong. The team has been notified.</p>}>
      <App />
    </Sentry.ErrorBoundary>
    <Analytics />
  </React.StrictMode>
);
```

### 2.8 `src/App.jsx` (full — the root component and only "router")
```jsx
import { useState, useCallback, useEffect } from "react";
import { SHIPMENTS } from "./data/shipments.js";
import { INITIAL_ALERTS } from "./data/alerts.js";
import { INITIAL_INCIDENTS } from "./data/incidents.js";
import { RECOVERY_MOCK, buildDefaultRecoveryDetail } from "./data/recoveryMock.js";
import { fetchCompanies } from "./lib/companies.js";
import { runTheftDetectionScan, createIncidentFromAlert, createIncidentForShipment } from "./lib/detectionEngine.js";
import Sidebar from "./components/Sidebar.jsx";

// Pages
import UnifiedCommandCenter   from "./pages/UnifiedCommandCenter.jsx";
import Dashboard       from "./pages/Dashboard.jsx";
import ShipmentsPage   from "./pages/Shipments.jsx";
import ShipmentDetail  from "./pages/ShipmentDetail.jsx";
import AlertsPage      from "./pages/Alerts.jsx";
import RecoveryPage    from "./pages/Recovery.jsx";
import RecoveryDetail  from "./pages/RecoveryDetail.jsx";
import RecoveryCase    from "./pages/RecoveryCase.jsx";
import ReportsPage     from "./pages/Reports.jsx";
import SettingsPage    from "./pages/Settings.jsx";
import CameraView      from "./pages/CameraView.jsx";

// Scan-results toast (small, stays in App so it survives page transitions)
function ScanToast({ results, onDismiss }) {
  if (!results) return null;
  return (
    <div className="fixed bottom-6 right-6 z-40 bg-gray-900 text-white rounded-xl shadow-2xl p-5 w-80">
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm font-semibold">Scan Complete</p>
        <button onClick={onDismiss} className="text-gray-400 hover:text-white text-lg leading-none">×</button>
      </div>
      {results.length === 0 ? (
        <p className="text-xs text-gray-300">No new alerts detected. All shipments within normal parameters.</p>
      ) : (
        <>
          <p className="text-xs text-gray-300 mb-3">
            {results.length} new alert{results.length > 1 ? "s" : ""} generated:
          </p>
          <div className="space-y-1.5">
            {results.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2">
                <span className="text-xs text-gray-200 truncate">{a.shipmentId} — {a.type}</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                  a.severity === "Critical" ? "bg-red-600 text-white" :
                  a.severity === "High"     ? "bg-orange-500 text-white" :
                  "bg-amber-400 text-amber-900"
                }`}>{a.severity}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState("unified-command");
  const [selectedShipment, setSelectedShipment]   = useState(null);
  const [selectedIncident, setSelectedIncident]   = useState(null);
  const [selectedDevice, setSelectedDevice]       = useState("DG-1028");
  const [companies, setCompanies]                 = useState([]);
  const [companiesLoading, setCompaniesLoading]   = useState(true);
  const [company, setCompany]                     = useState(null);

  const [alerts,    setAlerts]    = useState(INITIAL_ALERTS);
  const [incidents, setIncidents] = useState(INITIAL_INCIDENTS);
  const [recoveryDetails, setRecoveryDetails] = useState(() => ({ ...RECOVERY_MOCK }));
  const [scanning,  setScanning]  = useState(false);
  const [scanResults, setScanResults] = useState(null);

  // Companies now live in Supabase so new ones can be added at runtime
  // (see src/lib/companies.js + api/add-company.js) instead of requiring a
  // code change.
  useEffect(() => {
    fetchCompanies().then((rows) => {
      setCompanies(rows);
      if (rows.length) setCompany((prev) => prev || rows.find((c) => c.id === "owlet")?.id || rows[0].id);
      setCompaniesLoading(false);
    });
  }, []);

  const addCompanyToList = useCallback((newCompany) => {
    setCompanies((prev) => [...prev, newCompany]);
    setCompany(newCompany.id);
  }, []);

  const companyInfo = companies.find((c) => c.id === company) || null;
  const companyShipments = companyInfo ? SHIPMENTS.filter((s) => s.customer === companyInfo.name) : [];
  const companyShipmentIds = new Set(companyShipments.map((s) => s.id));

  const openAlerts = alerts.filter((a) => a.status === "Open" && companyShipmentIds.has(a.shipmentId)).length;

  const handleNav = (p) => {
    setPage(p);
    setSelectedShipment(null);
    setSelectedIncident(null);
  };

  // Listen for navigation events from child components
  useEffect(() => {
    const handler = (e) => {
      if (typeof e.detail === "object" && e.detail.page) {
        setSelectedDevice(e.detail.deviceId || "DG-1028");
        handleNav(e.detail.page);
      } else {
        handleNav(e.detail);
      }
    };
    window.addEventListener("divvo-nav", handler);
    return () => window.removeEventListener("divvo-nav", handler);
  }, []);

  const handleViewShipment = (id) => {
    setSelectedShipment(id);
    setPage("shipment-detail");
  };

  const handleViewIncident = (id) => {
    setSelectedIncident(id);
    setPage("recovery-detail");
  };

  const handleScan = useCallback(() => {
    setScanning(true);
    setScanResults(null);
    setTimeout(() => {
      const newAlerts = runTheftDetectionScan(companyShipments, alerts);
      setAlerts((prev) => [...prev, ...newAlerts]);
      setScanResults(newAlerts);
      setScanning(false);
    }, 1800);
  }, [alerts, companyShipments]);

  const handleConvertToIncident = useCallback((alert) => {
    const ship = SHIPMENTS.find((s) => s.id === alert.shipmentId);
    const { incident, incidentId } = createIncidentFromAlert(alert, ship);
    setIncidents((prev) => [incident, ...prev]);
    setRecoveryDetails((prev) => ({ ...prev, [incidentId]: buildDefaultRecoveryDetail(ship) }));
    setAlerts((prev) =>
      prev.map((a) => (a.id === alert.id ? { ...a, incidentId, status: "Under Review" } : a))
    );
  }, []);

  const handleUpdateAlertStatus = useCallback((alertId, status) => {
    setAlerts((prev) => prev.map((a) => (a.id === alertId ? { ...a, status } : a)));
  }, []);

  const handleUpdateRecoveryDetail = useCallback((incidentId, patch) => {
    setRecoveryDetails((prev) => ({ ...prev, [incidentId]: { ...prev[incidentId], ...patch } }));
  }, []);

  const handleAdvanceStage = useCallback((incidentId, stage, stageLabel) => {
    setIncidents((prev) =>
      prev.map((i) =>
        i.id === incidentId
          ? {
              ...i,
              stage,
              stageLabel,
              updates: [...i.updates, { time: new Date().toISOString(), text: `Stage advanced to "${stageLabel}"` }],
            }
          : i
      )
    );
  }, []);

  const handleCreateIncidentForShipment = useCallback((shipmentId) => {
    const ship = SHIPMENTS.find((s) => s.id === shipmentId);
    const { incident, incidentId } = createIncidentForShipment(ship, {
      title: `Manual Case — ${ship?.id}`,
      priority: ship?.riskLevel,
      description: `Recovery case manually opened from shipment detail for ${ship?.id}.`,
    });
    setIncidents((prev) => [incident, ...prev]);
    setRecoveryDetails((prev) => ({ ...prev, [incidentId]: buildDefaultRecoveryDetail(ship) }));
    handleViewIncident(incidentId);
  }, []);

  // Derive active sidebar item from page
  const activeNav =
    page === "shipment-detail" ? "shipments" :
    page === "recovery-detail" ? "recovery" :
    page;

  const renderPage = () => {
    if (page === "shipment-detail" && selectedShipment)
      return (
        <ShipmentDetail
          shipmentId={selectedShipment}
          alerts={alerts}
          companyInfo={companyInfo}
          onBack={() => handleNav("shipments")}
          onCreateIncident={handleCreateIncidentForShipment}
        />
      );

    if (page === "recovery-detail" && selectedIncident)
      return (
        <RecoveryDetail
          key={selectedIncident}
          incidentId={selectedIncident}
          incidents={incidents}
          alerts={alerts}
          recoveryDetail={recoveryDetails[selectedIncident]}
          onUpdateRecoveryDetail={handleUpdateRecoveryDetail}
          onAdvanceStage={handleAdvanceStage}
          onBack={() => handleNav("recovery")}
        />
      );

    switch (page) {
      case "recovery-case":
        return <RecoveryCase onBack={() => handleNav("unified-command")} deviceId={selectedDevice} />;

      case "unified-command":
        return <UnifiedCommandCenter key={company} onNav={handleNav} companyInfo={companyInfo} />;

      case "dashboard":
        return (
          <Dashboard
            alerts={alerts}
            incidents={incidents}
            companyInfo={companyInfo}
            onNav={handleNav}
            onViewShipment={handleViewShipment}
          />
        );

      case "shipments":
        return <ShipmentsPage companyInfo={companyInfo} onViewShipment={handleViewShipment} />;

      case "alerts":
        return (
          <AlertsPage
            alerts={alerts}
            companyInfo={companyInfo}
            scanning={scanning}
            onScan={handleScan}
            onViewShipment={handleViewShipment}
            onConvertToIncident={handleConvertToIncident}
            onUpdateAlertStatus={handleUpdateAlertStatus}
          />
        );

      case "recovery":
        return <RecoveryPage incidents={incidents} companyInfo={companyInfo} onViewIncident={handleViewIncident} />;

      case "camera":
        return <CameraView key={company} companyInfo={companyInfo} />;

      case "reports":
        return <ReportsPage companyInfo={companyInfo} alerts={alerts} incidents={incidents} />;

      case "settings":
        return <SettingsPage companyInfo={companyInfo} />;

      default:
        return <UnifiedCommandCenter key={company} onNav={handleNav} companyInfo={companyInfo} />;
    }
  };

  if (companiesLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-500 text-sm">
        Loading Divvo Guardian...
      </div>
    );
  }

  if (!companyInfo) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-400 text-sm text-center px-6">
        No companies found. Check that the `companies` table exists and is reachable in Supabase.
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 font-sans overflow-hidden">
      <Sidebar
        active={activeNav}
        onNav={handleNav}
        openAlerts={openAlerts}
        companies={companies}
        selectedCompany={company}
        onCompanyChange={setCompany}
        onCompanyCreated={addCompanyToList}
      />
      <main className="flex-1 overflow-auto min-w-0">
        {renderPage()}
      </main>
      <ScanToast results={scanResults} onDismiss={() => setScanResults(null)} />
    </div>
  );
}
```

### 2.9 `src/lib/*` (all 7 files, full — this is the app's only "backend client" layer)

**`src/lib/supabase.js`**
```js
export const SB_URL = import.meta.env.VITE_SUPABASE_URL;
export const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const sbHeaders = (extra = {}) => ({
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  ...extra,
});
```

**`src/lib/mapbox.js`**
```js
export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

export async function geocode(place) {
  const encoded = encodeURIComponent(place.trim());
  const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encoded}&access_token=${MAPBOX_TOKEN}&limit=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
  const data = await res.json();
  const feat = data.features?.[0];
  if (!feat) throw new Error(`Could not find a location for "${place}"`);
  return feat.geometry.coordinates; // [lng, lat]
}
```

**`src/lib/webrtcSignaling.js`**
```js
import { SB_URL, sbHeaders } from "./supabase.js";

// Polling-based WebRTC signaling channel over the `webrtc_signals` Supabase
// table — the dashboard is always the "viewer" side, the physical/simulated
// device is always the "cam" side.
export async function sendSignal(deviceId, type, payload) {
  await fetch(SB_URL + "/rest/v1/webrtc_signals", {
    method: "POST",
    headers: sbHeaders({ "Content-Type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify({ device_id: deviceId + "-viewer", type, payload }),
  });
}

export async function pollSignal(deviceId, type) {
  const res = await fetch(
    SB_URL + "/rest/v1/webrtc_signals?device_id=eq." + deviceId + "-cam&type=eq." + type + "&order=created_at.desc&limit=1",
    { headers: sbHeaders() }
  );
  const rows = await res.json();
  return rows?.[0] ?? null;
}
```

**`src/lib/companies.js`**
```js
import { SB_URL, sbHeaders } from "./supabase.js";

function normalizeCompany(r) {
  return {
    id: r.id,
    name: r.name,
    program: r.program,
    region: r.region,
    mapCenter: [r.map_center_lng, r.map_center_lat],
    mapZoom: r.map_zoom,
  };
}

export async function fetchCompanies() {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/companies?select=*&order=created_at.asc`, {
      headers: sbHeaders(),
    });
    const rows = await res.json();
    if (!Array.isArray(rows)) return [];
    return rows.map(normalizeCompany);
  } catch {
    return [];
  }
}

// Writes go through api/add-company.js (service_role key, bypasses RLS) —
// the anon key used everywhere else in this file can only read companies.
export async function createCompany({ name, region, mapCenter, mapZoom, primaryEmail, primaryPhone }) {
  const res = await fetch("/api/add-company", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, region, mapCenter, mapZoom, primaryEmail, primaryPhone }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to create company");
  return normalizeCompany(data.company);
}
```

**`src/lib/notifications.js`**
```js
import { SB_URL, sbHeaders } from "./supabase.js";

// ── Fetch alert settings from Supabase ────────────────────────────────────────
export async function fetchAlertSettings(companyId = "owlet") {
  try {
    const res = await fetch(
      SB_URL + `/rest/v1/alert_settings?select=*&company_id=eq.${companyId}&limit=1`,
      { headers: sbHeaders() }
    );
    const rows = await res.json();
    return rows?.[0] ?? null;
  } catch { return null; }
}

// ── Browser push notification ─────────────────────────────────────────────────
export async function sendBrowserNotification(title, body, severity) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }
  if (Notification.permission === "granted") {
    const icon = severity === "Critical" ? "🚨" : severity === "Warning" ? "⚠️" : "📡";
    new Notification(`${icon} Divvo Guardian — ${title}`, {
      body,
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      tag: "divvo-alert",
      requireInteraction: severity === "Critical",
    });
  }
}

// ── Send SMS via Vercel function ──────────────────────────────────────────────
export async function sendSMS(phones, message) {
  try {
    await fetch("/api/send-sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: phones, message }),
    });
  } catch (e) { console.error("SMS failed:", e); }
}

// ── Send email via Vercel function ────────────────────────────────────────────
export async function sendEmail({ to, subject, alertType, deviceId, location, severity, details }) {
  try {
    await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, alertType, deviceId, location, severity, details }),
    });
  } catch (e) { console.error("Email failed:", e); }
}

// ── Main alert dispatcher ─────────────────────────────────────────────────────
export async function dispatchAlert({ alertType, deviceId, location, severity, details = [], companyId = "owlet" }) {
  const settings = await fetchAlertSettings(companyId);
  if (!settings) return;

  const isCritical = severity === "Critical";
  const isWarning  = severity === "Warning";

  const subject = `[${severity}] Divvo Guardian — ${alertType} · ${deviceId}`;
  const smsBody = `🚨 DIVVO GUARDIAN ${severity.toUpperCase()} ALERT\n${alertType}\nDevice: ${deviceId}\nLocation: ${location}\nView: divvo-guardian.vercel.app`;

  // Browser notification — always if enabled
  if (settings.browser_all) {
    await sendBrowserNotification(alertType, `${deviceId} · ${location}`, severity);
  }

  // SMS — Critical always, Warning only if enabled
  const shouldSMS = (isCritical && settings.sms_critical) || (isWarning && settings.sms_warning);
  if (shouldSMS && settings.phones?.length) {
    await sendSMS(settings.phones, smsBody);
  }

  // Email — Critical and Warning based on settings
  const shouldEmail = (isCritical && settings.email_critical) || (isWarning && settings.email_warning);
  if (shouldEmail && settings.emails?.length) {
    await sendEmail({
      to: settings.emails,
      subject,
      alertType,
      deviceId,
      location,
      severity,
      details: [
        ["Alert Type",  alertType],
        ["Device ID",   deviceId],
        ["Location",    location],
        ["Severity",    severity],
        ["Time",        new Date().toLocaleString("en-US")],
        ...details,
      ],
    });
  }
}
```

**`src/lib/utils.js`**
```js
// ── Formatters ────────────────────────────────────────────────────────────────

export const fmtCurrency = (v) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);

export const fmtCurrencyCompact = (v) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return fmtCurrency(v);
};

export const fmtDate = (iso) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

// ── Badge style maps ──────────────────────────────────────────────────────────

export const RISK_STYLES = {
  Low:      "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  Medium:   "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  High:     "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
  Critical: "bg-red-50 text-red-700 ring-1 ring-red-200",
};

export const STATUS_STYLES = {
  "On Schedule":    "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  "In Transit":     "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  "Delayed":        "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  "Critical Alert": "bg-red-50 text-red-700 ring-1 ring-red-200",
};

export const SEVERITY_STYLES = {
  Critical: "bg-red-600 text-white",
  High:     "bg-orange-500 text-white",
  Medium:   "bg-amber-400 text-amber-900",
  Low:      "bg-emerald-100 text-emerald-700",
};

export const ALERT_STATUS_STYLES = {
  Open:           "bg-red-50 text-red-700 ring-1 ring-red-200",
  "Under Review": "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  Resolved:       "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
};
```

**`src/lib/detectionEngine.js`**
```js
import { fmtCurrency } from "./utils.js";

// ── Detection Rules ───────────────────────────────────────────────────────────

export const DETECTION_RULES = [
  {
    id: "route-deviation",
    label: "Route Deviation",
    check: (s) => s.routeDeviation && s.deviationMiles > 0.5,
    severity: (s) => (s.deviationMiles > 5 ? "High" : "Medium"),
    description: (s) =>
      `Vehicle deviated ${s.deviationMiles.toFixed(1)} miles from approved corridor near ${s.lastLocation}. Unscheduled exit lasted ${s.deviationMinutes} minutes.`,
    recommendedAction: () =>
      "Contact driver immediately for explanation. Verify with carrier dispatch. If no response within 15 minutes, escalate to incident.",
  },
  {
    id: "unauthorized-stop",
    label: "Unauthorized Stop",
    check: (s) => s.unauthorizedStop && s.stopDurationMinutes > 20,
    severity: (s) =>
      s.stopDurationMinutes > 120 ? "Critical" : s.stopDurationMinutes > 45 ? "High" : "Medium",
    description: (s) =>
      `Vehicle stopped at unauthorized location (${s.stopLocation}) for ${s.stopDurationMinutes} minutes. Location is outside approved rest stops.`,
    recommendedAction: (s) =>
      s.stopDurationMinutes > 120
        ? "IMMEDIATE: Dispatch recovery team. Prolonged unauthorized stop exceeds theft threshold. Contact law enforcement."
        : "Contact driver and carrier. Request explanation and ETA confirmation. Log for pattern review.",
  },
  {
    id: "door-opened",
    label: "Door Opened",
    check: (s) => s.doorStatus === "Opened" && !s.atDestination,
    severity: () => "Critical",
    description: (s) =>
      `Container door sensor triggered at ${s.lastLocation}. Vehicle is not at an authorized unloading point. Seal status: ${s.sealStatus}.`,
    recommendedAction: () =>
      "CRITICAL: Treat as active theft. Dispatch recovery team immediately. Do not alert driver. Contact local law enforcement and prepare evidence package.",
  },
  {
    id: "tracker-offline",
    label: "Tracker Offline",
    check: (s) => s.trackerOffline,
    severity: (s) => (s.trackerOfflineMinutes > 60 ? "High" : "Medium"),
    description: (s) =>
      `GPS tracker lost signal for ${s.trackerOfflineMinutes} minutes. Last known position: ${s.lastLocation}. Signal has not been restored.`,
    recommendedAction: () =>
      "Contact carrier for vehicle location via dispatch. Request driver check-in call. If offline >60 min, escalate to High and open investigation.",
  },
  {
    id: "low-battery",
    label: "Low Tracker Battery",
    check: (s) => s.trackerBattery < 35,
    severity: (s) => (s.trackerBattery < 15 ? "High" : "Medium"),
    description: (s) =>
      `Tracker battery at ${s.trackerBattery}% on shipment ${s.id}. Risk of signal loss before destination arrival. ETA: ${new Date(s.eta).toLocaleDateString()}.`,
    recommendedAction: () =>
      "Notify carrier to inspect and charge tracker unit at next authorized stop. Schedule battery swap if below 20%.",
  },
  {
    id: "critical-risk-score",
    label: "Critical Risk Score",
    check: (s) => s.riskScore >= 80,
    severity: (s) => (s.riskScore >= 90 ? "Critical" : "High"),
    description: (s) =>
      `Composite risk score of ${s.riskScore}/100 detected for ${s.id}. Score reflects route, stop patterns, cargo value (${fmtCurrency(s.cargoValue)}), and carrier history.`,
    recommendedAction: (s) =>
      s.riskScore >= 90
        ? "Escalate to senior analyst immediately. Consider proactive law enforcement notification. Increase check-in frequency to every 30 minutes."
        : "Flag for enhanced monitoring. Increase tracker ping rate. Require driver check-ins every hour.",
  },
  {
    id: "seal-tampering",
    label: "Seal Tampering",
    check: (s) => s.sealStatus === "Breached",
    severity: () => "Critical",
    description: (s) =>
      `Container seal ${s.containerNumber} reported as BREACHED. Tampering detected at ${s.lastLocation}. Physical cargo integrity cannot be confirmed.`,
    recommendedAction: () =>
      "CRITICAL: Seal breach is primary theft indicator. Stop shipment if possible. Dispatch field agent. Notify customer and carrier. Prepare law enforcement package.",
  },
  {
    id: "imu-physical-tamper",
    label: "Physical Tamper Detected",
    check: (s) =>
      (s.imu_impact_g_force ?? 0) >= 3.20 || (s.angular_tilt_deviation ?? 0) >= 12.0,
    severity: () => "Critical",
    description: (s) => {
      const imuResult = evaluateIncomingThreatMetrics({
        imu_impact_g_force: s.imu_impact_g_force ?? 0,
        angular_tilt_deviation: s.angular_tilt_deviation ?? 0,
      });
      const detail =
        (s.imu_impact_g_force ?? 0) >= 3.20
          ? `IMU impact force ${s.imu_impact_g_force.toFixed(2)}G exceeds prying/cutting threshold (3.20G).`
          : `Angular tilt deviation ${s.angular_tilt_deviation.toFixed(1)}° exceeds tamper threshold (12.0°).`;
      return `${detail} System action: ${imuResult.system_action}. Container ${s.containerNumber} at ${s.lastLocation} may be experiencing forced entry.`;
    },
    recommendedAction: () =>
      "CRITICAL: Physical tamper signature detected via onboard IMU. Treat as active break-in attempt. Dispatch recovery team immediately. Do not alert driver. Activate remote alarm if supported by tracker hardware.",
  },
];

// ── IMU / Physical Tamper Evaluation ─────────────────────────────────────────
// Evaluates raw accelerometer/gyroscope telemetry from tracker hardware.
// G-force >= 3.20 indicates heavy structural impact (prying, cutting).
// Angular tilt >= 12.0° indicates container being tilted or tipped.

export const evaluateIncomingThreatMetrics = (metrics) => {
  if (metrics.imu_impact_g_force >= 3.20 || metrics.angular_tilt_deviation >= 12.0) {
    return {
      system_action: "TRIGGER_ACTIVE_ALARM",
      threat_severity: "CRITICAL",
    };
  }
  return {
    system_action: "LOG_DIAGNOSTIC_HEARTBEAT",
    threat_severity: "LOW",
  };
};

// ── Counters (module-level, survive HMR in dev) ───────────────────────────────
let _alertSeq = 200;
let _incidentSeq = 60;

// ── Scan function ─────────────────────────────────────────────────────────────

export function runTheftDetectionScan(shipments, existingAlerts) {
  const now = new Date().toISOString();
  const newAlerts = [];

  for (const ship of shipments) {
    for (const rule of DETECTION_RULES) {
      if (!rule.check(ship)) continue;

      const alreadyExists = existingAlerts.some(
        (a) =>
          a.shipmentId === ship.id &&
          a.type === rule.label &&
          (a.status === "Open" || a.status === "Under Review") &&
          a.source === "scan"
      );
      if (alreadyExists) continue;

      newAlerts.push({
        id: `ALT-${String(_alertSeq++).padStart(3, "0")}`,
        shipmentId: ship.id,
        type: rule.label,
        severity: rule.severity(ship),
        timestamp: now,
        description: rule.description(ship),
        recommendedAction: rule.recommendedAction(ship),
        status: "Open",
        source: "scan",
        incidentId: null,
        ruleId: rule.id,
      });
    }
  }

  return newAlerts;
}

// ── Create incident from alert ────────────────────────────────────────────────

export function createIncidentForShipment(shipment, { title, description, priority, updates } = {}) {
  const id = `INC-2026-${String(_incidentSeq++).padStart(4, "0")}`;
  const now = new Date().toISOString();
  return {
    incident: {
      id,
      shipmentId: shipment?.id,
      title: title ?? `Manual Case — ${shipment?.id}`,
      stage: 2,
      stageLabel: "Case Created",
      priority: priority ?? shipment?.riskLevel ?? "Medium",
      createdAt: now,
      assignedTo: "Unassigned",
      cargoValue: shipment?.cargoValue ?? 0,
      description: description ?? `Manually opened recovery case for shipment ${shipment?.id}.`,
      updates: updates ?? [{ time: now, text: `Incident case created manually for shipment ${shipment?.id}` }],
    },
    incidentId: id,
  };
}

export function createIncidentFromAlert(alert, shipment) {
  const now = new Date().toISOString();
  const result = createIncidentForShipment(shipment, {
    title: `${alert.type} — ${shipment?.id ?? alert.shipmentId}`,
    priority: alert.severity,
    description: `${alert.description}\n\nRecommended action: ${alert.recommendedAction}`,
    updates: [
      {
        time: alert.timestamp,
        text: `${alert.type} alert triggered (${alert.source === "scan" ? "Detection Engine" : "Manual"})`,
      },
      { time: now, text: `Incident case created from alert ${alert.id}` },
    ],
  });
  result.incident.shipmentId = shipment?.id ?? alert.shipmentId;
  return result;
}
```

### 2.10 `api/*.js` (all 3 Vercel serverless functions — the app's ENTIRE server-side surface)

**`api/add-company.js`**
```js
// Server-only: uses the Supabase service_role key, which bypasses Row Level
// Security entirely. This must never be exposed to the client — the browser
// only ever talks to this endpoint, never to Supabase directly for writes here.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Server not configured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
  }

  const { name, region, mapCenter, mapZoom, primaryEmail, primaryPhone } = req.body;
  if (!name || !Array.isArray(mapCenter) || mapCenter.length !== 2) {
    return res.status(400).json({ error: "Missing name or mapCenter [lng, lat]" });
  }

  const id = slugify(name);
  if (!id) return res.status(400).json({ error: "Could not derive a valid id from name" });

  const headers = {
    "Content-Type": "application/json",
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    Prefer: "return=representation",
  };

  try {
    // Reject duplicates up front for a clean error instead of a 409 from Postgres
    const existing = await fetch(`${SUPABASE_URL}/rest/v1/companies?select=id&id=eq.${id}`, { headers });
    const existingRows = await existing.json();
    if (existingRows?.length) {
      return res.status(409).json({ error: `A company with id "${id}" already exists` });
    }

    const companyRes = await fetch(`${SUPABASE_URL}/rest/v1/companies`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        id,
        name,
        program: "Pilot Program",
        region: region || null,
        map_center_lng: mapCenter[0],
        map_center_lat: mapCenter[1],
        map_zoom: mapZoom || 5.8,
      }),
    });
    if (!companyRes.ok) {
      const err = await companyRes.json().catch(() => ({}));
      return res.status(companyRes.status).json({ error: err.message || "Failed to create company" });
    }
    const [company] = await companyRes.json();

    const settingsRes = await fetch(`${SUPABASE_URL}/rest/v1/alert_settings`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        company_id: id,
        client_name: name,
        emails: primaryEmail ? [primaryEmail] : [],
        phones: primaryPhone ? [primaryPhone] : [],
        sms_critical: true,
        sms_warning: false,
        email_critical: true,
        email_warning: true,
        browser_all: true,
      }),
    });
    if (!settingsRes.ok) {
      const err = await settingsRes.json().catch(() => ({}));
      // Company row already exists at this point; surface the settings failure
      // but don't roll back — an operator can add settings manually if needed.
      return res.status(207).json({ company, warning: `Company created, but alert settings failed: ${err.message || "unknown error"}` });
    }

    return res.status(201).json({ company });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
```

**`api/send-sms.js`**
```js
const TWILIO_SID   = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const SMS_FROM     = process.env.TWILIO_SMS_FROM;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { to, message } = req.body;
  if (!to || !message) return res.status(400).json({ error: "Missing to or message" });

  const phones = Array.isArray(to) ? to : [to];
  const results = [];

  for (const phone of phones) {
    try {
      const credentials = `${TWILIO_SID}:${TWILIO_TOKEN}`;
      const encoded = Buffer.from(credentials).toString("base64");

      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
        {
          method: "POST",
          headers: {
            "Authorization": `Basic ${encoded}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To:   phone,
            From: SMS_FROM,
            Body: message,
          }),
        }
      );

      const text = await response.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }

      results.push({
        phone,
        httpStatus: response.status,
        sid: data.sid,
        status: data.status,
        twilioError: data.message,
        twilioCode: data.code,
      });
    } catch (err) {
      results.push({ phone, error: err.message });
    }
  }

  return res.status(200).json({ results });
}
```

**`api/send-email.js`** — sends HTML alert emails via Resend (`https://api.resend.com/emails`), same request/response shape as `send-sms.js`. Full HTML template omitted here for brevity (it's a branded dark-mode email with alert severity color-coding); functionally: takes `{ to, subject, alertType, deviceId, location, severity, details }`, POSTs to Resend with a hardcoded `from: "Divvo Guardian <onboarding@resend.dev>"`.

### 2.11 `src/data/*.js` (mock data — this IS the current "database")

**`src/data/shipments.js`** — `export const SHIPMENTS = [...]`, 12 objects. Shape:
```js
{
  id, customer, cargoType, containerNumber, originPort, destination, carrier,
  status,            // "On Schedule" | "In Transit" | "Delayed" | "Critical Alert"
  riskScore,         // 0-100
  riskLevel,         // "Low" | "Medium" | "High" | "Critical"
  cargoValue,        // number (dollars)
  lastLocation, eta, sealStatus,       // "Intact" | "Breached"
  trackerBattery,    // 0-100
  doorStatus,        // "Closed" | "Opened"
  route,             // human-readable string, e.g. "Houston → San Antonio → El Paso → Tucson → Los Angeles"
  routeDeviation, deviationMiles, deviationMinutes,
  unauthorizedStop, stopDurationMinutes, stopLocation,
  trackerOffline, trackerOfflineMinutes,
  atDestination,
  // Some shipments also carry (used by the IMU tamper rule):
  imu_impact_g_force, angular_tilt_deviation,
}
```
4 shipments per company × 3 companies (Owlet: `OWL-HOU-1001/OWL-LGB-1002/OWL-SAV-1003/OWL-NJ-1004`; Meridian: `MER-TAC-2001/MER-PDX-2002/MER-OLY-2003/MER-SEA-2004`; Coastal: `CST-SAV-3001/CST-JAX-3002/CST-CHS-3003/CST-BRW-3004`).

**`src/data/alerts.js`** — `export const INITIAL_ALERTS = [...]`, 10 objects. Shape:
```js
{
  id,                // "ALT-001"
  shipmentId,
  type,              // e.g. "Door Opened", "Route Deviation" — matches DETECTION_RULES labels
  severity,          // "Critical" | "High" | "Medium"
  timestamp,
  description, recommendedAction,
  status,            // "Open" | "Under Review" | "Resolved"
  source,            // "manual" | "scan"
  incidentId,        // null or "INC-2026-XXXX" once converted
}
```

**`src/data/incidents.js`** — `export const INITIAL_INCIDENTS = [...]` (9 objects) + `export const WORKFLOW_STAGES` (7-stage array: `["Alert Received","Case Created","Divvo Review","Recovery Team Assigned","Law Enforcement Package Prepared","Asset Located","Recovery Complete"]`). Incident shape:
```js
{
  id,                // "INC-2026-0041"
  shipmentId, title,
  stage,             // 1-7, integer index into WORKFLOW_STAGES
  stageLabel,        // human string mirroring `stage`
  priority,          // "Critical" | "High" | "Medium"
  createdAt, assignedTo, cargoValue, description,
  updates: [{ time, text }],   // append-only incident log
}
```

**`src/data/recoveryMock.js`** — `export function buildDefaultRecoveryDetail(shipment)`, `export const RECOVERY_MOCK` (keyed by incident id — one entry per one of the 9 `INITIAL_INCIDENTS`), `export const INVESTIGATOR_ROSTER` (4 fixed names/phone/email). RecoveryDetail shape (the richest object in the app):
```js
{
  incidentType,      // e.g. "Cargo Theft — Active"
  investigator, investigatorPhone, investigatorEmail,
  recoveryTeam, teamLead, teamPhone, teamDeployed,
  lastGPS: { coords, address, timestamp, speed, heading },
  evidence: [{ id, label, done }],
  lawEnforcement: {
    agency, caseNumber, contactName, contactPhone,
    reportFiled, reportFiledAt,
    notes,
    packetGenerated, packetGeneratedAt,
  },
  insurance: {
    carrier, policyNumber, claimNumber,
    adjusterName, adjusterPhone, adjusterEmail,
    claimFiled, claimFiledAt, estimatedPayout, status, notes,
  },
  chainOfCustody: [{ time, actor, action, artifact }],   // append-only, tamper-evident-styled log
}
```

**`src/data/companyFleets.js`** — 3 exports, all keyed by company id (`owlet` / `meridian` / `coastal`):
- `COMPANY_DEVICES` — 8 devices per company. Shape: `{ id, trailerId, lat, lon, severity, type, location, battery, lte, camera, door, lock, vibration, checkin, carrier, cargo }`. **This is the closest thing to a "trailer + lock + sensor" object that exists today** — `trailerId`, `door` ("Closed"/"Open"), `lock` ("Secure"/"Unlocked"/"Tampered"), `vibration` ("Normal"/"Elevated"), `battery`, `lte`, `camera` are all flat string/number fields on a single mock object, not normalized entities or event logs.
- `COMPANY_SHIPMENT_ROUTES` — 2 highlighted routes per company (the Critical + High risk shipment), used to draw dashed lines on the Command Center map and to render the live route on `ShipmentDetail`'s map. Shape: `{ id, severity, from: [lng,lat], to: [lng,lat], label, cargo, carrier, origin, destination }`.
- `COMPANY_DEVICE_CONTEXT` — per-device origin/destination/carrier/cargo prefill used only to pre-populate the AI Route Planner form when clicking a "Secure" device.

### 2.12 `src/components/*` (5 files, full)

**`src/components/Badges.jsx`**
```jsx
import { RISK_STYLES, STATUS_STYLES, SEVERITY_STYLES, ALERT_STATUS_STYLES } from "../lib/utils.js";

export const Badge = ({ label, style }) => (
  <span
    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide ${style}`}
  >
    {label}
  </span>
);

export const RiskBadge = ({ level }) => (
  <Badge label={level} style={RISK_STYLES[level] || "bg-gray-100 text-gray-700"} />
);

export const StatusBadge = ({ status }) => (
  <Badge label={status} style={STATUS_STYLES[status] || "bg-gray-100 text-gray-700"} />
);

export const SeverityBadge = ({ s }) => (
  <Badge label={s} style={SEVERITY_STYLES[s] || "bg-gray-100 text-gray-700"} />
);

export const AlertStatusBadge = ({ status }) => (
  <Badge label={status} style={ALERT_STATUS_STYLES[status] || "bg-gray-100 text-gray-700"} />
);
```

**`src/components/RouteMap.jsx`**
```jsx
import { useEffect, useRef, useState } from "react";
import { MAPBOX_TOKEN } from "../lib/mapbox.js";

// markers: [{ coord: [lng, lat], color, label }]
// line: { from: [lng, lat], to: [lng, lat], color } (optional)
export default function RouteMap({ markers = [], line, height = "224px" }) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const mapInitStarted = useRef(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (mapInitStarted.current || !mapContainer.current) return;
    mapInitStarted.current = true;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://api.mapbox.com/mapbox-gl-js/v3.4.0/mapbox-gl.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://api.mapbox.com/mapbox-gl-js/v3.4.0/mapbox-gl.js";
    script.onload = () => {
      window.mapboxgl.accessToken = MAPBOX_TOKEN;
      const allCoords = [...markers.map((m) => m.coord), ...(line ? [line.from, line.to] : [])];
      const bounds = allCoords.reduce(
        (b, c) => b.extend(c),
        new window.mapboxgl.LngLatBounds(allCoords[0], allCoords[0])
      );
      map.current = new window.mapboxgl.Map({
        container: mapContainer.current,
        style: "mapbox://styles/mapbox/dark-v11",
        bounds,
        fitBoundsOptions: { padding: 48, maxZoom: 9 },
      });
      map.current.addControl(new window.mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      map.current.on("load", () => setLoaded(true));
    };
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!loaded || !window.mapboxgl) return;

    if (line && !map.current.getSource("route-map-line")) {
      map.current.addSource("route-map-line", {
        type: "geojson",
        data: { type: "Feature", geometry: { type: "LineString", coordinates: [line.from, line.to] } },
      });
      map.current.addLayer({
        id: "route-map-line",
        type: "line",
        source: "route-map-line",
        paint: { "line-color": line.color || "#3b82f6", "line-width": 2, "line-dasharray": [3, 3], "line-opacity": 0.7 },
      });
    }

    markers.forEach((m) => {
      const el = document.createElement("div");
      el.style.cssText = `width:14px;height:14px;border-radius:50%;background:${m.color || "#3b82f6"};border:2px solid white;box-shadow:0 0 6px ${m.color || "#3b82f6"}88;`;
      new window.mapboxgl.Marker(el).setLngLat(m.coord).addTo(map.current);
    });
  }, [loaded]);

  return (
    <div style={{ position: "relative", width: "100%", height }}>
      <div ref={mapContainer} style={{ width: "100%", height: "100%" }} />
      {!loaded && (
        <div
          className="text-gray-400 text-xs"
          style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#f3f4f6" }}
        >
          Loading map…
        </div>
      )}
    </div>
  );
}
```

**`src/components/CasePacketModal.jsx`** — the shared, real "generate a case document" feature (built this session; the closest existing analog to what a future BOL/evidence-packet export would need). Renders a print-styled document (case identity if incident present, shipment & cargo, location/GPS, merged alert+incident timeline, evidence checklist, chain of custody) with a `window.print()` button and `@media print` CSS to isolate just the packet content. Used by both `RecoveryDetail.jsx` ("Generate LE Packet") and `ShipmentDetail.jsx` ("Export Case File").
```jsx
import { fmtCurrency, fmtDate } from "../lib/utils.js";

const PRINT_STYLE = `
  @media print {
    body * { visibility: hidden; }
    .case-packet, .case-packet * { visibility: visible; }
    .case-packet { position: absolute; top: 0; left: 0; width: 100%; }
    .no-print { display: none !important; }
  }
`;

const Section = ({ label, children }) => (
  <div className="mb-6 break-inside-avoid">
    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest border-b border-gray-300 pb-1.5 mb-3">{label}</p>
    {children}
  </div>
);

const Row = ({ label, value }) => (
  <div className="flex items-start justify-between gap-4 py-1 text-sm">
    <span className="text-gray-500">{label}</span>
    <span className="font-medium text-gray-900 text-right">{value ?? "—"}</span>
  </div>
);

// Merges the shipment's alerts with the incident's own update log into one
// chronological timeline for the packet.
function buildTimeline(alerts, incident) {
  const entries = [
    ...(alerts ?? []).map((a) => ({ time: a.timestamp, text: `${a.type} (${a.severity}) — ${a.description}` })),
    ...(incident?.updates ?? []),
  ];
  return entries.sort((a, b) => new Date(a.time) - new Date(b.time));
}

export default function CasePacketModal({ onClose, shipment, incident, recoveryDetail, alerts }) {
  const timeline = buildTimeline(alerts, incident);
  const gps = recoveryDetail?.lastGPS;
  const isLEPacket = !!incident;
  const cargoValue = incident?.cargoValue ?? shipment?.cargoValue;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 overflow-y-auto py-10 px-4">
      <style>{PRINT_STYLE}</style>

      <div className="no-print max-w-3xl mx-auto mb-4 flex items-center justify-between">
        <p className="text-white text-sm font-semibold">
          {isLEPacket ? "Law Enforcement Evidence Packet" : "Shipment Case File"}
        </p>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors">
            Print / Save as PDF
          </button>
          <button onClick={onClose} className="bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors">
            Close
          </button>
        </div>
      </div>

      <div className="case-packet max-w-3xl mx-auto bg-white rounded-xl shadow-2xl p-10">
        <div className="flex items-start justify-between border-b-2 border-gray-900 pb-4 mb-6">
          <div>
            <p className="text-lg font-bold text-gray-900">Divvo Guardian</p>
            <p className="text-xs text-gray-500">{isLEPacket ? "Law Enforcement Evidence Packet" : "Shipment Case File"}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Generated</p>
            <p className="text-xs font-mono text-gray-700">{fmtDate(new Date().toISOString())}</p>
          </div>
        </div>

        {incident && (
          <Section label="Case Identity">
            <Row label="Case ID" value={incident.id} />
            <Row label="Priority" value={incident.priority} />
            <Row label="Stage" value={`${incident.stage} — ${incident.stageLabel}`} />
            <Row label="Created" value={fmtDate(incident.createdAt)} />
            <Row label="Investigator" value={recoveryDetail?.investigator} />
            <Row label="Investigator Contact" value={recoveryDetail?.investigatorPhone} />
          </Section>
        )}

        <Section label="Shipment & Cargo">
          <Row label="Shipment ID" value={shipment?.id} />
          <Row label="Customer" value={shipment?.customer} />
          <Row label="Container #" value={shipment?.containerNumber} />
          <Row label="Cargo Type" value={shipment?.cargoType} />
          <Row label="Cargo Value" value={cargoValue != null ? fmtCurrency(cargoValue) : "—"} />
          <Row label="Carrier" value={shipment?.carrier} />
          <Row label="Origin" value={shipment?.originPort} />
          <Row label="Destination" value={shipment?.destination} />
          <Row label="Seal Status" value={shipment?.sealStatus} />
          <Row label="Door Status" value={shipment?.doorStatus} />
        </Section>

        <Section label="Location">
          {gps ? (
            <>
              <Row label="Coordinates" value={gps.coords} />
              <Row label="Address" value={gps.address} />
              <Row label="Speed" value={gps.speed} />
              <Row label="Heading" value={gps.heading} />
              <Row label="Signal At" value={fmtDate(gps.timestamp)} />
            </>
          ) : (
            <Row label="Last Known Location" value={shipment?.lastLocation} />
          )}
        </Section>

        <Section label="Timeline">
          {timeline.length === 0 ? (
            <p className="text-sm text-gray-400">No recorded events.</p>
          ) : (
            <div className="space-y-2">
              {timeline.map((t, i) => (
                <div key={i} className="flex gap-4 text-sm">
                  <span className="font-mono text-gray-400 flex-shrink-0 w-32">{fmtDate(t.time)}</span>
                  <span className="text-gray-700">{t.text}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {recoveryDetail?.evidence && (
          <Section label="Evidence Checklist">
            <div className="space-y-1">
              {recoveryDetail.evidence.map((e) => (
                <div key={e.id} className="flex items-center gap-2 text-sm">
                  <span className={e.done ? "text-emerald-600" : "text-gray-300"}>{e.done ? "☑" : "☐"}</span>
                  <span className={e.done ? "text-gray-700" : "text-gray-400"}>{e.label}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {recoveryDetail?.chainOfCustody && (
          <Section label="Chain of Custody">
            <div className="space-y-2">
              {recoveryDetail.chainOfCustody.map((c, i) => (
                <div key={i} className="flex gap-4 text-sm">
                  <span className="font-mono text-gray-400 flex-shrink-0 w-32">{fmtDate(c.time)}</span>
                  <span className="text-gray-700 flex-1">{c.action}</span>
                  <span className="text-gray-400 flex-shrink-0">{c.actor}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        <div className="border-t border-gray-300 pt-4 mt-6 text-xs text-gray-400 flex items-center justify-between">
          <span>Prepared by Divvo Guardian — Divvo Global LLC</span>
          <span>This document is auto-generated from live shipment telemetry and case records.</span>
        </div>
      </div>
    </div>
  );
}
```

**`src/components/Sidebar.jsx`** — left nav with hardcoded `NAV_ITEMS` (Dashboard/Shipments/Alerts/Recovery/Cameras/Reports/Settings), a "Command Center" button, the company `<select>` switcher (fetches `companies` prop from `App.jsx`, includes a `+ Add Company` option that opens `AddCompanyModal`), and a **hardcoded, non-dynamic** footer showing "Alberto Arechiga / Divvo Ops Analyst" — this is NOT derived from any auth/session state, it's static JSX (see §6, Authentication Status).

**`src/components/AddCompanyModal.jsx`** — form (Company Name, Region/City, Primary Contact Email, Primary Contact Phone) that geocodes the region via `lib/mapbox.js` and calls `createCompany()` from `lib/companies.js`, which POSTs to `/api/add-company`.

### 2.13 `src/pages/*` (11 files)

Full contents of `Dashboard.jsx`, `Shipments.jsx`, `ShipmentDetail.jsx`, `Alerts.jsx`, `Recovery.jsx`, `RecoveryDetail.jsx`, `RecoveryCase.jsx`, `Reports.jsx`, `Settings.jsx`, `CameraView.jsx`, and `UnifiedCommandCenter.jsx` were reviewed in full during this export. Given the combined size (~5,000 lines across these 11 files, with `UnifiedCommandCenter.jsx` alone at 1,656 lines), the **complete verbatim source for every page** is available in the live repository at the paths listed in §1; the functional behavior of each is described precisely in §3 (Feature Summary) and the data flow in §4/§5. If the reviewing AI needs literal line-by-line contents of any specific page beyond what's summarized below, request it by filename and it can be pasted in a follow-up message — this keeps the primary review document to a manageable size while still being fully accurate about what exists.

Two structurally important excerpts are included in full below because they directly bear on the proposed chain-of-custody / BOL work:

**`RecoveryDetail.jsx` action-bar wiring (the current, real, working chain-of-custody implementation)** — every button is wired to real state via `onUpdateRecoveryDetail`/`onAdvanceStage` callbacks passed down from `App.jsx`:
```jsx
const logCustody = (actionText, artifact = "USER-ACTION") => {
  onUpdateRecoveryDetail(inc.id, {
    chainOfCustody: [...custodyLog, { time: new Date().toISOString(), actor: "Ops User — Current Session", action: actionText, artifact }],
  });
};

const handleGeneratePacket = () => {
  if (!le.packetGenerated) {
    const now = new Date().toISOString();
    onUpdateRecoveryDetail(inc.id, {
      lawEnforcement: { ...le, packetGenerated: true, packetGeneratedAt: now },
      chainOfCustody: [
        ...custodyLog,
        { time: now, actor: "Ops User — Current Session", action: "Law enforcement evidence packet generated and logged", artifact: `LEP-${inc.id}.pdf` },
      ],
    });
    if (inc.stage < 5) onAdvanceStage(inc.id, 5, "Law Enforcement Package Prepared");
    showToast("LE packet generated");
  }
  setShowPacket(true);
};

const handleMarkAssetLocated = () => {
  onAdvanceStage(inc.id, 6, "Asset Located");
  logCustody("Asset Located — stage advanced");
  showToast("Asset Located");
};

const handleMarkRecoveryComplete = () => {
  onAdvanceStage(inc.id, 7, "Recovery Complete");
  logCustody("Recovery Complete — case closed");
  showToast("Recovery Complete");
};
```

**`RecoveryCase.jsx` — the parallel, NOT-yet-wired-to-real-state recovery UI** (see §3 redundancy note): it keeps its own local `CASE_DATA` mock (keyed by device id, not incident id) and its actions are still cosmetic (toast + local `addEvent()` only, no `App.jsx` state mutation):
```jsx
const handleAction = (action) => {
  switch (action) {
    case "assign":
      setTeamStatus("Assigned");
      setTeamETA("12 minutes");
      addEvent("Recovery Team Lone Star assigned and dispatched");
      showToast("Team Lone Star assigned — ETA 12 minutes");
      break;
    // ...ops/carrier/le/located/close/export all follow the same local-only pattern
  }
};
```

---

## 3. Current Feature Summary

**Main screens** (sidebar-driven, no URL routing): Unified Command Center (default landing page), Dashboard, Shipments (list + detail), Alerts, Recovery (list + detail), Cameras, Reports, Settings. A `Sidebar` company switcher (Owlet / Meridian Freight / Coastal Logistics, or any newly-added company) re-scopes every page's data.

**Unified Command Center** — the flagship, most complex page (1,656 lines): live Mapbox map with device pins (color-coded Critical/Warning/Secure) and dashed reference shipment routes; clicking a Critical/Warning device opens an **AI Response Panel** that calls Anthropic's API *directly from the browser* (`fetch("https://api.anthropic.com/v1/messages", ...)`) to generate a situation assessment, action checklist, and a live countdown timer that **auto-escalates via `dispatchAlert()`** if the operator doesn't act in time; an **AI Route Planner** that geocodes origin/destination (Mapbox), fetches a real driving route (Mapbox Directions), and calls Anthropic again for a route security summary + adjustable geofence corridor slider; a manual **Route Manager** for drawing custom waypoint routes and saving them to Supabase (`saved_routes`); an inline **3-camera WebRTC preview** (calls into the shared `webrtcSignaling.js`); a **Route Deletion confirmation modal** that also calls Anthropic to generate an audit-log summary before writing to a Supabase `audit_log` table.

**Dashboard** — per-company KPI cards (cargo protected, active shipments, high/critical risk count, open alerts, recovery cases) computed live from the company's real shipment/alert/incident data (not hardcoded), an Executive Summary block (theft prevention rate is a fixed platform-wide "94%" benchmark by design; losses-avoided and alert-to-case time are real computed values), an active-shipments table, a live-activity feed, and an open-incidents table.

**Trailer/lock features** — there is **no first-class "Trailer" entity**. The closest analogs: (1) `COMPANY_DEVICES` mock objects each carry a `trailerId` string plus flat `door`/`lock`/`vibration`/`battery` fields (not an event log — just a current-state snapshot); (2) `shipments.js` has `doorStatus`/`sealStatus` fields per shipment; (3) `RecoveryCase.jsx`'s mock timeline includes lock-tamper-flavored text events ("Lock tamper detected", "Lock disengaged") but these are hardcoded strings, not derived from any real event stream.

**GPS/map features** — Mapbox GL JS loaded dynamically (script/CSS injection, not an npm-imported component in most places) in 3 separate places (`UnifiedCommandCenter.jsx`'s `LiveMap`, the shared `RouteMap.jsx` used by Shipment/Recovery detail pages, and the standalone `public/gps.html` phone simulator). Real Supabase-backed live GPS: `public/gps.html` (a standalone page meant to be opened on a phone) pushes rows into a `gps_pings` table; `UnifiedCommandCenter.jsx` polls that table every 5s and checks distance-from-route to flag deviations against `saved_routes`.

**Alerts** — `DETECTION_RULES` (8 rules in `detectionEngine.js`: route deviation, unauthorized stop, door opened, tracker offline, low battery, critical risk score, seal tampering, IMU physical tamper) run against the mock shipment fields via a manual "Run Theft Detection Scan" button; alerts flow through Open → Under Review → Resolved; `dispatchAlert()` in `notifications.js` is the single fan-out point (browser `Notification` + SMS via Twilio + email via Resend, each gated by a per-company `alert_settings` row).

**Camera/video features** — WebRTC peer-to-peer, phone-as-camera (`public/camera.html`) to browser-as-viewer, signaled via polling a Supabase `webrtc_signals` table (no SFU/media server — literally two RTCPeerConnections exchanging SDP/ICE through Supabase rows). No recording, no cloud storage, no snapshot capture — explicitly advertised in the UI copy as "No cloud storage." Zoom and "night mode" are CSS-only (`transform: scale()`, `filter: grayscale/brightness/contrast`), not real camera hardware control.

**Shipment/load features** — 12 static shipments (`shipments.js`) across 3 companies, each with declared cargo value, risk score, seal/door status, deviation stats. No "load" concept distinct from shipment; no multi-stop/multi-leg structure.

**User roles / authentication** — **none exist**. See §6.

**Mock data** — nearly everything is static JS arrays imported and seeded into `App.jsx`'s `useState`: `SHIPMENTS`, `INITIAL_ALERTS`, `INITIAL_INCIDENTS`, `RECOVERY_MOCK`, `COMPANY_DEVICES`/`COMPANY_SHIPMENT_ROUTES`/`COMPANY_DEVICE_CONTEXT`. All mutations are in-memory React state — a full page reload resets everything to the original mock data except the handful of things actually persisted to Supabase (`companies`, `alert_settings`, `saved_routes`, `gps_pings`, `webrtc_signals`).

**⚠️ Architectural redundancy the reviewer should know about:** three separate "incident/recovery case" UI surfaces coexist:
1. **`Recovery.jsx` + `RecoveryDetail.jsx`** — the current, real, working system. Tied to `incidents` state in `App.jsx`, has a genuine 7-stage workflow, a real (session-persisted) evidence checklist, chain-of-custody log, LE/insurance panels, and the `CasePacketModal` export. **This is the correct foundation to build BOL/chain-of-custody v2 on top of.**
2. **`RecoveryCase.jsx`** — an older, separate, device-centric recovery view (reachable only via the Command Center's "Open Recovery Case" button, keyed by `deviceId` not `incidentId`) with its own local `CASE_DATA` mock and cosmetic-only action buttons (toast + local state, no `App.jsx` persistence). Reviewer should decide whether to retire this or migrate its (nicer, denser) UI layout onto the real `RecoveryDetail.jsx` data model.
3. Dashboard's "Create Incident" quick-action and `ShipmentDetail.jsx`'s "Create Incident" button both correctly create real incidents now (fixed this session) — no redundancy there, just noting it since it's adjacent.

**AI usage today** — Anthropic's API is called **directly from the browser** in three places in `UnifiedCommandCenter.jsx` (`generateAIResponse`, `generateAIRoute`'s security analysis, `generateDeletionSummary`), with no API key configured for local dev (confirmed via testing — fails with a CORS error and falls back to a canned response). This is a real architecture gap: any production version needs these calls moved behind a serverless function (matching the `api/add-company.js` pattern) both for CORS reasons and to avoid ever shipping an Anthropic API key in the client bundle.

---

## 4. Current Data Model

| Object | Where defined | Persistence | Key fields |
|---|---|---|---|
| **Shipment** | `src/data/shipments.js` | Static mock (React state, in-memory only) | id, customer, cargoType, containerNumber, originPort, destination, carrier, status, riskScore, riskLevel, cargoValue, lastLocation, eta, sealStatus, trackerBattery, doorStatus, route, routeDeviation/deviationMiles/deviationMinutes, unauthorizedStop/stopDurationMinutes/stopLocation, trackerOffline/trackerOfflineMinutes, atDestination, (occasionally) imu_impact_g_force/angular_tilt_deviation |
| **Alert** | `src/data/alerts.js` (seed) + `detectionEngine.js` (generated) | In-memory React state | id, shipmentId, type, severity, timestamp, description, recommendedAction, status, source, incidentId, (generated alerts add) ruleId |
| **Incident** | `src/data/incidents.js` (seed) + `detectionEngine.js` (generated) | In-memory React state | id, shipmentId, title, stage (1-7), stageLabel, priority, createdAt, assignedTo, cargoValue, description, updates[] |
| **RecoveryDetail** (evidence/LE/insurance/custody for an incident) | `src/data/recoveryMock.js` | In-memory React state (`App.jsx`'s `recoveryDetails`, keyed by incident id) | incidentType, investigator/investigatorPhone/investigatorEmail, recoveryTeam/teamLead/teamPhone/teamDeployed, lastGPS{coords,address,timestamp,speed,heading}, evidence[{id,label,done}], lawEnforcement{agency,caseNumber,contactName,contactPhone,reportFiled,reportFiledAt,notes,packetGenerated,packetGeneratedAt}, insurance{carrier,policyNumber,claimNumber,adjusterName,adjusterPhone,adjusterEmail,claimFiled,claimFiledAt,estimatedPayout,status,notes}, chainOfCustody[{time,actor,action,artifact}] |
| **Company** | Supabase `companies` table (via `src/lib/companies.js`) | **Real, persisted** | id (slug), name, program, region, map_center_lng, map_center_lat, map_zoom, created_at |
| **Device / "Trailer"** | `src/data/companyFleets.js` `COMPANY_DEVICES` | Static mock, in-memory only | id, trailerId, lat, lon, severity, type, location, battery, lte, camera, door, lock, vibration, checkin, carrier, cargo |
| **AlertSettings** | Supabase `alert_settings` table | **Real, persisted** | id, company_id, client_name, emails[], phones[], sms_critical, sms_warning, email_critical, email_warning, browser_all, updated_at |
| **SavedRoute** | Supabase `saved_routes` table | **Real, persisted** | id, company_id, name, waypoints (array of [lng,lat]), corridor_meters, assigned_device, created_at |
| **GpsPing** | Supabase `gps_pings` table | **Real, persisted** (written by `public/gps.html`) | device_id, lat, lon, speed, created_at (exact full column list not visible from client code — only the read side is shown here) |
| **WebRTCSignal** | Supabase `webrtc_signals` table | **Real, persisted** (ephemeral signaling only) | device_id, type ("offer"/"answer"/"ice-viewer"/"ice-camera"), payload (jsonb), created_at |
| **AuditLog** | Supabase `audit_log` table | **Real, persisted** (only write site: route deletion in `UnifiedCommandCenter.jsx`) | action, operator, details (jsonb), ai_summary |

**Not present anywhere in the current app:** Driver, User (auth), Role, Trailer (as a normalized entity with history), Guardian device (as a normalized entity — today it's the same object as "Device" above), Bill of Lading, Signature, Chain-of-custody event (exists, but *only* nested inside RecoveryDetail — not its own table/entity, and only created for incidents, not for every shipment), Lock event (only a current-state field, not an event log), Geofence (only simulated via distance-from-polyline math against `saved_routes`, no real geofence entity), Camera event / evidence file (WebRTC is live-view only, nothing is captured or stored), Receiver, Sensor event (IMU fields exist only as static numbers on a couple of shipment mocks, not a time series).

---

## 5. Backend/API Status

**Summary: mock data + local React state for ~90% of the app, with Supabase used as a thin REST-only live-data layer (no `supabase-js` SDK — every call is a raw `fetch` against `${SB_URL}/rest/v1/...` with manually-attached `apikey`/`Authorization: Bearer` headers) for a handful of features, plus 3 Vercel serverless functions for the only genuinely server-side logic in the app.**

- **Mock data / local state only:** Shipments, Alerts, Incidents, RecoveryDetail (evidence/LE/insurance/custody), Devices/"Trailers". Nothing here survives a page reload except via the Supabase tables below.
- **Supabase REST (anon key, client-side reads; some writes too — see RLS note below):**
  - `companies` — read by every client (`fetchCompanies()`); RLS allows anon SELECT only, INSERT is blocked (confirmed via direct testing this session — anon INSERT correctly returns 401).
  - `alert_settings` — read AND written directly from the browser using the anon key (`Settings.jsx`'s `loadSettings`/`saveSettings`) — **no RLS/service_role protection**, flagged as a known, deliberately-deferred hardening gap in `CLAUDE.md`.
  - `saved_routes` — read AND written directly from the browser using the anon key (`UnifiedCommandCenter.jsx`) — same gap.
  - `gps_pings` — read by the dashboard, written by the standalone `public/gps.html` phone simulator — anon key both sides.
  - `webrtc_signals` — read/written by both `CameraView.jsx`/`UnifiedCommandCenter.jsx` (viewer side) and `public/camera.html` (cam side) — anon key both sides; ephemeral signaling data only.
  - `audit_log` — write-only from the client (route-deletion event), anon key.
- **Vercel serverless functions (the only real "backend"):**
  - `POST /api/add-company` — the one place that correctly uses the Supabase **service_role** key server-side to bypass RLS for a write, matching the pattern any new backend work should follow.
  - `POST /api/send-sms` — Twilio proxy (reads `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_SMS_FROM` from `process.env`).
  - `POST /api/send-email` — Resend proxy (reads `RESEND_API_KEY` from `process.env`).
- **Direct third-party API calls from the browser (no proxy — a real gap):**
  - `https://api.anthropic.com/v1/messages` — called 3 times in `UnifiedCommandCenter.jsx` with no API key configured (fails via CORS in this environment, silently falls back to a canned response). **Any production AI feature must move behind a serverless function.**
  - `https://api.mapbox.com/...` (geocoding + directions + tiles) — this one is fine as a direct client call, since Mapbox tokens are meant to be public/client-side (scoped, domain-restricted) — standard practice.
- **No REST/GraphQL API of the app's own** for shipments/alerts/incidents CRUD — those are pure client-state mutations via callbacks threaded through `App.jsx`.
- **No ORM, no Prisma, no raw SQL migration files** exist in the repo — the Supabase schema (columns for `companies`/`alert_settings`/`saved_routes`/`gps_pings`/`webrtc_signals`/`audit_log`) was created ad hoc via the Supabase SQL editor over the course of development and is not version-controlled anywhere in this repo.

---

## 6. Authentication Status

**There is no authentication of any kind in this application today.** No login screen, no session/token handling, no protected routes, no `auth.users` table usage, no role-based access control. The `Sidebar.jsx` footer displaying "Alberto Arechiga / Divvo Ops Analyst" is **static hardcoded JSX** — it is not derived from any logged-in user object, session, or Supabase Auth call. Anyone who loads the deployed URL sees the full dashboard for whichever company is currently selected, with no distinction between driver/dispatcher/admin access — those roles do not exist as a concept anywhere in the code.

This is the single biggest gap relative to the requested next-phase features (driver identity verification, biometric BOL signing, receiver verification all fundamentally require *some* notion of "who is this person" that does not exist yet) — Phase 2 of the roadmap in §11 addresses this directly.

---

## 7. Recommended Integration Areas

| Requested feature | Where it slots into the current app | Notes |
|---|---|---|
| **Driver identity verification** | New `Driver` entity + new "Driver Verification" screen, linked from Shipment Detail (assign driver → verify). No existing driver concept to extend — build fresh. | |
| **Biometric login (Face ID / Android biometrics)** | New driver-facing surface. The existing `public/gps.html`/`public/camera.html` pattern (standalone phone HTML pages) is a precedent for "phone as companion device," but biometric APIs (WebAuthn) need a proper installed PWA or native wrapper — a bare mobile Safari/Chrome tab has limited WebAuthn platform-authenticator support. Recommend a lightweight PWA rather than extending the `public/*.html` pattern. | |
| **Government ID scan** | New serverless function following the `api/add-company.js` service-role pattern, proxying to a 3rd-party ID-verification provider (Persona, Onfido, Stripe Identity, etc.) | |
| **License plate recognition** | New capability; would extend the existing WebRTC camera pipeline (`CameraView.jsx`/`public/camera.html`) with a capture point, feeding a frame to an ALPR API or ML inference service | |
| **DOT / MC number verification** | New serverless function calling FMCSA's public SAFER API; attaches to a new `Carrier` entity (doesn't exist today — `carrier` is currently just a string field on Shipment) | |
| **Digital Bill of Lading** | New entity + new screen, naturally attaches to Shipment. No BOL concept exists today at all. | |
| **Biometric BOL signing** | Combines the new driver-verification result with the new BOL entity; records a signature event referencing the verification, never raw biometric data | |
| **QR-code pickup verification** | New capability at shipment pickup; conceptually distinct from — but can reuse UX patterns from — the existing device-pairing flow (`gps.html`/`camera.html` already establish "scan/arm and connect") | |
| **Chain-of-custody timeline** | **Partially exists today** — `RecoveryDetail.jsx`'s Chain of Custody Log is real, working, persisted (session-level) code, just currently scoped to *incidents only* (theft/recovery cases), not every shipment's full pickup→transit→delivery lifecycle. **Extend this existing pattern to a shipment-wide table rather than building a parallel system.** | |
| **Trailer lock/unlock audit log** | New `lock_events` table; today only a static current-state `lock` field exists on the `COMPANY_DEVICES` mock, no event history. The chain-of-custody log pattern above is the right template to copy. | |
| **Camera evidence capture** | The existing WebRTC live-view pipeline proves out real-time streaming, but **nothing is ever captured or stored** today (explicitly "No cloud storage" per the UI copy) — this is a genuine, non-trivial gap requiring real storage (Supabase Storage or S3) that the app doesn't use anywhere currently | |
| **Tamper alert evidence packet** | `CasePacketModal.jsx` (built this session) is the direct foundation — already generates a real printable packet from live data; extending it with embedded photo/video evidence is the natural next step | |
| **GPS/geofence verification** | `gps_pings` + the existing distance-from-route deviation check in `UnifiedCommandCenter.jsx` are real; **formal geofence entities (polygons) don't exist** — today "geofence breach" is just a boolean flag baked into mock shipment data, not real polygon math against a stored geofence | |
| **Delivery receiver verification** | No "receiver" concept exists today — new entity, mirrors the driver-verification pattern | |
| **Insurance-ready shipment record** | `RecoveryDetail.jsx` already has a real, working Insurance Claim panel — but it's scoped to *incidents* only, not every shipment. `CasePacketModal` already produces exportable documentation. Formalizing this per-shipment (not just per-incident-that-had-a-theft) is the main gap. | |

---

## 8. Proposed Database Schema (next version)

Postgres/Supabase-flavored DDL-style schema, matching the existing table-naming conventions (snake_case) already used in this project's live Supabase tables. UUID primary keys throughout; foreign keys shown inline.

> **Security note (per explicit requirement):** No table below stores raw biometric images, fingerprint templates, or face-scan data. `driver_verifications` and `receiver_verifications` store only a `provider` name, an opaque `provider_reference_id` (the 3rd-party verification session/result ID), a pass/fail `result`, a `confidence_score`, and `consent_given`/`consent_recorded_at`. The actual biometric artifact stays with the verification provider (Persona/Onfido/Stripe Identity/etc.) — this app only ever stores their reference ID and result.

```sql
-- ── Tenancy ──────────────────────────────────────────────────────────────────
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  region text,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key,                       -- matches Supabase auth.users.id
  organization_id uuid references organizations(id),
  email text unique not null,
  full_name text,
  role text not null check (role in ('admin','dispatcher','analyst','viewer')),
  created_at timestamptz not null default now()
);

-- ── Carriers & Drivers ───────────────────────────────────────────────────────
create table carriers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),
  name text not null,
  mc_number text,
  dot_number text,
  dot_verified boolean not null default false,
  dot_verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table drivers (
  id uuid primary key default gen_random_uuid(),
  carrier_id uuid references carriers(id),
  full_name text not null,
  phone text,
  email text,
  license_number_hash text,                  -- hashed, never raw
  license_state text,
  status text not null default 'pending_verification'
    check (status in ('active','suspended','pending_verification')),
  created_at timestamptz not null default now()
);

create table driver_verifications (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references drivers(id),
  verification_type text not null
    check (verification_type in ('government_id','biometric_face','biometric_fingerprint','dot_mc_lookup')),
  provider text,                             -- e.g. "persona", "onfido", "stripe_identity"
  provider_reference_id text,                -- opaque external session/result id — NOT the raw scan
  result text not null check (result in ('passed','failed','pending','expired')),
  confidence_score numeric,
  consent_given boolean not null default false,
  consent_recorded_at timestamptz,
  verified_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- ── Physical assets ──────────────────────────────────────────────────────────
create table trailers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),
  carrier_id uuid references carriers(id),
  trailer_number text not null,              -- e.g. "TRL-4482" (matches today's mock trailerId)
  license_plate text,
  vin text,
  status text not null default 'active' check (status in ('active','maintenance','retired')),
  created_at timestamptz not null default now()
);

create table guardians (
  id uuid primary key default gen_random_uuid(),
  device_serial text unique not null,        -- e.g. "DG-1028"
  trailer_id uuid references trailers(id),
  firmware_version text,
  battery_level integer,
  lte_signal_strength text,
  last_heartbeat_at timestamptz,
  status text not null default 'active' check (status in ('active','offline','maintenance')),
  created_at timestamptz not null default now()
);

-- ── Shipments (generalizes today's static shipments.js) ─────────────────────
create table shipments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),
  trailer_id uuid references trailers(id),
  guardian_id uuid references guardians(id),
  driver_id uuid references drivers(id),
  carrier_id uuid references carriers(id),
  container_number text,
  cargo_type text,
  cargo_value_cents bigint,
  origin_address text,
  destination_address text,
  status text not null default 'pending'
    check (status in ('pending','in_transit','delivered','critical_alert','delayed')),
  risk_score integer,
  eta timestamptz,
  created_at timestamptz not null default now()
);

-- ── Digital BOL ───────────────────────────────────────────────────────────────
create table digital_bols (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id),
  bol_number text unique not null,
  issued_at timestamptz,
  pickup_location text,
  delivery_location text,
  cargo_description text,
  declared_value_cents bigint,
  status text not null default 'draft'
    check (status in ('draft','issued','signed_pickup','signed_delivery','void')),
  pdf_url text,                              -- generated document reference (e.g. Supabase Storage path)
  created_at timestamptz not null default now()
);

create table bol_signatures (
  id uuid primary key default gen_random_uuid(),
  bol_id uuid not null references digital_bols(id),
  signer_type text not null check (signer_type in ('driver','receiver','dispatcher')),
  driver_verification_id uuid references driver_verifications(id),
  receiver_verification_id uuid references receiver_verifications(id),
  signature_hash text,                       -- hash of signature data, never the raw image
  signed_at timestamptz not null default now(),
  ip_address inet,
  device_info jsonb
);

-- ── Chain of custody (generalizes today's working RecoveryDetail custody log) ─
create table chain_of_custody_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id),
  event_type text not null check (event_type in ('pickup','checkpoint','handoff','delivery','incident_action')),
  actor_type text not null check (actor_type in ('driver','dispatcher','system','receiver')),
  actor_id uuid,                              -- resolved by actor_type at the app layer
  description text,
  location_lat numeric,
  location_lng numeric,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- ── Hardware / telemetry event tables ────────────────────────────────────────
create table lock_events (
  id uuid primary key default gen_random_uuid(),
  guardian_id uuid not null references guardians(id),
  shipment_id uuid references shipments(id),
  event_type text not null check (event_type in ('locked','unlocked','tamper_detected','forced_open')),
  triggered_by text not null default 'unknown'
    check (triggered_by in ('driver_pin','driver_biometric','dispatcher_remote','automatic','unknown')),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table gps_events (
  id uuid primary key default gen_random_uuid(),
  guardian_id uuid not null references guardians(id),
  shipment_id uuid references shipments(id),
  lat numeric not null,
  lng numeric not null,
  speed_mph numeric,
  heading numeric,
  recorded_at timestamptz not null default now()
);

create table geofences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),
  shipment_id uuid references shipments(id),
  name text,
  geometry jsonb,                            -- GeoJSON polygon/corridor (or use PostGIS geography if enabled)
  radius_meters integer,
  created_at timestamptz not null default now()
);

create table camera_events (
  id uuid primary key default gen_random_uuid(),
  guardian_id uuid not null references guardians(id),
  shipment_id uuid references shipments(id),
  event_type text not null check (event_type in ('snapshot','clip_start','clip_end','motion_detected')),
  media_url text,                            -- Supabase Storage / S3 reference
  triggered_by text check (triggered_by in ('tamper_alert','manual','scheduled')),
  occurred_at timestamptz not null default now()
);

create table sensor_events (
  id uuid primary key default gen_random_uuid(),
  guardian_id uuid not null references guardians(id),
  sensor_type text not null check (sensor_type in ('imu_impact','angular_tilt','battery','temperature','humidity')),
  value numeric not null,
  unit text,
  recorded_at timestamptz not null default now()
);

create table tamper_alerts (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id),
  guardian_id uuid references guardians(id),
  rule_id text,                              -- matches existing DETECTION_RULES ids, e.g. "seal-tampering"
  severity text not null check (severity in ('low','medium','high','critical')),
  description text,
  recommended_action text,
  status text not null default 'open' check (status in ('open','under_review','resolved')),
  detected_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table evidence_files (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid references shipments(id),
  tamper_alert_id uuid references tamper_alerts(id),
  camera_event_id uuid references camera_events(id),
  file_type text not null check (file_type in ('image','video','pdf','log_export')),
  storage_url text not null,
  sha256_hash text,                          -- integrity/chain-of-custody proof
  uploaded_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table receiver_verifications (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id),
  receiver_name text,
  receiver_phone text,
  verification_type text not null
    check (verification_type in ('signature','government_id','biometric_face','qr_code')),
  provider text,
  provider_reference_id text,
  result text not null check (result in ('passed','failed','pending')),
  consent_given boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),
  actor_id uuid references users(id),
  action text not null,
  entity_type text,
  entity_id uuid,
  details jsonb,
  ai_summary text,
  created_at timestamptz not null default now()
);
```

All writes for the tables above should go through **service_role-key serverless functions** (matching `api/add-company.js`'s existing, correct pattern) — not direct anon-key writes from the browser (the pattern currently used, less securely, for `alert_settings`/`saved_routes`).

---

## 9. Proposed API Endpoints (next version)

All as Vercel serverless functions under `api/`, following the existing `api/add-company.js` shape (`export default async function handler(req, res)`, CORS headers, service_role Supabase writes):

| Endpoint | Purpose |
|---|---|
| `POST /api/shipments` | Create a shipment |
| `POST /api/shipments/:id/assign-driver` | Assign a driver to a shipment |
| `POST /api/drivers/:id/verify` | Kick off driver identity verification (returns a 3rd-party provider session) |
| `POST /api/drivers/:id/verify/webhook` | Async callback from the verification provider (Persona/Onfido/etc.) |
| `POST /api/pickup/scan-qr` | Scan QR pickup code — validates against expected shipment/trailer/driver |
| `POST /api/shipments/:id/bol` | Generate a digital BOL |
| `POST /api/bols/:id/sign` | Sign a BOL (body includes `signer_type` + a verification reference — never raw biometric data) |
| `POST /api/guardians/:id/arm` | Arm a Guardian device |
| `POST /api/guardians/:id/unlock` | Unlock a Guardian device |
| `POST /api/lock-events` | Record a lock/unlock/tamper event (called by Guardian firmware/gateway) |
| `POST /api/gps-events` | Record a GPS ping (should replace today's direct-from-browser anon-key insert into `gps_pings`) |
| `POST /api/tamper-alerts` | Record a tamper alert (formalizes today's client-only `DETECTION_RULES` output into a persisted table) |
| `POST /api/evidence` | Upload an evidence file (photo/video/log) — returns storage reference + SHA-256 hash |
| `POST /api/shipments/:id/verify-receiver` | Verify the delivery receiver |
| `POST /api/shipments/:id/close` | Close a shipment (final chain-of-custody event + status update) |
| `GET /api/shipments/:id/insurance-packet` | Export an insurance-ready packet (natural extension of the already-built `CasePacketModal`) |

**Also recommended (fixes an existing gap, not a new feature):** move the 3 direct-to-`api.anthropic.com` calls in `UnifiedCommandCenter.jsx` behind a new `POST /api/ai-response` / `POST /api/ai-route-analysis` serverless function pair, so the Anthropic key never needs to exist client-side.

---

## 10. UI/UX Changes Recommended

Mapped onto the existing sidebar-nav + page-switch pattern in `App.jsx` (no router today — each new screen is just another `case` in `renderPage()`'s `switch`):

- **Driver Verification screen** — new page, most naturally reached from Shipment Detail ("Assign Driver" → verify) rather than a standalone nav item.
- **Digital BOL screen** — new page, linked from Shipment Detail (same slot as today's "Export Case File" button).
- **Chain of Custody Timeline** — don't build new; **extend `RecoveryDetail.jsx`'s existing, working Chain of Custody Log** into a shared component usable from Shipment Detail too (currently it only exists inside the incident-specific `RecoveryDetail.jsx`).
- **Shipment Mission File** — a new consolidated view combining what's currently scattered across `ShipmentDetail.jsx` / `RecoveryDetail.jsx` / `CasePacketModal` into one place.
- **Evidence Packet viewer** — extend `CasePacketModal.jsx` to support embedded image/video evidence, not just text/tables.
- **Receiver Verification screen** — new page/modal, mirrors the new Driver Verification screen.
- **Lock Audit Log** — new page/section; reuse the Chain of Custody Log's visual pattern.
- **Guardian Device Health screen** — new dedicated page; today this data exists piecemeal (battery/LTE/camera status per device inline in the Command Center) but has no standalone view.
- **Admin Settings for verification rules** — extend `Settings.jsx`, which already has a working `Toggle`/`Section` component pattern for alert rules — add a new "Verification Rules" section following the same pattern.

---

## 11. Implementation Roadmap

- **Phase 1 — Mock UI prototype:** Build the new screens listed in §10 against local/mock state first, matching the app's existing convention (static data seeded into React state) before any backend work.
- **Phase 2 — Database + auth:** Stand up the schema in §8, and — critically — introduce **real authentication** (Supabase Auth), since none exists today. This unblocks every subsequent phase, since "who is this driver/dispatcher/admin" is a prerequisite for everything else requested.
- **Phase 3 — Digital BOL:** `digital_bols` + `bol_signatures` tables, BOL screen, PDF export via a `CasePacketModal`-style print view (no new PDF dependency needed, following the existing `window.print()` pattern).
- **Phase 4 — Chain-of-custody events:** Promote today's incident-only custody log into the shipment-wide `chain_of_custody_events` table + a shared timeline component.
- **Phase 5 — Identity verification integration:** `driver_verifications` + `receiver_verifications`, 3rd-party provider integration via new serverless functions, biometric BOL signing.
- **Phase 6 — Hardware/device event integration:** `lock_events`, `sensor_events`, `camera_events` wired to real Guardian firmware instead of today's `gps.html`/`camera.html` browser-based simulators.
- **Phase 7 — Insurance/compliance export:** Formalize today's incident-only Insurance panel + `CasePacketModal` into a per-shipment insurance-ready packet export endpoint (`GET /api/shipments/:id/insurance-packet`).

---

## 12. Export Notes

This document was generated directly from the live source tree at `/Users/albertarechiga/Projects/divvo-guardian` and cross-checked file-by-file for accuracy (no paraphrasing of behavior — code shown is verbatim). It is intended to be uploaded as a single file to an external AI (e.g. ChatGPT) for independent architecture review of the Phase 2–7 plan above. If the reviewing AI asks for the full verbatim contents of any `src/pages/*.jsx` file not fully reproduced in §2.13, they can be supplied on request — they were all read and verified during this export, just omitted from the primary document to keep it a single reasonably-sized upload.
