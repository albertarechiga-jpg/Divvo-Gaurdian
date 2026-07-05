import { COMPANIES } from "../data/companyFleets.js";
import { fmtCurrencyCompact } from "../lib/utils.js";
import { Badge, RiskBadge } from "../components/Badges.jsx";

const LANE_STATUS_STYLES = {
  "Active Threat": "bg-red-600 text-white",
  "Under Watch":   "bg-orange-500 text-white",
  "Monitoring":    "bg-amber-400 text-amber-900",
  "Clear":         "bg-emerald-100 text-emerald-700",
};

const HIGH_RISK_LANES = [
  { lane: "Savannah → Atlanta (I-16 W)", incidents: 3, avgRisk: 91, cargoValue: 3_100_000, status: "Active Threat" },
  { lane: "Houston → Los Angeles (I-10 W)", incidents: 2, avgRisk: 82, cargoValue: 2_400_000, status: "Under Watch" },
  { lane: "Long Beach → Phoenix (I-10 E)", incidents: 1, avgRisk: 61, cargoValue: 1_850_000, status: "Monitoring" },
  { lane: "Newark → Chicago (I-80 W)", incidents: 0, avgRisk: 18, cargoValue: 980_000, status: "Clear" },
];

const CARRIER_RISK = [
  { carrier: "Hapag-Lloyd", shipments: 1, incidents: 1, alertsTotal: 3, riskLevel: "Critical", onTimeRate: "62%" },
  { carrier: "Maersk Line", shipments: 1, incidents: 1, alertsTotal: 2, riskLevel: "High", onTimeRate: "78%" },
  { carrier: "COSCO Shipping", shipments: 1, incidents: 1, alertsTotal: 1, riskLevel: "Medium", onTimeRate: "84%" },
  { carrier: "Evergreen Marine", shipments: 1, incidents: 0, alertsTotal: 0, riskLevel: "Low", onTimeRate: "97%" },
];

const DOCS = [
  { title: "Owlet Portfolio — Full Summary", desc: "All shipments, alerts, incidents, and recovery cases for the Owlet pilot program", date: "Jun 19, 2026", type: "PDF" },
  { title: "INC-2026-0041 Law Enforcement Packet", desc: "Evidence package for BCSO case BCSO-2026-04419 — OWL-SAV-1003 cargo theft", date: "Jun 19, 2026", type: "PDF" },
  { title: "Monthly Risk Report — June 2026", desc: "Risk score trends, alert frequency, threat pattern analysis, and carrier benchmarks", date: "Jun 15, 2026", type: "PDF" },
  { title: "Carrier Performance Benchmark", desc: "Hapag-Lloyd, Maersk, COSCO, Evergreen — on-time rate, incident rate, alert frequency", date: "Jun 1, 2026", type: "XLSX" },
  { title: "Insurance Claims Package — Allianz AGCS", desc: "Supporting documentation for claim AGC-CLM-2026-30041 — estimated payout $2.8M", date: "Jun 19, 2026", type: "PDF" },
];

export default function ReportsPage({ company = "owlet" }) {
  const companyInfo = COMPANIES.find((c) => c.id === company) || COMPANIES[0];
  const hasReportData = company === "owlet"; // report content below is static Owlet pilot data, not yet computed per company

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

      {!hasReportData && (
        <div className="p-8">
          <div className="bg-white rounded-2xl border border-gray-200 py-16 text-center">
            <p className="text-sm font-semibold text-gray-400">No reports available for {companyInfo.name} yet</p>
            <p className="text-xs text-gray-300 mt-1">Reports generate once this pilot has shipment and alert history</p>
          </div>
        </div>
      )}

      {hasReportData && (
      <div className="p-8 space-y-8">
        {/* Top metrics */}
        <div>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Program Performance — Pilot Period</h2>
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Total Value Protected", value: "$8.33M", sub: "Declared cargo value across 4 active shipments", icon: "🛡️", color: "border-blue-200 bg-blue-50/50" },
              { label: "Estimated Losses Avoided", value: "$2.8M", sub: "Based on recovered cargo value for INC-2026-0041", icon: "💰", color: "border-emerald-200 bg-emerald-50/50" },
              { label: "Incidents Opened", value: "3", sub: "2 active · 1 resolved · 0 closed without action", icon: "⚠️", color: "border-orange-200 bg-orange-50/40" },
              { label: "Theft Attempts Detected", value: "1 confirmed", sub: "OWL-SAV-1003 — active recovery in progress", icon: "🚨", color: "border-red-200 bg-red-50/40" },
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
            { label: "Alerts Generated", value: "6", sub: "2 Critical · 2 High · 2 Medium" },
            { label: "Detection Engine Scans", value: "14", sub: "Across full Owlet portfolio" },
            { label: "Recovery Cases Opened", value: "2", sub: "1 active · 1 resolved" },
            { label: "Avg. Response Time", value: "16 min", sub: "Alert → Incident case creation" },
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
            <p className="text-xs text-gray-400 mt-0.5">Cargo theft risk by route corridor — Owlet pilot lanes</p>
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
              {HIGH_RISK_LANES.map((l) => (
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
            <p className="text-xs text-gray-400 mt-0.5">Incident and alert rates by carrier — Owlet portfolio</p>
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
              {CARRIER_RISK.map((c) => (
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
            {DOCS.map((r) => (
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
      )}
    </div>
  );
}
