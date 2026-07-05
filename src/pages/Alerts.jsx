import { useState } from "react";
import { SHIPMENTS } from "../data/shipments.js";
import { COMPANIES } from "../data/companyFleets.js";
import { fmtCurrency, fmtDate, ALERT_STATUS_STYLES } from "../lib/utils.js";
import { Badge, SeverityBadge } from "../components/Badges.jsx";

function AlertDetailModal({ alert, onClose, onConvertToIncident, onUpdateStatus }) {
  const ship = SHIPMENTS.find((s) => s.id === alert.shipmentId);
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-xs text-gray-400">{alert.id}</span>
                <SeverityBadge s={alert.severity} />
                <Badge label={alert.status} style={ALERT_STATUS_STYLES[alert.status]} />
                {alert.source === "scan" && (
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-medium">Engine</span>
                )}
              </div>
              <h2 className="text-base font-bold text-gray-900">{alert.type}</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {alert.shipmentId} · {ship?.carrier} · {fmtDate(alert.timestamp)}
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl font-light leading-none">×</button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Detection Summary</p>
            <p className="text-sm text-gray-700 leading-relaxed">{alert.description}</p>
          </div>
          {alert.recommendedAction && (
            <div className={`rounded-lg p-4 ${alert.severity === "Critical" ? "bg-red-50 border border-red-100" : alert.severity === "High" ? "bg-orange-50 border border-orange-100" : "bg-amber-50 border border-amber-100"}`}>
              <p className={`text-xs font-semibold uppercase tracking-wide mb-1.5 ${alert.severity === "Critical" ? "text-red-700" : alert.severity === "High" ? "text-orange-700" : "text-amber-700"}`}>
                Recommended Action
              </p>
              <p className={`text-sm leading-relaxed ${alert.severity === "Critical" ? "text-red-800" : alert.severity === "High" ? "text-orange-800" : "text-amber-800"}`}>
                {alert.recommendedAction}
              </p>
            </div>
          )}
          {ship && (
            <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-2 gap-3">
              {[
                ["Cargo Value", fmtCurrency(ship.cargoValue)],
                ["Carrier", ship.carrier],
                ["Risk Score", `${ship.riskScore}/100`],
                ["Seal Status", ship.sealStatus],
              ].map(([k, v]) => (
                <div key={k}>
                  <p className="text-xs text-gray-400">{k}</p>
                  <p className="text-xs font-semibold text-gray-800">{v}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 pt-0 flex gap-2 flex-wrap">
          {alert.incidentId ? (
            <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-lg font-medium">
              ✓ Linked to {alert.incidentId}
            </span>
          ) : (
            <button onClick={() => onConvertToIncident(alert)} className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              Convert to Incident
            </button>
          )}
          {alert.status === "Open" && (
            <button onClick={() => onUpdateStatus(alert.id, "Under Review")} className="border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              Mark Under Review
            </button>
          )}
          {alert.status !== "Resolved" && (
            <button onClick={() => onUpdateStatus(alert.id, "Resolved")} className="border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              Mark Resolved
            </button>
          )}
          <button onClick={onClose} className="ml-auto border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AlertsPage({ alerts: allAlerts, company = "owlet", onScan, onViewShipment, onConvertToIncident, onUpdateAlertStatus, scanning }) {
  const [filter, setFilter] = useState("All");
  const [severityFilter, setSeverityFilter] = useState("All");
  const [selectedAlert, setSelectedAlert] = useState(null);
  const companyInfo = COMPANIES.find((c) => c.id === company) || COMPANIES[0];
  const companyShipmentIds = new Set(SHIPMENTS.filter((s) => s.customer === companyInfo.name).map((s) => s.id));
  const alerts = allAlerts.filter((a) => companyShipmentIds.has(a.shipmentId));
  const statuses = ["All", "Open", "Under Review", "Resolved"];
  const severities = ["All", "Critical", "High", "Medium"];

  const shown = alerts.filter((a) => {
    if (filter !== "All" && a.status !== filter) return false;
    if (severityFilter !== "All" && a.severity !== severityFilter) return false;
    return true;
  });

  const openCount = alerts.filter((a) => a.status === "Open").length;
  const engineCount = alerts.filter((a) => a.source === "scan").length;

  return (
    <div className="p-8 space-y-5">
      {selectedAlert && (
        <AlertDetailModal
          alert={selectedAlert}
          onClose={() => setSelectedAlert(null)}
          onConvertToIncident={(a) => { onConvertToIncident(a); setSelectedAlert(null); }}
          onUpdateStatus={(id, status) => { onUpdateAlertStatus(id, status); setSelectedAlert(null); }}
        />
      )}

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Alerts</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {openCount} open · {engineCount} from detection engine · {alerts.length} total
          </p>
        </div>
        <button
          onClick={onScan}
          disabled={scanning}
          className={`flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-lg border-2 transition-all ${
            scanning
              ? "border-purple-300 bg-purple-50 text-purple-400 cursor-not-allowed"
              : "border-purple-600 bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-200"
          }`}
        >
          {scanning ? <><span className="animate-spin">⟳</span> Scanning…</> : <>🔍 Run Theft Detection Scan</>}
        </button>
      </div>

      <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-purple-700 text-sm">⚙️</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-purple-900">Theft Detection Engine — 8 active rules</p>
            <p className="text-xs text-purple-700 mt-0.5">
              Route deviation · Unauthorized stop · Door open outside destination · Tracker offline · Low battery · Critical risk score · Seal tampering · IMU physical tamper
            </p>
          </div>
          <div className="ml-auto text-right flex-shrink-0">
            <p className="text-xs text-purple-500">Last scan</p>
            <p className="text-xs font-semibold text-purple-800">{new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</p>
          </div>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1">
          {statuses.map((s) => (
            <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1 rounded text-xs font-medium transition-colors ${filter === s ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}>{s}</button>
          ))}
        </div>
        <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1">
          {severities.map((s) => (
            <button key={s} onClick={() => setSeverityFilter(s)} className={`px-3 py-1 rounded text-xs font-medium transition-colors ${severityFilter === s ? "bg-gray-800 text-white" : "text-gray-600 hover:bg-gray-100"}`}>{s}</button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 uppercase tracking-wide bg-gray-50 border-b border-gray-200">
              <th className="text-left px-5 py-3">Alert ID</th>
              <th className="text-left px-4 py-3">Shipment</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-left px-4 py-3">Severity</th>
              <th className="text-left px-4 py-3">Source</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Time</th>
              <th className="text-left px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((a) => (
              <tr key={a.id} className={`border-b border-gray-100 transition-colors ${a.status === "Open" ? "bg-red-50/30 hover:bg-red-50" : "hover:bg-gray-50"}`}>
                <td className="px-5 py-3 font-mono text-xs text-gray-500">{a.id}</td>
                <td className="px-4 py-3 font-mono text-xs text-blue-700 font-medium">
                  <button onClick={() => onViewShipment(a.shipmentId)} className="hover:underline">{a.shipmentId}</button>
                </td>
                <td className="px-4 py-3 text-xs font-medium text-gray-800">{a.type}</td>
                <td className="px-4 py-3"><SeverityBadge s={a.severity} /></td>
                <td className="px-4 py-3">
                  {a.source === "scan"
                    ? <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-medium">Engine</span>
                    : <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium">Manual</span>
                  }
                </td>
                <td className="px-4 py-3"><Badge label={a.status} style={ALERT_STATUS_STYLES[a.status]} /></td>
                <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtDate(a.timestamp)}</td>
                <td className="px-5 py-3">
                  <div className="flex gap-1.5">
                    <button onClick={() => setSelectedAlert(a)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Review</button>
                    {!a.incidentId && a.status !== "Resolved" && (
                      <button onClick={() => onConvertToIncident(a)} className="text-xs text-red-600 hover:text-red-800 font-medium">→ Incident</button>
                    )}
                    {a.incidentId && <span className="text-xs text-emerald-600 font-medium">{a.incidentId}</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && (
          <div className="text-center py-10 text-gray-400 text-sm">No alerts match this filter</div>
        )}
      </div>
    </div>
  );
}
