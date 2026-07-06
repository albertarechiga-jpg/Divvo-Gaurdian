import { SHIPMENTS } from "../data/shipments.js";
import { fmtCurrencyCompact } from "../lib/utils.js";
import { Badge, RiskBadge } from "../components/Badges.jsx";

const LANE_STATUS_STYLES = {
  "Active Threat": "bg-red-600 text-white",
  "Under Watch":   "bg-orange-500 text-white",
  "Monitoring":    "bg-amber-400 text-amber-900",
  "Clear":         "bg-emerald-100 text-emerald-700",
};

const RISK_RANK = { Critical: 4, High: 3, Medium: 2, Low: 1 };

export default function ReportsPage({ companyInfo, alerts: allAlerts = [], incidents: allIncidents = [] }) {
  const companyShipments = SHIPMENTS.filter((s) => s.customer === companyInfo.name);
  const shipmentIds = new Set(companyShipments.map((s) => s.id));
  const alerts = allAlerts.filter((a) => shipmentIds.has(a.shipmentId));
  const incidents = allIncidents.filter((i) => shipmentIds.has(i.shipmentId));

  const totalValue = companyShipments.reduce((s, sh) => s + sh.cargoValue, 0);
  const activeIncidents = incidents.filter((i) => i.stage < 7);
  const resolvedIncidents = incidents.filter((i) => i.stage === 7);
  const valueInRecovery = activeIncidents.reduce((s, i) => s + i.cargoValue, 0);
  const criticalAlerts = alerts.filter((a) => a.severity === "Critical").length;
  const highAlerts = alerts.filter((a) => a.severity === "High").length;
  const mediumAlerts = alerts.filter((a) => a.severity === "Medium").length;
  const criticalIncidents = incidents.filter((i) => i.priority === "Critical");

  // Avg response time: earliest alert on a shipment -> that incident's createdAt
  const responseTimes = incidents
    .map((inc) => {
      const related = alerts.filter((a) => a.shipmentId === inc.shipmentId);
      if (!related.length) return null;
      const earliest = related.reduce((min, a) => (new Date(a.timestamp) < new Date(min.timestamp) ? a : min));
      const minutes = (new Date(inc.createdAt) - new Date(earliest.timestamp)) / 60000;
      return minutes >= 0 ? minutes : null;
    })
    .filter((m) => m != null);
  const avgResponseMin = responseTimes.length
    ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
    : null;

  const highRiskLanes = companyShipments.map((s) => ({
    lane: s.route,
    incidents: incidents.filter((i) => i.shipmentId === s.id).length,
    avgRisk: s.riskScore,
    cargoValue: s.cargoValue,
    status: s.riskLevel === "Critical" ? "Active Threat" : s.riskLevel === "High" ? "Under Watch" : s.riskLevel === "Medium" ? "Monitoring" : "Clear",
  }));

  const carrierMap = {};
  companyShipments.forEach((s) => {
    const c = (carrierMap[s.carrier] ||= { carrier: s.carrier, shipments: 0, incidents: 0, alertsTotal: 0, riskLevel: "Low", onTimeCount: 0 });
    c.shipments += 1;
    c.incidents += incidents.filter((i) => i.shipmentId === s.id).length;
    c.alertsTotal += alerts.filter((a) => a.shipmentId === s.id).length;
    if (RISK_RANK[s.riskLevel] > RISK_RANK[c.riskLevel]) c.riskLevel = s.riskLevel;
    if (s.status === "On Schedule" || s.status === "In Transit") c.onTimeCount += 1;
  });
  const carrierRisk = Object.values(carrierMap).map((c) => ({
    ...c,
    onTimeRate: Math.round((c.onTimeCount / c.shipments) * 100) + "%",
  }));

  const docs = [
    { title: `${companyInfo.name} Portfolio — Full Summary`, desc: `All shipments, alerts, incidents, and recovery cases for the ${companyInfo.name} pilot program`, date: "Jun 19, 2026", type: "PDF" },
    ...criticalIncidents.map((i) => ({
      title: `${i.id} Law Enforcement Packet`,
      desc: `Evidence package for suspected cargo theft — ${i.shipmentId}`,
      date: "Jun 19, 2026",
      type: "PDF",
    })),
    { title: "Monthly Risk Report — June 2026", desc: "Risk score trends, alert frequency, threat pattern analysis, and carrier benchmarks", date: "Jun 15, 2026", type: "PDF" },
    { title: "Carrier Performance Benchmark", desc: `${carrierRisk.map((c) => c.carrier).join(", ")} — on-time rate, incident rate, alert frequency`, date: "Jun 1, 2026", type: "XLSX" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-8 py-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-blue-600 uppercase tracking-widest">Divvo Guardian</span>
              <span className="text-gray-300">·</span>
              <span className="text-xs text-gray-400">{companyInfo.name} Pilot Program</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Reports &amp; Analytics</h1>
            <p className="text-gray-400 text-sm mt-0.5">Operational intelligence for the {companyInfo.name} supply chain — June 2026</p>
          </div>
          <button className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors">
            Generate Report
          </button>
        </div>
      </div>

      <div className="p-8 space-y-8">
        {/* Top metrics */}
        <div>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Program Performance — Pilot Period</h2>
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Total Value Protected", value: fmtCurrencyCompact(totalValue), sub: `Declared cargo value across ${companyShipments.length} active shipment${companyShipments.length === 1 ? "" : "s"}`, icon: "🛡️", color: "border-blue-200 bg-blue-50/50" },
              { label: "Value Under Active Recovery", value: fmtCurrencyCompact(valueInRecovery), sub: `Based on cargo value of ${activeIncidents.length} active recovery case${activeIncidents.length === 1 ? "" : "s"}`, icon: "💰", color: "border-emerald-200 bg-emerald-50/50" },
              { label: "Incidents Opened", value: String(incidents.length), sub: `${activeIncidents.length} active · ${resolvedIncidents.length} resolved`, icon: "⚠️", color: "border-orange-200 bg-orange-50/40" },
              { label: "Theft Attempts Detected", value: criticalIncidents.length ? `${criticalIncidents.length} confirmed` : "0 confirmed", sub: criticalIncidents.length ? `${criticalIncidents[0].shipmentId} — active recovery in progress` : "No confirmed theft this period", icon: "🚨", color: "border-red-200 bg-red-50/40" },
            ].map((m) => (
              <div key={m.label} className={`bg-white rounded-2xl border p-5 ${m.color}`}>
                <div className="flex items-start justify-between mb-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{m.label}</p>
                  <span className="text-xl">{m.icon}</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{m.value}</p>
                <p className="text-xs text-gray-400 mt-2 leading-relaxed">{m.sub}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Alerts Generated", value: String(alerts.length), sub: `${criticalAlerts} Critical · ${highAlerts} High · ${mediumAlerts} Medium` },
            { label: "Theft Prevention Rate", value: "94%", sub: "Platform-wide benchmark across all pilots" },
            { label: "Recovery Cases Opened", value: String(incidents.length), sub: `${activeIncidents.length} active · ${resolvedIncidents.length} resolved` },
            { label: "Avg. Response Time", value: avgResponseMin != null ? `${avgResponseMin} min` : "—", sub: "Alert → Incident case creation" },
          ].map((m) => (
            <div key={m.label} className="bg-white rounded-2xl border border-gray-200 p-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">{m.label}</p>
              <p className="text-2xl font-bold text-gray-900">{m.value}</p>
              <p className="text-xs text-gray-400 mt-1.5">{m.sub}</p>
            </div>
          ))}
        </div>

        {/* High-risk lanes */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900">High-Risk Lane Analysis</h2>
            <p className="text-xs text-gray-400 mt-0.5">Cargo theft risk by route corridor — {companyInfo.name} pilot lanes</p>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Lane / Route</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Incidents</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Avg Risk Score</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Cargo Value</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Lane Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {highRiskLanes.map((l) => (
                <tr key={l.lane} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-6 py-4 text-sm font-semibold text-gray-800">{l.lane}</td>
                  <td className="px-4 py-4">
                    <span className={`text-sm font-bold ${l.incidents > 0 ? "text-red-600" : "text-gray-400"}`}>{l.incidents}</span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-gray-100 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full ${l.avgRisk >= 80 ? "bg-red-500" : l.avgRisk >= 60 ? "bg-orange-400" : l.avgRisk >= 30 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${l.avgRisk}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-gray-700">{l.avgRisk}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm font-semibold text-gray-800">{fmtCurrencyCompact(l.cargoValue)}</td>
                  <td className="px-4 py-4">
                    <Badge label={l.status} style={LANE_STATUS_STYLES[l.status] || "bg-gray-100 text-gray-600"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Carrier risk */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900">Carrier Risk Summary</h2>
            <p className="text-xs text-gray-400 mt-0.5">Incident and alert rates by carrier — {companyInfo.name} portfolio</p>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Carrier</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Shipments</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Incidents</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Alerts</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">On-Time Rate</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Risk Level</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {carrierRisk.map((c) => (
                <tr key={c.carrier} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-6 py-4 text-sm font-semibold text-gray-900">{c.carrier}</td>
                  <td className="px-4 py-4 text-sm text-gray-600">{c.shipments}</td>
                  <td className="px-4 py-4">
                    <span className={`text-sm font-bold ${c.incidents > 0 ? "text-red-600" : "text-emerald-600"}`}>{c.incidents}</span>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-600">{c.alertsTotal}</td>
                  <td className="px-4 py-4 text-sm font-semibold text-gray-800">{c.onTimeRate}</td>
                  <td className="px-4 py-4"><RiskBadge level={c.riskLevel} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Documents */}
        <div>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Downloadable Documents</h2>
          <div className="grid grid-cols-2 gap-4">
            {docs.map((r) => (
              <div key={r.title} className="bg-white rounded-2xl border border-gray-200 p-5 hover:border-blue-200 transition-colors group">
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold ${r.type === "PDF" ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"}`}>
                    {r.type}
                  </div>
                  <button className="text-xs text-blue-600 hover:text-blue-700 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                    Download →
                  </button>
                </div>
                <p className="text-sm font-bold text-gray-900">{r.title}</p>
                <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{r.desc}</p>
                <p className="text-xs text-gray-300 mt-3">Generated {r.date}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
