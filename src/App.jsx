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
