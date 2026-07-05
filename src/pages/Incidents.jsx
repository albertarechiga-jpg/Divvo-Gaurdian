import { fmtCurrencyCompact } from "../lib/utils.js";
import { RiskBadge } from "../components/Badges.jsx";

export default function IncidentsPage({ incidents, onViewIncident }) {
  return (
    <div className="p-8 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Incidents</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {incidents.filter((i) => i.stage < 7).length} active cases · {incidents.length} total
          </p>
        </div>
        <button className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          + Create Incident
        </button>
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
            <p className="text-sm font-semibold text-gray-400">No incidents yet</p>
            <p className="text-xs text-gray-300 mt-1">Incidents are created from alerts or manually from shipment detail pages</p>
          </div>
        )}
      </div>
    </div>
  );
}
