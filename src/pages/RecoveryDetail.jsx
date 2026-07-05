import { useState } from "react";
import { SHIPMENTS } from "../data/shipments.js";
import { RECOVERY_MOCK } from "../data/recoveryMock.js";
import { WORKFLOW_STAGES } from "../data/incidents.js";
import { fmtCurrency, fmtDate } from "../lib/utils.js";
import { RiskBadge } from "../components/Badges.jsx";

const SectionHeader = ({ label }) => (
  <div className="flex items-center gap-3 mb-4">
    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{label}</p>
    <div className="flex-1 h-px bg-gray-100" />
  </div>
);

const InfoRow = ({ label, value, danger }) => (
  <div className="flex items-start justify-between gap-4 py-2 border-b border-gray-50 last:border-0">
    <span className="text-xs text-gray-400 flex-shrink-0 w-36">{label}</span>
    <span className={`text-xs font-medium text-right leading-relaxed ${danger ? "text-red-600" : "text-gray-900"}`}>{value}</span>
  </div>
);

export default function RecoveryDetail({ incidentId, incidents, onBack }) {
  const inc = incidents.find((i) => i.id === incidentId);
  if (!inc) return null;
  const s = SHIPMENTS.find((x) => x.id === inc.shipmentId);
  const mock = RECOVERY_MOCK[inc.id] || RECOVERY_MOCK["INC-2026-0041"];

  const [evidence, setEvidence] = useState(mock.evidence);
  const [custodyLog, setCustodyLog] = useState(mock.chainOfCustody);
  const [leNotes, setLeNotes] = useState(mock.lawEnforcement.notes);
  const [insNotes, setInsNotes] = useState(mock.insurance.notes);
  const [editingLE, setEditingLE] = useState(false);
  const [editingIns, setEditingIns] = useState(false);
  const [actionToast, setActionToast] = useState(null);

  const toggleEvidence = (id) =>
    setEvidence((prev) => prev.map((e) => (e.id === id ? { ...e, done: !e.done } : e)));

  const fireAction = (label, custodyText) => {
    setActionToast(label);
    if (custodyText) {
      const now = new Date().toISOString();
      setCustodyLog((prev) => [
        ...prev,
        { time: now, actor: "Ops User — Current Session", action: custodyText, artifact: "USER-ACTION" },
      ]);
    }
    setTimeout(() => setActionToast(null), 2800);
  };

  const doneCount = evidence.filter((e) => e.done).length;
  const le = mock.lawEnforcement;
  const ins = mock.insurance;

  return (
    <div className="min-h-screen bg-gray-50">
      {actionToast && (
        <div className="fixed top-5 right-5 z-50 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-xl flex items-center gap-2">
          <span className="text-emerald-400">✓</span> {actionToast}
        </div>
      )}

      {/* Header */}
      <div className="bg-gray-900 text-white px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="text-gray-400 hover:text-white text-sm transition-colors">← Cases</button>
            <div className="w-px h-4 bg-gray-700" />
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full animate-pulse ${inc.stage < 7 ? "bg-red-400" : "bg-emerald-400"}`} />
              <span className="font-mono text-sm font-semibold text-gray-100">{inc.id}</span>
              <span className="text-gray-500 text-sm">·</span>
              <span className="text-gray-300 text-sm">{mock.incidentType}</span>
            </div>
            <RiskBadge level={inc.priority} />
          </div>
          <div className="flex items-center gap-2">
            {[
              { label: "Assign Investigator", custodyText: "Assign Investigator action triggered", cls: "bg-gray-800 hover:bg-gray-700 border border-gray-700" },
              { label: "Contact Carrier", custodyText: "Contact Carrier action triggered — carrier notified", cls: "bg-gray-800 hover:bg-gray-700 border border-gray-700" },
              { label: "Generate LE Packet", custodyText: "Law enforcement evidence packet generated and logged", cls: "bg-orange-600 hover:bg-orange-500" },
              { label: "Mark Asset Located", custodyText: "Asset Located — stage advanced", cls: "bg-blue-600 hover:bg-blue-500" },
              { label: "Mark Recovery Complete", custodyText: "Recovery Complete — case closed", cls: "bg-emerald-600 hover:bg-emerald-500" },
            ].map((btn) => (
              <button
                key={btn.label}
                onClick={() => fireAction(btn.label, btn.custodyText)}
                className={`text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${btn.cls}`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Workflow stepper */}
      <div className="bg-white border-b border-gray-200 px-8 py-5">
        <div className="flex items-start">
          {WORKFLOW_STAGES.map((stage, i) => {
            const active = i + 1 === inc.stage;
            const done = i + 1 < inc.stage;
            return (
              <div key={i} className="flex-1 relative">
                <div className="flex flex-col items-center">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold z-10 relative ${done ? "bg-blue-600 text-white" : active ? "bg-blue-50 border-2 border-blue-600 text-blue-700" : "bg-gray-100 text-gray-400"}`}>
                    {done ? "✓" : i + 1}
                  </div>
                  <p className={`text-xs text-center mt-2 leading-tight max-w-16 ${active ? "text-blue-700 font-semibold" : done ? "text-gray-600" : "text-gray-400"}`}>
                    {stage}
                  </p>
                </div>
                {i < WORKFLOW_STAGES.length - 1 && (
                  <div className={`absolute top-3.5 left-1/2 w-full h-0.5 -z-0 ${done ? "bg-blue-500" : "bg-gray-200"}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="p-8 space-y-6">
        {/* Row 1 */}
        <div className="grid grid-cols-3 gap-5">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <SectionHeader label="Case Identity" />
            <InfoRow label="Case ID" value={inc.id} />
            <InfoRow label="Customer" value="Owlet" />
            <InfoRow label="Incident Type" value={mock.incidentType} />
            <InfoRow label="Priority" value={inc.priority} danger={inc.priority === "Critical"} />
            <InfoRow label="Stage" value={`${inc.stage} — ${inc.stageLabel}`} />
            <InfoRow label="Created" value={fmtDate(inc.createdAt)} />
            <InfoRow label="Investigator" value={mock.investigator} />
            <InfoRow label="Investigator Email" value={mock.investigatorEmail} />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <SectionHeader label="Shipment & Cargo" />
            {s && (<>
              <InfoRow label="Shipment ID" value={s.id} />
              <InfoRow label="Container #" value={s.containerNumber} />
              <InfoRow label="Cargo Type" value={s.cargoType} />
              <InfoRow label="Cargo Value" value={fmtCurrency(inc.cargoValue)} />
              <InfoRow label="Carrier" value={s.carrier} />
              <InfoRow label="Origin" value={s.originPort.split("(")[0].trim()} />
              <InfoRow label="Destination" value={s.destination} />
              <InfoRow label="ETA" value={fmtDate(s.eta)} />
              <InfoRow label="Seal Status" value={s.sealStatus} danger={s.sealStatus !== "Intact"} />
              <InfoRow label="Door Status" value={s.doorStatus} danger={s.doorStatus !== "Closed"} />
            </>)}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <SectionHeader label="Last Known GPS Location" />
            <div className="bg-gray-900 rounded-lg p-4 mb-4">
              <p className="text-xs text-gray-400 mb-1">Coordinates</p>
              <p className="text-sm font-mono font-semibold text-emerald-400">{mock.lastGPS.coords}</p>
              <p className="text-xs text-gray-300 mt-2 leading-relaxed">{mock.lastGPS.address}</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-500">Speed</p>
                  <p className="text-xs text-gray-200 font-medium">{mock.lastGPS.speed}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Heading</p>
                  <p className="text-xs text-gray-200 font-medium">{mock.lastGPS.heading}</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-3">Signal at {fmtDate(mock.lastGPS.timestamp)}</p>
            </div>
            <div className="bg-gray-100 rounded-lg h-28 flex flex-col items-center justify-center gap-1.5">
              <span className="text-2xl">📍</span>
              <p className="text-xs font-medium text-gray-500">Map integration pending</p>
              <p className="text-xs text-gray-400">Last ping plotted</p>
            </div>
          </div>
        </div>

        {/* Row 2 */}
        <div className="grid grid-cols-2 gap-5">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <SectionHeader label="Recovery Team" />
            <div className="flex items-center gap-4 mb-4 pb-4 border-b border-gray-100">
              <div className="w-10 h-10 bg-blue-700 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-white text-sm font-bold">{mock.teamLead[0] || "?"}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{mock.recoveryTeam}</p>
                <p className="text-xs text-gray-500">Lead: {mock.teamLead}</p>
              </div>
              {mock.teamDeployed
                ? <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">Deployed</span>
                : <span className="ml-auto text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium">Pending</span>}
            </div>
            <InfoRow label="Team Phone" value={mock.teamPhone} />
            <InfoRow label="Deployed At" value={mock.teamDeployed ? fmtDate(mock.teamDeployed) : "Not yet deployed"} />
            <InfoRow label="Investigator" value={mock.investigator} />
            <InfoRow label="Phone" value={mock.investigatorPhone} />
            <InfoRow label="Email" value={mock.investigatorEmail} />
            <div className="mt-4 pt-4 border-t border-gray-100">
              <button onClick={() => fireAction("Recovery team assignment updated", "Recovery team assignment action triggered")} className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 px-4 rounded-lg transition-colors">
                Assign / Reassign Recovery Team
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <SectionHeader label="Evidence Checklist" />
              <span className="text-xs font-semibold text-gray-500 -mt-4">{doneCount}/{evidence.length} complete</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5 mb-4">
              <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${Math.round((doneCount / evidence.length) * 100)}%` }} />
            </div>
            <div className="space-y-2">
              {evidence.map((e) => (
                <label key={e.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${e.done ? "bg-emerald-50" : "hover:bg-gray-50"}`}>
                  <div onClick={() => toggleEvidence(e.id)} className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border transition-colors cursor-pointer ${e.done ? "bg-emerald-500 border-emerald-500" : "border-gray-300"}`}>
                    {e.done && <span className="text-white text-xs leading-none">✓</span>}
                  </div>
                  <span className={`text-xs leading-snug ${e.done ? "text-emerald-700 line-through decoration-emerald-400" : "text-gray-700"}`}>{e.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Row 3 */}
        <div className="grid grid-cols-2 gap-5">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-1">
              <SectionHeader label="Law Enforcement" />
              <div className="flex items-center gap-2 -mt-4">
                {le.reportFiled ? <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-medium">Report Filed</span> : <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-medium">Not Filed</span>}
                {le.packetGenerated ? <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">LE Packet Ready</span> : <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium">Packet Pending</span>}
              </div>
            </div>
            <InfoRow label="Agency" value={le.agency} />
            <InfoRow label="Case Number" value={le.caseNumber} />
            <InfoRow label="Contact" value={le.contactName} />
            <InfoRow label="Phone" value={le.contactPhone} />
            {le.reportFiled && <InfoRow label="Report Filed" value={fmtDate(le.reportFiledAt)} />}
            {le.packetGenerated && <InfoRow label="LE Packet Generated" value={fmtDate(le.packetGeneratedAt)} />}
            <div className="mt-4">
              <p className="text-xs text-gray-400 mb-2">Investigator Notes</p>
              {editingLE ? (
                <div>
                  <textarea className="w-full text-xs text-gray-700 border border-gray-200 rounded-lg p-3 leading-relaxed resize-none focus:outline-none focus:border-blue-400" rows={5} value={leNotes} onChange={(e) => setLeNotes(e.target.value)} />
                  <button onClick={() => setEditingLE(false)} className="mt-1 text-xs text-blue-600 hover:underline font-medium">Save</button>
                </div>
              ) : (
                <div className="bg-gray-50 rounded-lg p-3 group relative">
                  <p className="text-xs text-gray-600 leading-relaxed">{leNotes}</p>
                  <button onClick={() => setEditingLE(true)} className="absolute top-2 right-2 text-xs text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">Edit</button>
                </div>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={() => fireAction("LE packet generated", "Law enforcement evidence packet generated and logged")} className="flex-1 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold py-2 px-3 rounded-lg transition-colors">Generate LE Packet</button>
              <button onClick={() => fireAction("Law enforcement contacted", "Direct LE contact initiated")} className="flex-1 border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-medium py-2 px-3 rounded-lg transition-colors">Contact Agency</button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-1">
              <SectionHeader label="Insurance Claim" />
              <div className="-mt-4">
                {ins.claimFiled ? <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">{ins.status}</span> : <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-medium">{ins.status}</span>}
              </div>
            </div>
            <InfoRow label="Insurer" value={ins.carrier} />
            <InfoRow label="Policy #" value={ins.policyNumber} />
            <InfoRow label="Claim #" value={ins.claimNumber} />
            <InfoRow label="Adjuster" value={ins.adjusterName} />
            <InfoRow label="Adjuster Phone" value={ins.adjusterPhone} />
            <InfoRow label="Adjuster Email" value={ins.adjusterEmail} />
            {ins.claimFiled && <InfoRow label="Claim Filed" value={fmtDate(ins.claimFiledAt)} />}
            {ins.estimatedPayout && <InfoRow label="Est. Payout" value={fmtCurrency(ins.estimatedPayout)} />}
            <div className="mt-4">
              <p className="text-xs text-gray-400 mb-2">Claim Notes</p>
              {editingIns ? (
                <div>
                  <textarea className="w-full text-xs text-gray-700 border border-gray-200 rounded-lg p-3 leading-relaxed resize-none focus:outline-none focus:border-blue-400" rows={5} value={insNotes} onChange={(e) => setInsNotes(e.target.value)} />
                  <button onClick={() => setEditingIns(false)} className="mt-1 text-xs text-blue-600 hover:underline font-medium">Save</button>
                </div>
              ) : (
                <div className="bg-gray-50 rounded-lg p-3 group relative">
                  <p className="text-xs text-gray-600 leading-relaxed">{insNotes}</p>
                  <button onClick={() => setEditingIns(true)} className="absolute top-2 right-2 text-xs text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">Edit</button>
                </div>
              )}
            </div>
            <div className="mt-3">
              <button onClick={() => fireAction("Insurance adjuster contacted", "Insurance claim follow-up initiated")} className="w-full border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-medium py-2 px-3 rounded-lg transition-colors">Contact Adjuster</button>
            </div>
          </div>
        </div>

        {/* Chain of Custody */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <SectionHeader label="Chain of Custody Log" />
            <span className="text-xs text-gray-400 -mt-4">{custodyLog.length} entries · Tamper-evident log</span>
          </div>
          {custodyLog.map((entry, i) => (
            <div key={i} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${i === custodyLog.length - 1 ? "bg-blue-500" : "bg-gray-300"}`} />
                {i < custodyLog.length - 1 && <div className="w-px flex-1 bg-gray-100 mt-1" style={{ minHeight: "32px" }} />}
              </div>
              <div className="pb-4 flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs text-gray-700 font-medium">{entry.action}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{entry.actor}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-mono text-gray-400">{fmtDate(entry.time)}</p>
                    <p className="text-xs font-mono text-blue-600 mt-0.5">{entry.artifact}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Timeline */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <SectionHeader label="Incident Timeline" />
          {inc.updates.map((u, i) => (
            <div key={i} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 flex-shrink-0" />
                {i < inc.updates.length - 1 && <div className="w-px bg-gray-100 mt-1" style={{ minHeight: "32px" }} />}
              </div>
              <div className="pb-4">
                <p className="text-xs font-mono text-gray-400">{fmtDate(u.time)}</p>
                <p className="text-sm text-gray-700 mt-0.5">{u.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
