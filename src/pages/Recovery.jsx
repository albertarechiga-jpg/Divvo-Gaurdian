import { fmtCurrencyCompact } from "../lib/utils.js";
import { RiskBadge } from "../components/Badges.jsx";

export default function RecoveryPage({ incidents, onViewIncident }) {
  const active = incidents.filter((i) => i.stage < 7);
  const resolved = incidents.filter((i) => i.stage === 7);

  return (
    <div className="p-8 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Recovery Cases</h1>
        <p className="text-gray-500 text-sm mt-0.5">{active.length} active recovery operations</p>
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
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs text-gray-400">{inc.id}</span>
                  <RiskBadge level={inc.priority} />
                </div>
                <p className="text-sm font-semibold text-gray-900">{inc.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Assigned: {inc.assignedTo} · {fmtCurrencyCompact(inc.cargoValue)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold text-blue-700 mb-1">{inc.stageLabel}</p>
                <div className="flex gap-0.5 mt-2">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-1.5 w-5 rounded-full ${i < inc.stage ? (inc.stage === 7 ? "bg-emerald-500" : "bg-blue-500") : "bg-gray-200"}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
