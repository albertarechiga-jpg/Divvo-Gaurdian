import { SHIPMENTS } from "../data/shipments.js";
import { fmtCurrency, fmtDate, ALERT_STATUS_STYLES } from "../lib/utils.js";
import { Badge, RiskBadge, StatusBadge, SeverityBadge } from "../components/Badges.jsx";

export default function ShipmentDetail({ shipmentId, alerts, onBack, onCreateIncident }) {
  const s = SHIPMENTS.find((x) => x.id === shipmentId);
  if (!s) return null;
  const shipAlerts = alerts.filter((a) => a.shipmentId === shipmentId);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-700 text-sm">← Back</button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900 font-mono">{s.id}</h1>
            <StatusBadge status={s.status} />
            <RiskBadge level={s.riskLevel} />
          </div>
          <p className="text-gray-500 text-sm">{s.cargoType} · {s.customer} · {s.carrier}</p>
        </div>
        <div className="flex gap-2">
          <button className="border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            Export Case File
          </button>
          <button onClick={onCreateIncident} className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            Create Incident
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-1 bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 border-b border-gray-100 pb-3">Shipment Details</h2>
          {[
            ["Container", s.containerNumber],
            ["Origin", s.originPort],
            ["Destination", s.destination],
            ["ETA", fmtDate(s.eta)],
            ["Cargo Value", fmtCurrency(s.cargoValue)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between items-start gap-2">
              <span className="text-xs text-gray-400">{k}</span>
              <span className="text-xs font-medium text-gray-900 text-right">{v}</span>
            </div>
          ))}
        </div>

        <div className="col-span-1 bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900 border-b border-gray-100 pb-3">Live Tracker Status</h2>
          {[
            { label: "Last Known Location", value: s.lastLocation, highlight: false },
            { label: "Seal Status", value: s.sealStatus, highlight: s.sealStatus !== "Intact" },
            { label: "Door Status", value: s.doorStatus, highlight: s.doorStatus !== "Closed" },
            { label: "Battery", value: `${s.trackerBattery}%`, highlight: s.trackerBattery < 35 },
          ].map(({ label, value, highlight }) => (
            <div key={label} className="flex justify-between items-center">
              <span className="text-xs text-gray-400">{label}</span>
              <span className={`text-xs font-semibold ${highlight ? "text-red-600" : "text-gray-900"}`}>{value}</span>
            </div>
          ))}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-400">Risk Score</span>
              <span className="font-medium text-gray-700">{s.riskScore}/100</span>
            </div>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${s.riskScore > 80 ? "bg-red-500" : s.riskScore > 60 ? "bg-orange-400" : s.riskScore > 30 ? "bg-amber-400" : "bg-emerald-400"}`}
                style={{ width: `${s.riskScore}%` }}
              />
            </div>
          </div>
        </div>

        <div className="col-span-1 bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 border-b border-gray-100 pb-3">Route</h2>
          <p className="text-xs text-gray-600 mt-3 leading-relaxed">{s.route}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Live Map — Route Tracking</h2>
          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium">Map integration pending</span>
        </div>
        <div className="bg-gray-100 h-56 flex flex-col items-center justify-center gap-2">
          <div className="w-12 h-12 bg-gray-200 rounded-xl flex items-center justify-center text-2xl">🗺️</div>
          <p className="text-sm font-medium text-gray-500">Live GPS Tracking Map</p>
          <p className="text-xs text-gray-400 font-mono">{s.lastLocation}</p>
        </div>
      </div>

      {shipAlerts.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Alerts on this Shipment</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wide bg-gray-50 border-b border-gray-200">
                <th className="text-left px-5 py-3">ID</th>
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-left px-4 py-3">Severity</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-5 py-3">Description</th>
              </tr>
            </thead>
            <tbody>
              {shipAlerts.map((a) => (
                <tr key={a.id} className="border-b border-gray-100">
                  <td className="px-5 py-3 font-mono text-xs text-gray-500">{a.id}</td>
                  <td className="px-4 py-3 text-xs font-medium text-gray-800">{a.type}</td>
                  <td className="px-4 py-3"><SeverityBadge s={a.severity} /></td>
                  <td className="px-4 py-3"><Badge label={a.status} style={ALERT_STATUS_STYLES[a.status]} /></td>
                  <td className="px-5 py-3 text-xs text-gray-600">{a.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
