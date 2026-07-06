import { fmtCurrency, fmtDate } from "../lib/utils.js";

const PRINT_STYLE = `
  @media print {
    body * { visibility: hidden; }
    .case-packet, .case-packet * { visibility: visible; }
    .case-packet { position: absolute; top: 0; left: 0; width: 100%; }
    .no-print { display: none !important; }
  }
`;

const Section = ({ label, children }) => (
  <div className="mb-6 break-inside-avoid">
    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest border-b border-gray-300 pb-1.5 mb-3">{label}</p>
    {children}
  </div>
);

const Row = ({ label, value }) => (
  <div className="flex items-start justify-between gap-4 py-1 text-sm">
    <span className="text-gray-500">{label}</span>
    <span className="font-medium text-gray-900 text-right">{value ?? "—"}</span>
  </div>
);

// Merges the shipment's alerts with the incident's own update log into one
// chronological timeline for the packet.
function buildTimeline(alerts, incident) {
  const entries = [
    ...(alerts ?? []).map((a) => ({ time: a.timestamp, text: `${a.type} (${a.severity}) — ${a.description}` })),
    ...(incident?.updates ?? []),
  ];
  return entries.sort((a, b) => new Date(a.time) - new Date(b.time));
}

export default function CasePacketModal({ onClose, shipment, incident, recoveryDetail, alerts }) {
  const timeline = buildTimeline(alerts, incident);
  const gps = recoveryDetail?.lastGPS;
  const isLEPacket = !!incident;
  const cargoValue = incident?.cargoValue ?? shipment?.cargoValue;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 overflow-y-auto py-10 px-4">
      <style>{PRINT_STYLE}</style>

      <div className="no-print max-w-3xl mx-auto mb-4 flex items-center justify-between">
        <p className="text-white text-sm font-semibold">
          {isLEPacket ? "Law Enforcement Evidence Packet" : "Shipment Case File"}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            Print / Save as PDF
          </button>
          <button
            onClick={onClose}
            className="bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      <div className="case-packet max-w-3xl mx-auto bg-white rounded-xl shadow-2xl p-10">
        <div className="flex items-start justify-between border-b-2 border-gray-900 pb-4 mb-6">
          <div>
            <p className="text-lg font-bold text-gray-900">Divvo Guardian</p>
            <p className="text-xs text-gray-500">{isLEPacket ? "Law Enforcement Evidence Packet" : "Shipment Case File"}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Generated</p>
            <p className="text-xs font-mono text-gray-700">{fmtDate(new Date().toISOString())}</p>
          </div>
        </div>

        {incident && (
          <Section label="Case Identity">
            <Row label="Case ID" value={incident.id} />
            <Row label="Priority" value={incident.priority} />
            <Row label="Stage" value={`${incident.stage} — ${incident.stageLabel}`} />
            <Row label="Created" value={fmtDate(incident.createdAt)} />
            <Row label="Investigator" value={recoveryDetail?.investigator} />
            <Row label="Investigator Contact" value={recoveryDetail?.investigatorPhone} />
          </Section>
        )}

        <Section label="Shipment & Cargo">
          <Row label="Shipment ID" value={shipment?.id} />
          <Row label="Customer" value={shipment?.customer} />
          <Row label="Container #" value={shipment?.containerNumber} />
          <Row label="Cargo Type" value={shipment?.cargoType} />
          <Row label="Cargo Value" value={cargoValue != null ? fmtCurrency(cargoValue) : "—"} />
          <Row label="Carrier" value={shipment?.carrier} />
          <Row label="Origin" value={shipment?.originPort} />
          <Row label="Destination" value={shipment?.destination} />
          <Row label="Seal Status" value={shipment?.sealStatus} />
          <Row label="Door Status" value={shipment?.doorStatus} />
        </Section>

        <Section label="Location">
          {gps ? (
            <>
              <Row label="Coordinates" value={gps.coords} />
              <Row label="Address" value={gps.address} />
              <Row label="Speed" value={gps.speed} />
              <Row label="Heading" value={gps.heading} />
              <Row label="Signal At" value={fmtDate(gps.timestamp)} />
            </>
          ) : (
            <Row label="Last Known Location" value={shipment?.lastLocation} />
          )}
        </Section>

        <Section label="Timeline">
          {timeline.length === 0 ? (
            <p className="text-sm text-gray-400">No recorded events.</p>
          ) : (
            <div className="space-y-2">
              {timeline.map((t, i) => (
                <div key={i} className="flex gap-4 text-sm">
                  <span className="font-mono text-gray-400 flex-shrink-0 w-32">{fmtDate(t.time)}</span>
                  <span className="text-gray-700">{t.text}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {recoveryDetail?.evidence && (
          <Section label="Evidence Checklist">
            <div className="space-y-1">
              {recoveryDetail.evidence.map((e) => (
                <div key={e.id} className="flex items-center gap-2 text-sm">
                  <span className={e.done ? "text-emerald-600" : "text-gray-300"}>{e.done ? "☑" : "☐"}</span>
                  <span className={e.done ? "text-gray-700" : "text-gray-400"}>{e.label}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {recoveryDetail?.chainOfCustody && (
          <Section label="Chain of Custody">
            <div className="space-y-2">
              {recoveryDetail.chainOfCustody.map((c, i) => (
                <div key={i} className="flex gap-4 text-sm">
                  <span className="font-mono text-gray-400 flex-shrink-0 w-32">{fmtDate(c.time)}</span>
                  <span className="text-gray-700 flex-1">{c.action}</span>
                  <span className="text-gray-400 flex-shrink-0">{c.actor}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        <div className="border-t border-gray-300 pt-4 mt-6 text-xs text-gray-400 flex items-center justify-between">
          <span>Prepared by Divvo Guardian — Divvo Global LLC</span>
          <span>This document is auto-generated from live shipment telemetry and case records.</span>
        </div>
      </div>
    </div>
  );
}
