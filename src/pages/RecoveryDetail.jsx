import { useState } from "react";
import { SHIPMENTS } from "../data/shipments.js";
import { INVESTIGATOR_ROSTER } from "../data/recoveryMock.js";
import { WORKFLOW_STAGES } from "../data/incidents.js";
import { fmtCurrency, fmtDate } from "../lib/utils.js";
import { RiskBadge } from "../components/Badges.jsx";
import RouteMap from "../components/RouteMap.jsx";
import CasePacketModal from "../components/CasePacketModal.jsx";

// Parses "32.8407° N, 83.6324° W" -> [lng, lat]
function parseCoords(str) {
  const match = str?.match(/([\d.]+)°\s*([NS]),\s*([\d.]+)°\s*([EW])/);
  if (!match) return null;
  const [, lat, ns, lng, ew] = match;
  return [(ew === "W" ? -1 : 1) * parseFloat(lng), (ns === "S" ? -1 : 1) * parseFloat(lat)];
}

const SectionHeader = ({ label }) => (
  <div className="flex items-center gap-3 mb-4">
    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{label}</p>
    <div className="flex-1 h-px bg-gray-100" />
  </div>
);

const InfoRow = ({ label, value, danger }) => (
  <div className="flex items-start justify-between gap-4 py-2 border-b border-gray-50 last:border-0">
    <span className="text-xs text-gray-400 flex-shrink-0 w-28">{label}</span>
    <span className={`min-w-0 flex-1 text-xs font-medium text-right leading-relaxed break-words ${danger ? "text-red-600" : "text-gray-900"}`}>{value}</span>
  </div>
);

