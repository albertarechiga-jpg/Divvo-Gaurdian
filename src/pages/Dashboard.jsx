import { SHIPMENTS } from "../data/shipments.js";
import { COMPANIES } from "../data/companyFleets.js";
import { fmtCurrency, fmtCurrencyCompact } from "../lib/utils.js";
import { RiskBadge, StatusBadge } from "../components/Badges.jsx";

const KpiCard = ({ label, value, sub, accent, icon }) => (
  <div className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col gap-3 min-w-0">
    <div className="flex items-start justify-between gap-2">
      <p className="min-w-0 text-xs font-semibold text-gray-400 uppercase tracking-wide leading-tight">{label}</p>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${accent}`}>{icon}</div>
    </div>
    <div>
      <p className="text-xl font-bold text-gray-900 leading-none">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1.5">{sub}</p>}
    </div>
  </div>
);

export default function Dashboard({ alerts: allAlerts, incidents: allIncidents, company = "owlet", onNav, onViewShipment }) {
  const companyInfo = COMPANIES.find(c => c.id === company) || COMPANIES[0];
  const companyShipments = SHIPMENTS.filter((s) => s.customer === companyInfo.name);
  const shipmentIds = new Set(companyShipments.map((s) => s.id));
  const alerts = allAlerts.filter((a) => shipmentIds.has(a.shipmentId));
  const incidents = allIncidents.filter((i) => shipmentIds.has(i.shipmentId));

  const totalValue = companyShipments.reduce((s, sh) => s + sh.cargoValue, 0);
  const activeRecoveries = incidents.filter((i) => i.stage < 7).length;
  const openAlerts = alerts.filter((a) => a.status === "Open").length;
  const criticalAlerts = alerts.filter((a) => a.severity === "Critical" && a.status === "Open").length;
  const highRisk = companyShipments.filter((s) => s.riskLevel === "High" || s.riskLevel === "Critical").length;
  const resolvedCases = incidents.filter((i) => i.stage === 7).length;

  const recentActivity = [
    ...alerts.slice(-5).reverse().map((a) => ({
      time: new Date(a.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      text: `${a.type} — ${a.shipmentId}`,
      type: a.severity === "Critical" ? "critical" : a.severity === "High" ? "high" : "alert",
    })),
    ...incidents.slice(-3).reverse().map((i) => ({
      time: new Date(i.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      text: `Case ${i.id} — ${i.stageLabel}`,
      type: "incident",
    })),
  ].sort((a, b) => b.time.localeCompare(a.time)).slice(0, 9);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Header */}
      <div className="bg-gray-950 px-8 pt-8 pb-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs font-bold text-blue-400 uppercase tracking-widest bg-blue-950/60 border border-blue-800/40 px-3 py-1 rounded-full">
                {companyInfo.name} · {companyInfo.program}
              </span>
              <span className="text-xs text-gray-600">·</span>
              <span className="text-xs text-gray-500">
                {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              </span>
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight leading-tight">
              Cargo Theft Prevention<br/>
              <span className="text-blue-400">&amp; Recovery Platform</span>
            </h1>
            <p className="text-gray-400 text-sm mt-2 max-w-xl leading-relaxed">
              Divvo Guardian monitors high-value shipments in real time — detecting threats, creating incident cases, and coordinating recovery operations for {companyInfo.name}'s national supply chain.
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="flex items-center gap-2 justify-end mb-1">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              <p className="text-emerald-400 text-xs font-semibold">Systems Operational</p>
            </div>
            <p className="text-gray-500 text-xs">Detection engine active</p>
            <p className="text-gray-500 text-xs">7 rules · {companyShipments.length} shipment{companyShipments.length === 1 ? "" : "s"} tracked</p>
          </div>
        </div>

        <div className="grid grid-cols-6 gap-3">
          <KpiCard label="Cargo Protected" value={fmtCurrencyCompact(totalValue)} sub={`Across ${companyShipments.length} active lane${companyShipments.length === 1 ? "" : "s"}`}
            accent="bg-blue-900/60"
            icon={<svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}
          />
          <KpiCard label="Active Shipments" value={companyShipments.length} sub="All carriers monitored"
            accent="bg-gray-800"
            icon={<svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>}
          />
          <KpiCard label="High/Critical Risk" value={highRisk} sub="Need active attention"
            accent="bg-orange-900/50"
            icon={<svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
          />
          <KpiCard label="Open Alerts" value={openAlerts} sub={`${criticalAlerts} critical`}
            accent="bg-red-900/50"
            icon={<svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>}
          />
          <KpiCard label="Recovery Cases" value={activeRecoveries} sub={`${resolvedCases} resolved`}
            accent="bg-blue-900/60"
            icon={<svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}
          />
          <div className="bg-blue-600 rounded-2xl p-5 flex flex-col gap-3 cursor-pointer hover:bg-blue-500 transition-colors" onClick={() => onNav("recovery")}>
            <p className="text-xs font-semibold text-blue-100 uppercase tracking-widest">Quick Action</p>
            <p className="text-lg font-bold text-white leading-tight">+ Create Incident</p>
            <p className="text-xs text-blue-200">Open a new recovery case</p>
          </div>
        </div>
      </div>

      <div className="p-8 space-y-6">
        {/* Critical alert banner */}
        {criticalAlerts > 0 && (() => {
          const criticalAlert = alerts.find((a) => a.severity === "Critical" && a.status === "Open");
          if (!criticalAlert) return null;
          return (
            <div className="bg-red-950/40 border border-red-800/50 rounded-2xl p-5">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-red-900/60 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-red-200">Critical: Suspected active cargo theft — {criticalAlert.shipmentId}</p>
                  <p className="text-xs text-red-400 mt-0.5">{criticalAlert.description}</p>
                </div>
                <button onClick={() => onViewShipment(criticalAlert.shipmentId)} className="bg-red-600 hover:bg-red-500 text-white text-xs font-semibold px-4 py-2 rounded-lg flex-shrink-0 transition-colors">
                  Open Case →
                </button>
              </div>
            </div>
          );
        })()}

        {/* Executive Summary */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Executive Summary</h2>
              <p className="text-xs text-gray-400 mt-0.5">Divvo Guardian — {companyInfo.name} Pilot · June 2026</p>
            </div>
            <button onClick={() => onNav("reports")} className="text-xs text-blue-600 hover:text-blue-700 font-semibold">Full Report →</button>
          </div>
          <div className="grid grid-cols-4 divide-x divide-gray-100">
            {[
              { label: "Theft Prevention Rate", value: "94%", detail: "3 of 4 critical events detected before cargo loss", color: "text-emerald-600" },
              { label: "Estimated Losses Avoided", value: "$2.8M", detail: "Based on cargo value of cases under active recovery", color: "text-blue-600" },
              { label: "Avg. Alert-to-Case Time", value: "16 min", detail: "From first alert trigger to incident case creation", color: "text-gray-900" },
              { label: "Detection Engine Coverage", value: "100%", detail: `All ${companyShipments.length} ${companyInfo.name} shipment${companyShipments.length === 1 ? "" : "s"} actively scanned — 7 rule types`, color: "text-gray-900" },
            ].map((s) => (
              <div key={s.label} className="px-6 py-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">{s.label}</p>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{s.detail}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-gray-900">Active Shipments</h2>
                <p className="text-xs text-gray-400 mt-0.5">{companyShipments.length} shipments · {companyInfo.name} portfolio</p>
              </div>
              <button onClick={() => onNav("shipments")} className="text-xs text-blue-600 hover:text-blue-700 font-semibold">View all →</button>
            </div>
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Shipment</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Route</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Risk</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {companyShipments.map((s) => (
                  <tr key={s.id} onClick={() => onViewShipment(s.id)} className="hover:bg-blue-50/40 cursor-pointer transition-colors group">
                    <td className="px-6 py-4">
                      <p className="font-mono text-xs font-bold text-blue-700 group-hover:text-blue-800">{s.id}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{s.carrier}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-xs text-gray-700 font-medium truncate max-w-40">{s.originPort.split("(")[0].trim()}</p>
                      <p className="text-xs text-gray-400">→ {s.destination.split(",")[0]}</p>
                    </td>
                    <td className="px-4 py-4"><StatusBadge status={s.status} /></td>
                    <td className="px-4 py-4"><RiskBadge level={s.riskLevel} /></td>
                    <td className="px-6 py-4 text-right">
                      <p className="text-xs font-bold text-gray-900">{fmtCurrencyCompact(s.cargoValue)}</p>
                    </td>
                  </tr>
                ))}
                {companyShipments.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <p className="text-sm font-medium text-gray-400">No shipments tracked for {companyInfo.name} yet</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-sm font-bold text-gray-900">Live Activity</h2>
              <p className="text-xs text-gray-400 mt-0.5">Real-time event feed</p>
            </div>
            <div className="divide-y divide-gray-50">
              {recentActivity.map((a, i) => (
                <div key={i} className="px-5 py-3 flex items-start gap-3">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                    a.type === "critical" ? "bg-red-500" : a.type === "high" ? "bg-orange-500" : a.type === "alert" ? "bg-amber-400" : a.type === "incident" ? "bg-blue-500" : "bg-emerald-400"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-700 leading-relaxed">{a.text}</p>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">{a.time}</p>
                  </div>
                </div>
              ))}
              {recentActivity.length === 0 && (
                <div className="px-5 py-10 text-center">
                  <p className="text-xs text-gray-400">No recent activity</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Open Incidents */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Open Incidents</h2>
              <p className="text-xs text-gray-400 mt-0.5">Cases requiring action</p>
            </div>
            <button onClick={() => onNav("recovery")} className="text-xs text-blue-600 hover:text-blue-700 font-semibold">All incidents →</button>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Incident</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Shipment</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Priority</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Stage</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Assigned</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Value at Risk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {incidents.filter((i) => i.stage < 7).map((inc) => (
                <tr key={inc.id} onClick={() => onNav("recovery")} className="hover:bg-blue-50/40 cursor-pointer transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-mono text-xs font-bold text-gray-700">{inc.id}</p>
                    <p className="text-xs text-gray-400 mt-0.5 max-w-xs truncate">{inc.title}</p>
                  </td>
                  <td className="px-4 py-4 font-mono text-xs font-semibold text-blue-700">{inc.shipmentId}</td>
                  <td className="px-4 py-4"><RiskBadge level={inc.priority} /></td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-0.5">
                        {Array.from({ length: 7 }).map((_, i) => (
                          <div key={i} className={`h-1 w-3 rounded-full ${i < inc.stage ? "bg-blue-500" : "bg-gray-200"}`} />
                        ))}
                      </div>
                      <p className="text-xs text-gray-500">{inc.stageLabel}</p>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-xs text-gray-600">{inc.assignedTo}</td>
                  <td className="px-6 py-4 text-right text-xs font-bold text-gray-900">{fmtCurrencyCompact(inc.cargoValue)}</td>
                </tr>
              ))}
              {incidents.filter((i) => i.stage < 7).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <p className="text-sm font-medium text-gray-400">No open incidents</p>
                    <p className="text-xs text-gray-300 mt-1">All cases resolved or no incidents created yet</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
