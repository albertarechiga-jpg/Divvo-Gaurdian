import { SHIPMENTS } from "../data/shipments.js";
import { COMPANIES } from "../data/companyFleets.js";
import { fmtCurrencyCompact } from "../lib/utils.js";
import { RiskBadge } from "../components/Badges.jsx";

export default function RecoveryPage({ incidents: allIncidents, company = "owlet", onViewIncident }) {
  const companyInfo = COMPANIES.find((c) => c.id === company) || COMPANIES[0];
  const companyShipmentIds = new Set(SHIPMENTS.filter((s) => s.customer === companyInfo.name).map((s) => s.id));
  const incidents = allIncidents.filter((i) => companyShipmentIds.has(i.shipmentId));
  const active = incidents.filter((i) => i.stage < 7);
  const resolved = incidents.filter((i) => i.stage === 7);

  return (
    <div className="p-8 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Recovery Cases</h1>
        <p className="text-gray-500 text-sm mt-0.5">{active.length} active cases · {incidents.length} total</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-400 uppercase mb-1">Active Cases</p>
          <p className="text-3xl font-bold text-gray-900">{active.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-400 uppercase mb-1">Resolved Cases</p>
          <p className="text-3xl font-bold text-emerald-600">{resolved.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-400 uppercase mb-1">Value in Recovery</p>
          <p className="text-3xl font-bold text-gray-900">
            {fmtCurrencyCompact(active.reduce((s, i) => s + i.cargoValue, 0))}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {incidents.map((inc) => (
          <div
            key={inc.id}
            className="bg-white rounded-xl border border-gray-200 p-5 hover:border-blue-200 cursor-pointer transition-colors"
            onClick={() => onViewIncident(inc.id)}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs text-gray-400">{inc.id}</span>
                  <RiskBadge level={inc.priority} />
                  {inc.stage < 7
                    ? <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">Active</span>
                    : <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-medium">Resolved</span>
                  }
                </div>
                <p className="text-sm font-semibold text-gray-900">{inc.title}</p>
                <p className="text-xs text-gray-500 mt-1 line-clamp-1">{inc.description}</p>
                <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
                  <span>Shipment: <span className="text-blue-700 font-mono font-medium">{inc.shipmentId}</span></span>
                  <span>Value: <span className="text-gray-700 font-semibold">{fmtCurrencyCompact(inc.cargoValue)}</span></span>
                  <span>Assigned: {inc.assignedTo}</span>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-gray-400 mb-1">Stage {inc.stage} of 7</p>
                <p className="text-xs font-semibold text-gray-700">{inc.stageLabel}</p>
                <div className="flex gap-0.5 mt-2">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-1.5 w-6 rounded-full ${i < inc.stage ? (inc.stage === 7 ? "bg-emerald-500" : "bg-blue-500") : "bg-gray-200"}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}

        {incidents.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
            <p className="text-sm font-semibold text-gray-400">No recovery cases for {companyInfo.name} yet</p>
            <p className="text-xs text-gray-300 mt-1">Cases are created from alerts or manually from shipment detail pages</p>
          </div>
        )}
      </div>
    </div>
  );
}