export default function RecoveryDetail({ incidentId, incidents, alerts, recoveryDetail, onUpdateRecoveryDetail, onAdvanceStage, onBack }) {
  const inc = incidents.find((i) => i.id === incidentId);
  if (!inc || !recoveryDetail) return null;
  const s = SHIPMENTS.find((x) => x.id === inc.shipmentId);
  const incAlerts = alerts.filter((a) => a.shipmentId === inc.shipmentId);
  const lastGPSCoord = parseCoords(recoveryDetail.lastGPS.coords);

  const [editingLE, setEditingLE] = useState(false);
  const [editingIns, setEditingIns] = useState(false);
  const [leNotes, setLeNotes] = useState(recoveryDetail.lawEnforcement.notes);
  const [insNotes, setInsNotes] = useState(recoveryDetail.insurance.notes);
  const [actionToast, setActionToast] = useState(null);
  const [showInvestigatorPicker, setShowInvestigatorPicker] = useState(false);
  const [showPacket, setShowPacket] = useState(false);

  const evidence = recoveryDetail.evidence;
  const custodyLog = recoveryDetail.chainOfCustody;
  const le = recoveryDetail.lawEnforcement;
  const ins = recoveryDetail.insurance;
  const doneCount = evidence.filter((e) => e.done).length;

  const showToast = (label) => {
    setActionToast(label);
    setTimeout(() => setActionToast(null), 2800);
  };

  const logCustody = (actionText, artifact = "USER-ACTION") => {
    onUpdateRecoveryDetail(inc.id, {
      chainOfCustody: [...custodyLog, { time: new Date().toISOString(), actor: "Ops User — Current Session", action: actionText, artifact }],
    });
  };

  const handleAssignInvestigator = (roster) => {
    onUpdateRecoveryDetail(inc.id, { investigator: roster.name, investigatorPhone: roster.phone, investigatorEmail: roster.email });
    logCustody(`Investigator assigned: ${roster.name}`);
    setShowInvestigatorPicker(false);
    showToast(`Investigator assigned: ${roster.name}`);
  };

  const handleGeneratePacket = () => {
    if (!le.packetGenerated) {
      const now = new Date().toISOString();
      onUpdateRecoveryDetail(inc.id, {
        lawEnforcement: { ...le, packetGenerated: true, packetGeneratedAt: now },
        chainOfCustody: [
          ...custodyLog,
          { time: now, actor: "Ops User — Current Session", action: "Law enforcement evidence packet generated and logged", artifact: `LEP-${inc.id}.pdf` },
        ],
      });
      if (inc.stage < 5) onAdvanceStage(inc.id, 5, "Law Enforcement Package Prepared");
      showToast("LE packet generated");
    }
    setShowPacket(true);
  };

  const handleMarkAssetLocated = () => {
    onAdvanceStage(inc.id, 6, "Asset Located");
    logCustody("Asset Located — stage advanced");
    showToast("Asset Located");
  };

  const handleMarkRecoveryComplete = () => {
    onAdvanceStage(inc.id, 7, "Recovery Complete");
    logCustody("Recovery Complete — case closed");
    showToast("Recovery Complete");
  };

  const toggleEvidence = (id) => {
    onUpdateRecoveryDetail(inc.id, { evidence: evidence.map((e) => (e.id === id ? { ...e, done: !e.done } : e)) });
  };

  const saveLeNotes = () => {
    onUpdateRecoveryDetail(inc.id, { lawEnforcement: { ...le, notes: leNotes } });
    setEditingLE(false);
  };

  const saveInsNotes = () => {
    onUpdateRecoveryDetail(inc.id, { insurance: { ...ins, notes: insNotes } });
    setEditingIns(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {actionToast && (
        <div className="fixed top-5 right-5 z-50 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-xl flex items-center gap-2">
          <span className="text-emerald-400">✓</span> {actionToast}
        </div>
      )}

      {showPacket && (
        <CasePacketModal
          onClose={() => setShowPacket(false)}
          shipment={s}
          incident={inc}
          recoveryDetail={recoveryDetail}
          alerts={incAlerts}
        />
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
              <span className="text-gray-300 text-sm">{recoveryDetail.incidentType}</span>
            </div>
            <RiskBadge level={inc.priority} />
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setShowInvestigatorPicker((v) => !v)}
                className="text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors bg-gray-800 hover:bg-gray-700 border border-gray-700"
              >
                Assign Investigator
              </button>
              {showInvestigatorPicker && (
                <div className="absolute right-0 mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-xl z-20 overflow-hidden">
                  {INVESTIGATOR_ROSTER.map((r) => (
                    <button
                      key={r.name}
                      onClick={() => handleAssignInvestigator(r)}
                      className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      {r.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => { logCustody("Contact Carrier action triggered — carrier notified"); showToast("Carrier contacted"); }}
              className="text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors bg-gray-800 hover:bg-gray-700 border border-gray-700"
            >
              Contact Carrier
            </button>
            <button
              onClick={handleGeneratePacket}
              className="text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors bg-orange-600 hover:bg-orange-500"
            >
              Generate LE Packet
            </button>
            {inc.stage < 6 && (
              <button
                onClick={handleMarkAssetLocated}
                className="text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors bg-blue-600 hover:bg-blue-500"
              >
                Mark Asset Located
              </button>
            )}
            {inc.stage < 7 && (
              <button
                onClick={handleMarkRecoveryComplete}
                className="text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors bg-emerald-600 hover:bg-emerald-500"
              >
                Mark Recovery Complete
              </button>
            )}
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <SectionHeader label="Case Identity" />
            <InfoRow label="Case ID" value={inc.id} />
            <InfoRow label="Customer" value={s?.customer || "—"} />
            <InfoRow label="Incident Type" value={recoveryDetail.incidentType} />
            <InfoRow label="Priority" value={inc.priority} danger={inc.priority === "Critical"} />
            <InfoRow label="Stage" value={`${inc.stage} — ${inc.stageLabel}`} />
            <InfoRow label="Created" value={fmtDate(inc.createdAt)} />
            <InfoRow label="Investigator" value={recoveryDetail.investigator} />
            <InfoRow label="Investigator Email" value={recoveryDetail.investigatorEmail} />
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
              <p className="text-sm font-mono font-semibold text-emerald-400">{recoveryDetail.lastGPS.coords}</p>
              <p className="text-xs text-gray-300 mt-2 leading-relaxed">{recoveryDetail.lastGPS.address}</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-500">Speed</p>
                  <p className="text-xs text-gray-200 font-medium">{recoveryDetail.lastGPS.speed}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Heading</p>
                  <p className="text-xs text-gray-200 font-medium">{recoveryDetail.lastGPS.heading}</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-3">Signal at {fmtDate(recoveryDetail.lastGPS.timestamp)}</p>
            </div>
            {lastGPSCoord ? (
              <div className="rounded-lg overflow-hidden">
                <RouteMap height="112px" markers={[{ coord: lastGPSCoord, color: "#ef4444" }]} />
              </div>
            ) : (
              <div className="bg-gray-100 rounded-lg h-28 flex flex-col items-center justify-center gap-1.5">
                <span className="text-2xl">📍</span>
                <p className="text-xs font-medium text-gray-500">Location unavailable</p>
              </div>
            )}
          </div>
        </div>

        {/* Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <SectionHeader label="Recovery Team" />
            <div className="flex items-center gap-4 mb-4 pb-4 border-b border-gray-100">
              <div className="w-10 h-10 bg-blue-700 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-white text-sm font-bold">{recoveryDetail.teamLead[0] || "?"}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{recoveryDetail.recoveryTeam}</p>
                <p className="text-xs text-gray-500">Lead: {recoveryDetail.teamLead}</p>
              </div>
              {recoveryDetail.teamDeployed
                ? <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">Deployed</span>
                : <span className="ml-auto text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium">Pending</span>}
            </div>
            <InfoRow label="Team Phone" value={recoveryDetail.teamPhone} />
            <InfoRow label="Deployed At" value={recoveryDetail.teamDeployed ? fmtDate(recoveryDetail.teamDeployed) : "Not yet deployed"} />
            <InfoRow label="Investigator" value={recoveryDetail.investigator} />
            <InfoRow label="Phone" value={recoveryDetail.investigatorPhone} />
            <InfoRow label="Email" value={recoveryDetail.investigatorEmail} />
            <div className="mt-4 pt-4 border-t border-gray-100">
              <button
                onClick={() => { logCustody("Recovery team assignment action triggered"); showToast("Recovery team assignment updated"); }}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 px-4 rounded-lg transition-colors"
              >
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
              <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${evidence.length ? Math.round((doneCount / evidence.length) * 100) : 0}%` }} />
            </div>
            {evidence.length === 0 && <p className="text-xs text-gray-400 mb-2">No evidence items yet.</p>}
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
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
                  <button onClick={saveLeNotes} className="mt-1 text-xs text-blue-600 hover:underline font-medium">Save</button>
                </div>
              ) : (
                <div className="bg-gray-50 rounded-lg p-3 group relative">
                  <p className="text-xs text-gray-600 leading-relaxed">{leNotes}</p>
                  <button onClick={() => setEditingLE(true)} className="absolute top-2 right-2 text-xs text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">Edit</button>
                </div>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={handleGeneratePacket} className="flex-1 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold py-2 px-3 rounded-lg transition-colors">Generate LE Packet</button>
              <button
                onClick={() => { logCustody("Direct LE contact initiated"); showToast("Law enforcement contacted"); }}
                className="flex-1 border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-medium py-2 px-3 rounded-lg transition-colors"
              >
                Contact Agency
              </button>
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
                  <button onClick={saveInsNotes} className="mt-1 text-xs text-blue-600 hover:underline font-medium">Save</button>
                </div>
              ) : (
                <div className="bg-gray-50 rounded-lg p-3 group relative">
                  <p className="text-xs text-gray-600 leading-relaxed">{insNotes}</p>
                  <button onClick={() => setEditingIns(true)} className="absolute top-2 right-2 text-xs text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">Edit</button>
                </div>
              )}
            </div>
            <div className="mt-3">
              <button
                onClick={() => { logCustody("Insurance claim follow-up initiated"); showToast("Insurance adjuster contacted"); }}
                className="w-full border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-medium py-2 px-3 rounded-lg transition-colors"
              >
                Contact Adjuster
              </button>
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
