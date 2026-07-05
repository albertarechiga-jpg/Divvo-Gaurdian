import { useState, useCallback, useEffect } from "react";
import { SHIPMENTS } from "./data/shipments.js";
import { INITIAL_ALERTS } from "./data/alerts.js";
import { INITIAL_INCIDENTS } from "./data/incidents.js";
import { COMPANIES } from "./data/companyFleets.js";
import { runTheftDetectionScan, createIncidentFromAlert } from "./lib/detectionEngine.js";
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
  const [company, setCompany]                     = useState(COMPANIES[0].id);

  const [alerts,    setAlerts]    = useState(INITIAL_ALERTS);
  const [incidents, setIncidents] = useState(INITIAL_INCIDENTS);
  const [scanning,  setScanning]  = useState(false);
  const [scanResults, setScanResults] = useState(null);

  const openAlerts = alerts.filter((a) => a.status === "Open").length;

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
      const newAlerts = runTheftDetectionScan(SHIPMENTS, alerts);
      setAlerts((prev) => [...prev, ...newAlerts]);
      setScanResults(newAlerts);
      setScanning(false);
    }, 1800);
  }, [alerts]);

  const handleConvertToIncident = useCallback((alert) => {
    const ship = SHIPMENTS.find((s) => s.id === alert.shipmentId);
    const { incident, incidentId } = createIncidentFromAlert(alert, ship);
    setIncidents((prev) => [incident, ...prev]);
    setAlerts((prev) =>
      prev.map((a) => (a.id === alert.id ? { ...a, incidentId, status: "Under Review" } : a))
    );
  }, []);

  const handleUpdateAlertStatus = useCallback((alertId, status) => {
    setAlerts((prev) => prev.map((a) => (a.id === alertId ? { ...a, status } : a)));
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
          onBack={() => handleNav("shipments")}
          onCreateIncident={() => handleNav("recovery")}
        />
      );

    if (page === "recovery-detail" && selectedIncident)
      return (
        <RecoveryDetail
          incidentId={selectedIncident}
          incidents={incidents}
          onBack={() => handleNav("recovery")}
        />
      );

    switch (page) {
      case "recovery-case":
        return <RecoveryCase onBack={() => handleNav("unified-command")} deviceId={selectedDevice} />;

      case "unified-command":
        return <UnifiedCommandCenter key={company} onNav={handleNav} company={company} />;

      case "dashboard":
        return (
          <Dashboard
            alerts={alerts}
            incidents={incidents}
            onNav={handleNav}
            onViewShipment={handleViewShipment}
          />
        );

      case "shipments":
        return <ShipmentsPage onViewShipment={handleViewShipment} />;

      case "alerts":
        return (
          <AlertsPage
            alerts={alerts}
            scanning={scanning}
            onScan={handleScan}
            onViewShipment={handleViewShipment}
            onConvertToIncident={handleConvertToIncident}
            onUpdateAlertStatus={handleUpdateAlertStatus}
          />
        );

      case "recovery":
        return <RecoveryPage incidents={incidents} onViewIncident={handleViewIncident} />;

      case "camera":
        return <CameraView />;

      case "reports":
        return <ReportsPage />;

      case "settings":
        return <SettingsPage />;

      default:
        return <UnifiedCommandCenter key={company} onNav={handleNav} company={company} />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 font-sans overflow-hidden">
      <Sidebar active={activeNav} onNav={handleNav} openAlerts={openAlerts} companies={COMPANIES} selectedCompany={company} onCompanyChange={setCompany} />
      <main className="flex-1 overflow-auto min-w-0">
        {renderPage()}
      </main>
      <ScanToast results={scanResults} onDismiss={() => setScanResults(null)} />
    </div>
  );
}
