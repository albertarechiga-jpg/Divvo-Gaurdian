import { useState, useEffect } from "react";
import { fmtCurrency, fmtDate } from "../lib/utils.js";
import { fetchBolDetail } from "../lib/bol.js";

const PRINT_STYLE = `
  @media print {
    body * { visibility: hidden; }
    .bol-packet, .bol-packet * { visibility: visible; }
    .bol-packet { position: absolute; top: 0; left: 0; width: 100%; }
    .no-print { display: none !important; }
  }
`;

const STATUS_LABEL = {
  draft: "Draft",
  issued: "Issued",
  signed_pickup: "Awaiting Delivery",
  signed_delivery: "Delivered",
  void: "Void",
};

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

export default function BolPacketModal({ bolId, session, onClose }) {
  const [bol, setBol] = useState(undefined); // undefined = loading, null = not found

  useEffect(() => {
    fetchBolDetail(session.access_token, bolId).then(setBol);
  }, [bolId, session]);

  const pickupSig = bol?.bol_signatures?.find((s) => s.signer_type === "driver");
  const deliverySig = bol?.bol_signatures?.find((s) => s.signer_type === "receiver");
  const driver = bol?.missions?.drivers;
  const carrier = bol?.missions?.carriers;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 overflow-y-auto py-10 px-4">
      <style>{PRINT_STYLE}</style>

      <div className="no-print max-w-3xl mx-auto mb-4 flex items-center justify-between">
        <p className="text-white text-sm font-semibold">Digital Bill of Lading</p>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            disabled={!bol}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            Print / Save as PDF
          </button>
          <button onClick={onClose} className="bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors">
            Close
          </button>
        </div>
      </div>

      {bol === undefined && <p className="no-print text-center text-gray-400 text-sm">Loading…</p>}
      {bol === null && <p className="no-print text-center text-gray-400 text-sm">BOL not found.</p>}

      {bol && (
        <div className="bol-packet max-w-3xl mx-auto bg-white rounded-xl shadow-2xl p-10">
          <div className="flex items-start justify-between border-b-2 border-gray-900 pb-4 mb-6">
            <div>
              <p className="text-lg font-bold text-gray-900">Divvo Guardian</p>
              <p className="text-xs text-gray-500">Digital Bill of Lading</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm font-bold text-gray-900">{bol.bol_number}</p>
              <p className="text-xs text-gray-500">{STATUS_LABEL[bol.status] || bol.status}</p>
            </div>
          </div>

          <Section label="Shipment & Cargo">
            <Row label="Pickup Location" value={bol.pickup_location} />
            <Row label="Delivery Location" value={bol.delivery_location} />
            <Row label="Cargo Description" value={bol.cargo_description} />
            <Row label="Declared Value" value={bol.declared_value_cents != null ? fmtCurrency(bol.declared_value_cents / 100) : "—"} />
            <Row label="Issued" value={bol.issued_at ? fmtDate(bol.issued_at) : "—"} />
          </Section>

          <Section label="Carrier & Driver">
            <Row label="Carrier" value={carrier?.name} />
            <Row label="Driver" value={driver?.full_name} />
            <Row label="Driver Phone" value={driver?.phone} />
            <Row label="Driver Email" value={driver?.email} />
            <Row label="License State" value={driver?.license_state} />
          </Section>

          <Section label="Pickup — Driver Verification & Signature">
            {pickupSig ? (
              <>
                <Row label="Result" value={pickupSig.driver_verifications?.result} />
                <Row label="Provider" value={pickupSig.driver_verifications?.provider} />
                <Row label="Confidence Score" value={pickupSig.driver_verifications?.confidence_score} />
                <Row label="Consent Given" value={pickupSig.driver_verifications?.consent_given ? "Yes" : "No"} />
                <Row label="Verified At" value={pickupSig.driver_verifications?.verified_at ? fmtDate(pickupSig.driver_verifications.verified_at) : "—"} />
                <Row label="Signed At" value={fmtDate(pickupSig.signed_at)} />
                <Row label="Signature Hash" value={<span className="font-mono text-xs">{pickupSig.signature_hash?.slice(0, 24)}…</span>} />
              </>
            ) : (
              <p className="text-sm text-gray-400">Not yet signed.</p>
            )}
          </Section>

          <Section label="Delivery — Receiver Verification & Signature">
            {deliverySig ? (
              <>
                <Row label="Receiver Name" value={deliverySig.receiver_verifications?.receiver_name} />
                <Row label="Receiver Phone" value={deliverySig.receiver_verifications?.receiver_phone} />
                <Row label="Verification Type" value={deliverySig.receiver_verifications?.verification_type} />
                <Row label="Result" value={deliverySig.receiver_verifications?.result} />
                <Row label="Provider" value={deliverySig.receiver_verifications?.provider} />
                <Row label="Consent Given" value={deliverySig.receiver_verifications?.consent_given ? "Yes" : "No"} />
                <Row label="Verified At" value={deliverySig.receiver_verifications?.verified_at ? fmtDate(deliverySig.receiver_verifications.verified_at) : "—"} />
                <Row label="Signed At" value={fmtDate(deliverySig.signed_at)} />
                <Row label="Signature Hash" value={<span className="font-mono text-xs">{deliverySig.signature_hash?.slice(0, 24)}…</span>} />
              </>
            ) : (
              <p className="text-sm text-gray-400">Awaiting delivery.</p>
            )}
          </Section>

          <div className="border-t border-gray-300 pt-4 mt-6 text-xs text-gray-400 flex items-center justify-between">
            <span>Prepared by Divvo Guardian — Divvo Global LLC</span>
            <span>Identity verification is simulated for this pilot; signatures are recorded as cryptographic hashes, never raw images.</span>
          </div>
        </div>
      )}
    </div>
  );
}
