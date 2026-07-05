import { useState } from "react";
import { SHIPMENTS } from "../data/shipments.js";
import { COMPANIES } from "../data/companyFleets.js";
import { fmtCurrencyCompact } from "../lib/utils.js";
import { RiskBadge, StatusBadge } from "../components/Badges.jsx";

export default function ShipmentsPage({ company = "owlet", onViewShipment }) {
  const [filter, setFilter] = useState("All");
  const companyInfo = COMPANIES.find((c) => c.id === company) || COMPANIES[0];
  const companyShipments = SHIPMENTS.filter((s) => s.customer === companyInfo.name);
  const carrierCount = new Set(companyShipments.map((s) => s.carrier)).size;
  const statuses = ["All", "On Schedule", "In Transit", "Delayed", "Critical Alert"];
  const shown = filter === "All" ? companyShipments : companyShipments.filter((s) => s.status === filter);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-8 py-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-blue-600 uppercase tracking-widest">Divvo Guardian</span>
              <span className="text-gray-300">·</span>
              <span className="text-xs text-gray-400">{companyInfo.name} Portfolio</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Shipments</h1>
            <p className="text-gray-400 text-sm mt-0.5">Tracking {companyShipments.length} active shipment{companyShipments.length === 1 ? "" : "s"} across {carrierCount} carrier{carrierCount === 1 ? "" : "s"}</p>
          </div>
          <button className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors">
            + Add Shipment
          </button>
        </div>
      </div>

      <div className="p-8 space-y-5">
        <div className="flex gap-2">
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                filter === s
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-white border border-gray-200 text-gray-600 hover:border-blue-200 hover:text-blue-700"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-200">
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Shipment ID</th>
                <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Cargo</th>
                <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Route</th>
                <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Carrier</th>
                <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Risk</th>
                <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Seal</th>
                <th className="text-right px-6 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shown.map((s) => (
                <tr
                  key={s.id}
                  className="hover:bg-blue-50/30 cursor-pointer transition-colors group"
                  onClick={() => onViewShipment(s.id)}
                >
                  <td className="px-6 py-4">
                    <p className="font-mono text-xs font-bold text-blue-700">{s.id}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{s.containerNumber}</p>
                  </td>
                  <td className="px-4 py-4 text-xs text-gray-700 font-medium">{s.cargoType}</td>
                  <td className="px-4 py-4">
                    <p className="text-xs text-gray-700 font-medium truncate max-w-36">{s.originPort.split("(")[0].trim()}</p>
                    <p className="text-xs text-gray-400">→ {s.destination.split(",")[0]}</p>
                  </td>
                  <td className="px-4 py-4 text-xs text-gray-600">{s.carrier}</td>
                  <td className="px-4 py-4"><StatusBadge status={s.status} /></td>
                  <td className="px-4 py-4"><RiskBadge level={s.riskLevel} /></td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${s.sealStatus === "Intact" ? "bg-emerald-500" : "bg-red-500"}`} />
                      <span className={`text-xs font-semibold ${s.sealStatus === "Intact" ? "text-emerald-700" : "text-red-600"}`}>
                        {s.sealStatus}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right text-xs font-bold text-gray-900">{fmtCurrencyCompact(s.cargoValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {shown.length === 0 && (
            <div className="py-16 text-center">
              <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-400">
                {companyShipments.length === 0 ? `No shipments tracked for ${companyInfo.name} yet` : "No shipments match this filter"}
              </p>
              <p className="text-xs text-gray-300 mt-1">
                {companyShipments.length === 0 ? "Check back once this pilot is active" : "Try selecting a different status above"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
