import { useState, useCallback, useEffect } from "react";
import { SHIPMENTS, addShipmentToMock } from "./data/shipments.js";
import { fetchLiveShipments } from "./lib/shipments.js";
import { INITIAL_ALERTS } from "./data/alerts.js";
import { INITIAL_INCIDENTS } from "./data/incidents.js";
import { RECOVERY_MOCK, buildDefaultRecoveryDetail, buildDefaultRecoveryDetailForDevice } from "./data/recoveryMock.js";
import { fetchCompanies } from "./lib/companies.js";
import { runTheftDetectionScan, createIncidentFromAlert, createIncidentForShipment, createIncidentForDevice, DEFAULT_THRESHOLDS } from "./lib/detectionEngine.js";
import { fetchAlertSettings } from "./lib/notifications.js";
import { getSession, onAuthStateChange, fetchCurrentUser, signOut } from "./lib/auth.js";
import Sidebar from "./components/Sidebar.jsx";

// Pages
import Login           from "./pages/Login.jsx";
import ResetPassword   from "./pages/ResetPassword.jsx";
import UnifiedCommandCenter   from "./pages/UnifiedCommandCenter.jsx";
import Dashboard       from "./pages/Dashboard.jsx";
import ShipmentsPage   from "./pages/Shipments.jsx";
import ShipmentDetail  from "./pages/ShipmentDetail.jsx";
import AlertsPage      from "./pages/Alerts.jsx";
import RecoveryPage    from "./pages/Recovery.jsx";
import RecoveryDetail  from "./pages/RecoveryDetail.jsx";
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
  const [session, setSession]         = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  const [page, setPage] = useState("unified-command");
  const [selectedShipment, setSelectedShipment]   = useState(null);
  const [selectedIncident, setSelectedIncident]   = useState(null);
  const [companies, setCompanies]                 = useState([]);
  const [companiesLoading, setCompaniesLoading]   = useState(true);
  // Bumped after SHIPMENTS is mutated (real shipments pushed in) so React
  // re-renders and every SHIPMENTS.filter(...)/find(...) call downstream
  // picks up the fuller array — SHIPMENTS itself is a shared, mutated-in-
  // place module export, not React state (see data/shipments.js).
  const [shipmentsTick, setShipmentsTick]         = useState(0);
  const [company, setCompany]                     = useState(null);

  const [alerts,    setAlerts]    = useState(INITIAL_ALERTS);
  const [incidents, setIncidents] = useState(INITIAL_INCIDENTS);
  const [recoveryDetails, setRecoveryDetails] = useState(() => ({ ...RECOVERY_MOCK }));
  // Maps a Command Center device id -> the incident created for it, so
  // repeat "Recovery Actions" clicks reuse the same case instead of
  // creating a duplicate incident every time.
  const [deviceIncidents, setDeviceIncidents] = useState({});
  const [scanning,  setScanning]  = useState(false);
  const [scanResults, setScanResults] = useState(null);

  // Auth gate — the whole app renders nothing but <Login/> until a real
  // Supabase session exists. Fires once with the current session, then again
  // on every login/logout/token-refresh.
  useEffect(() => {
    let active = true;
    // Fallback signal alongside the PASSWORD_RECOVERY auth event below: under
    // the PKCE flow the redirect lands with ?type=recovery (or #type=recovery)
    // before supabase-js finishes exchanging the code, so checking the URL
    // directly catches this reliably regardless of exact event timing/naming.
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (params.get("type") === "recovery" || hashParams.get("type") === "recovery") {
      setPasswordRecovery(true);
    }
    getSession().then((s) => {
      if (active) setSession(s);
    });
    const subscription = onAuthStateChange((s, event) => {
      setSession(s);
      if (!s) setCurrentUser(null);
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setAuthLoading(false);
      return;
    }
    setAuthLoading(true);
    fetchCurrentUser(session.access_token, session.user.id).then((user) => {
      setCurrentUser(user);
      setAuthLoading(false);
    });
  }, [session]);

  const handleLogout = useCallback(() => {
    signOut();
  }, []);

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

  // Real, persisted shipments (src/lib/shipments.js) get merged into the
  // mock SHIPMENTS array once on load — see addShipmentToMock's comment for
  // why a direct mutation instead of threading a second data source through
  // every consumer.
  useEffect(() => {
    fetchLiveShipments().then((rows) => {
      rows.forEach(addShipmentToMock);
      if (rows.length) setShipmentsTick((t) => t + 1);
    });
  }, []);

  const handleShipmentCreated = useCallback((shipment) => {
    addShipmentToMock(shipment);
    setShipmentsTick((t) => t + 1);
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

  const handleViewShipment = (id) => {
    setSelectedShipment(id);
    setPage("shipment-detail");
  };

  const handleViewIncident = (id) => {
    setSelectedIncident(id);
    setPage("recovery-detail");
  };

  // Bridges a Command Center device into the same incident/recoveryDetails
  // model everything else uses — creates an incident the first time a
  // device's "Recovery Actions" is clicked, reuses it on repeat clicks
  // (deviceIncidents map) instead of creating duplicates.
  const handleViewOrCreateDeviceIncident = useCallback((device) => {
    const existingId = deviceIncidents[device.id];
    if (existingId) {
      handleViewIncident(existingId);
      return;
    }
    const { incident, incidentId } = createIncidentForDevice(device);
    setIncidents((prev) => [incident, ...prev]);
    setRecoveryDetails((prev) => ({ ...prev, [incidentId]: buildDefaultRecoveryDetailForDevice(device) }));
    setDeviceIncidents((prev) => ({ ...prev, [device.id]: incidentId }));
    handleViewIncident(incidentId);
  }, [deviceIncidents]);

  // Listen for navigation events from child components
  useEffect(() => {
    const handler = (e) => {
      if (typeof e.detail === "object" && e.detail.page === "recovery-from-device" && e.detail.device) {
        handleViewOrCreateDeviceIncident(e.detail.device);
        return;
      }
      handleNav(e.detail);
    };
    window.addEventListener("divvo-nav", handler);
    return () => window.removeEventListener("divvo-nav", handler);
  }, [handleViewOrCreateDeviceIncident]);

  const handleScan = useCallback(() => {
    setScanning(true);
    setScanResults(null);
    fetchAlertSettings(company).then((settings) => {
      const thresholds = {
        route_deviation_miles: settings?.route_deviation_miles ?? DEFAULT_THRESHOLDS.route_deviation_miles,
        unauthorized_stop_minutes: settings?.unauthorized_stop_minutes ?? DEFAULT_THRESHOLDS.unauthorized_stop_minutes,
        low_battery_pct: settings?.low_battery_pct ?? DEFAULT_THRESHOLDS.low_battery_pct,
        critical_risk_score: settings?.critical_risk_score ?? DEFAULT_THRESHOLDS.critical_risk_score,
        imu_impact_g: settings?.imu_impact_g ?? DEFAULT_THRESHOLDS.imu_impact_g,
        angular_tilt_deg: settings?.angular_tilt_deg ?? DEFAULT_THRESHOLDS.angular_tilt_deg,
      };
      setTimeout(() => {
        const newAlerts = runTheftDetectionScan(companyShipments, alerts, thresholds);
        setAlerts((prev) => [...prev, ...newAlerts]);
        setScanResults(newAlerts);
        setScanning(false);
      }, 1800);
    });
  }, [alerts, companyShipments, company]);

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
          session={session}
          currentUser={currentUser}
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
          companyInfo={companyInfo}
          session={session}
        />
      );

    switch (page) {

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
        return (
          <ShipmentsPage
            companyInfo={companyInfo}
            onViewShipment={handleViewShipment}
            session={session}
            currentUser={currentUser}
            onShipmentCreated={handleShipmentCreated}
          />
        );

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
        return <SettingsPage companyInfo={companyInfo} session={session} currentUser={currentUser} />;

      default:
        return <UnifiedCommandCenter key={company} onNav={handleNav} companyInfo={companyInfo} />;
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-500 text-sm">
        Loading Divvo Guardian...
      </div>
    );
  }

  // Supabase issues a temporary session when the user follows a password
  // reset email link — intercept it here before falling through to the
  // normal dashboard, regardless of whether `session` is already set.
  if (passwordRecovery) {
    return <ResetPassword onDone={() => setPasswordRecovery(false)} />;
  }

  if (!session) {
    return <Login />;
  }

  if (!currentUser) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-950 text-gray-400 text-sm text-center px-6 gap-4">
        <p>Your login succeeded, but no user profile exists yet for this account.</p>
        <p className="text-gray-600 text-xs">Ask an admin to add you to the `users`/`user_roles` tables, then reload this page.</p>
        <button onClick={handleLogout} className="text-blue-400 hover:text-blue-300 text-xs font-semibold">
          ← Back to login
        </button>
      </div>
    );
  }

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
        currentUser={currentUser}
        onLogout={handleLogout}
      />
      <main className="flex-1 overflow-auto min-w-0">
        {renderPage()}
      </main>
      <ScanToast results={scanResults} onDismiss={() => setScanResults(null)} />
    </div>
  );
}
