import { useState, useEffect, useCallback, useRef } from "react";
import { fmtCurrency, fmtDate } from "../lib/utils.js";
import { fetchBolDetail, fetchCustodyEvents, logCustodyEvent, fetchLockEvents, logLockEvent } from "../lib/bol.js";
import { captureEvidence, fetchEvidenceFiles, getEvidenceUrl } from "../lib/evidence.js";

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

const EVENT_TYPE_LABEL = {
  pickup: "Pickup",
  checkpoint: "Checkpoint",
  handoff: "Handoff",
  delivery: "Delivery",
  incident_action: "Incident Action",
};

// Manual entries only — pickup/delivery are logged automatically by the
// submit-bol / submit-bol-delivery endpoints, not offered here.
const MANUAL_EVENT_TYPES = ["checkpoint", "handoff", "incident_action"];

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

export default function BolPacketModal({ bolId, session, currentUser, onClose }) {
  const [bol, setBol] = useState(undefined); // undefined = loading, null = not found
  const [custodyEvents, setCustodyEvents] = useState([]);
  const [newEventType, setNewEventType] = useState("checkpoint");
  const [newEventDesc, setNewEventDesc] = useState("");
  const [loggingEvent, setLoggingEvent] = useState(false);
  const [custodyError, setCustodyError] = useState("");
  const [confirmingIncident, setConfirmingIncident] = useState(false);
  const [lockEvents, setLockEvents] = useState([]);
  const [loggingLock, setLoggingLock] = useState(false);
  const [lockError, setLockError] = useState("");
  const [pendingLockAction, setPendingLockAction] = useState(null); // null | "tamper_detected" | "forced_open"

  useEffect(() => {
    fetchBolDetail(session.access_token, bolId).then(setBol);
  }, [bolId, session]);

  const refreshCustody = useCallback((missionId) => {
    fetchCustodyEvents(session.access_token, missionId).then(setCustodyEvents);
  }, [session]);

  useEffect(() => {
    if (bol?.mission_id) refreshCustody(bol.mission_id);
  }, [bol?.mission_id, refreshCustody]);

  const guardianId = bol?.missions?.guardian_id;

  const refreshLockEvents = useCallback((gId) => {
    fetchLockEvents(session.access_token, gId).then(setLockEvents);
  }, [session]);

  useEffect(() => {
    if (guardianId) refreshLockEvents(guardianId);
  }, [guardianId, refreshLockEvents]);

  const doLogLockEvent = async (eventType) => {
    setLoggingLock(true);
    setLockError("");
    try {
      await logLockEvent(session.access_token, { missionId: bol.mission_id, eventType });
      setPendingLockAction(null);
      refreshLockEvents(guardianId);
    } catch (err) {
      setLockError(err.message || "Failed to log lock event");
    } finally {
      setLoggingLock(false);
    }
  };

  // Tamper/forced-open get the same confirm gate as Incident Action custody
  // entries — lock_events is append-only, and these represent a serious,
  // permanent claim rather than a routine remote lock/unlock.
  const handleLockAction = (eventType) => {
    if ((eventType === "tamper_detected" || eventType === "forced_open") && pendingLockAction !== eventType) {
      setPendingLockAction(eventType);
      return;
    }
    doLogLockEvent(eventType);
  };

  const [evidenceFiles, setEvidenceFiles] = useState([]);
  const [evidenceError, setEvidenceError] = useState("");
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [evidenceUrls, setEvidenceUrls] = useState({}); // id -> signed url
  const [loadingUrlFor, setLoadingUrlFor] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);

  const refreshEvidence = useCallback((missionId) => {
    fetchEvidenceFiles(session.access_token, missionId).then(setEvidenceFiles);
  }, [session]);

  useEffect(() => {
    if (bol?.mission_id) refreshEvidence(bol.mission_id);
  }, [bol?.mission_id, refreshEvidence]);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  };

  useEffect(() => () => stopCamera(), []);

  const startCamera = async () => {
    setCameraError(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraActive(true);
    } catch {
      setCameraError(true);
    }
  };

  const uploadImageDataUrl = async (imageDataUrl) => {
    setUploadingEvidence(true);
    setEvidenceError("");
    try {
      await captureEvidence(session.access_token, { missionId: bol.mission_id, imageDataUrl });
      refreshEvidence(bol.mission_id);
    } catch (err) {
      setEvidenceError(err.message || "Failed to capture evidence");
    } finally {
      setUploadingEvidence(false);
    }
  };

  const captureSnapshot = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    stopCamera();
    uploadImageDataUrl(canvas.toDataURL("image/jpeg", 0.85));
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => uploadImageDataUrl(reader.result);
    reader.readAsDataURL(file);
  };

  const handleViewEvidence = async (id) => {
    if (evidenceUrls[id]) {
      window.open(evidenceUrls[id], "_blank");
      return;
    }
    setLoadingUrlFor(id);
    try {
      const url = await getEvidenceUrl(session.access_token, id);
      setEvidenceUrls((prev) => ({ ...prev, [id]: url }));
      window.open(url, "_blank");
    } catch (err) {
      setEvidenceError(err.message || "Failed to load evidence");
    } finally {
      setLoadingUrlFor(null);
    }
  };

  const doLogEvent = async () => {
    setLoggingEvent(true);
    setCustodyError("");
    try {
      await logCustodyEvent(session.access_token, {
        missionId: bol.mission_id,
        actorUserId: currentUser.id,
        eventType: newEventType,
        description: newEventDesc.trim(),
      });
      setNewEventDesc("");
      setConfirmingIncident(false);
      refreshCustody(bol.mission_id);
    } catch (err) {
      setCustodyError(err.message || "Failed to log event");
    } finally {
      setLoggingEvent(false);
    }
  };

  // Incident Action entries get an extra confirm step before writing —
  // chain_of_custody_events is append-only (no edit/delete), and an incident
  // entry is a materially more serious, permanent claim than a routine
  // checkpoint/handoff, so it shouldn't go in on a single accidental click.
  const handleAddEvent = (e) => {
    e.preventDefault();
    if (!newEventDesc.trim()) return;
    if (newEventType === "incident_action" && !confirmingIncident) {
      setConfirmingIncident(true);
      return;
    }
    doLogEvent();
  };

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

          <Section label="Chain of Custody">
            {custodyEvents.length === 0 ? (
              <p className="text-sm text-gray-400">No custody events recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {custodyEvents.map((ev) => (
                  <div key={ev.id} className="flex gap-4 text-sm">
                    <span className="font-mono text-gray-400 flex-shrink-0 w-32">{fmtDate(ev.occurred_at)}</span>
                    <span className="text-gray-700 flex-1">
                      <span className="font-semibold">{EVENT_TYPE_LABEL[ev.event_type] || ev.event_type}</span> — {ev.description}
                    </span>
                    <span className="text-gray-400 flex-shrink-0 capitalize">{ev.actor_type}</span>
                  </div>
                ))}
              </div>
            )}

            {currentUser && (
              <form onSubmit={handleAddEvent} className="no-print mt-4 pt-4 border-t border-gray-200">
                <div className="flex gap-2 items-start">
                  <select
                    value={newEventType}
                    onChange={(e) => { setNewEventType(e.target.value); setConfirmingIncident(false); }}
                    disabled={confirmingIncident}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs text-gray-700 disabled:opacity-50"
                  >
                    {MANUAL_EVENT_TYPES.map((t) => <option key={t} value={t}>{EVENT_TYPE_LABEL[t]}</option>)}
                  </select>
                  <input
                    value={newEventDesc}
                    onChange={(e) => { setNewEventDesc(e.target.value); setConfirmingIncident(false); }}
                    disabled={confirmingIncident}
                    placeholder="Describe what happened…"
                    className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-xs text-gray-700 disabled:opacity-50"
                  />
                  {!confirmingIncident && (
                    <button
                      type="submit"
                      disabled={loggingEvent || !newEventDesc.trim()}
                      className="bg-gray-900 hover:bg-gray-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                    >
                      {loggingEvent ? "Adding…" : "Add"}
                    </button>
                  )}
                </div>

                {confirmingIncident && (
                  <div className="mt-3 bg-red-50 border border-red-300 rounded-lg p-3 flex items-center justify-between gap-3">
                    <span className="text-sm text-red-700 font-medium">This will permanently log an Incident Action — it cannot be edited or deleted afterward. Continue?</span>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        type="submit"
                        disabled={loggingEvent}
                        className="bg-red-600 hover:bg-red-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {loggingEvent ? "Logging…" : "Yes, Log It"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingIncident(false)}
                        className="border border-gray-300 bg-white text-gray-600 text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </form>
            )}
            {custodyError && <p className="no-print text-red-500 text-xs mt-2">{custodyError}</p>}
          </Section>

          <Section label="Lock / Unlock Audit Log">
            {!guardianId ? (
              <p className="text-sm text-gray-400">No Guardian device assigned to this mission yet.</p>
            ) : (
              <>
                {lockEvents.length === 0 ? (
                  <p className="text-sm text-gray-400 mb-4">No lock events recorded yet.</p>
                ) : (
                  <div className="space-y-2 mb-4">
                    {lockEvents.map((ev) => (
                      <div key={ev.id} className="flex gap-4 text-sm">
                        <span className="font-mono text-gray-400 flex-shrink-0 w-32">{fmtDate(ev.occurred_at)}</span>
                        <span className="text-gray-700 flex-1 font-semibold capitalize">{ev.event_type.replace(/_/g, " ")}</span>
                        <span className="text-gray-400 flex-shrink-0 capitalize">{ev.triggered_by.replace(/_/g, " ")}</span>
                      </div>
                    ))}
                  </div>
                )}

                {currentUser && (
                  <div className="no-print flex gap-2 pt-4 border-t border-gray-200 flex-wrap">
                    <button type="button" onClick={() => handleLockAction("locked")} disabled={loggingLock} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                      Lock
                    </button>
                    <button type="button" onClick={() => handleLockAction("unlocked")} disabled={loggingLock} className="bg-gray-700 hover:bg-gray-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                      Unlock
                    </button>
                    <button type="button" onClick={() => handleLockAction("tamper_detected")} disabled={loggingLock} className="border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                      Simulate Tamper Detected
                    </button>
                    <button type="button" onClick={() => handleLockAction("forced_open")} disabled={loggingLock} className="border border-red-300 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                      Simulate Forced Open
                    </button>
                  </div>
                )}

                {pendingLockAction && (
                  <div className="no-print mt-3 bg-red-50 border border-red-300 rounded-lg p-3 flex items-center justify-between gap-3">
                    <span className="text-sm text-red-700 font-medium">
                      This will permanently log a {pendingLockAction === "tamper_detected" ? "Tamper Detected" : "Forced Open"} event — it cannot be edited or deleted afterward. Continue?
                    </span>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        type="button"
                        disabled={loggingLock}
                        onClick={() => doLogLockEvent(pendingLockAction)}
                        className="bg-red-600 hover:bg-red-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {loggingLock ? "Logging…" : "Yes, Log It"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingLockAction(null)}
                        className="border border-gray-300 bg-white text-gray-600 text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {lockError && <p className="no-print text-red-500 text-xs mt-2">{lockError}</p>}
              </>
            )}
          </Section>

          <Section label="Evidence Capture">
            {evidenceFiles.length === 0 ? (
              <p className="text-sm text-gray-400 mb-4">No evidence captured yet.</p>
            ) : (
              <div className="space-y-2 mb-4">
                {evidenceFiles.map((ev) => (
                  <div key={ev.id} className="flex gap-4 text-sm items-center">
                    <span className="font-mono text-gray-400 flex-shrink-0 w-32">{fmtDate(ev.created_at)}</span>
                    <span className="text-gray-700 flex-1 capitalize">{ev.file_type}</span>
                    <button
                      type="button"
                      onClick={() => handleViewEvidence(ev.id)}
                      disabled={loadingUrlFor === ev.id}
                      className="no-print text-blue-600 hover:underline text-xs font-semibold disabled:opacity-50 flex-shrink-0"
                    >
                      {loadingUrlFor === ev.id ? "Loading…" : "View"}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {currentUser && (
              <div className="no-print pt-4 border-t border-gray-200 space-y-3">
                <canvas ref={canvasRef} className="hidden" />
                {cameraActive ? (
                  <div className="space-y-2">
                    <div className="bg-black rounded-lg overflow-hidden aspect-video max-w-sm">
                      <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={captureSnapshot} disabled={uploadingEvidence} className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                        {uploadingEvidence ? "Uploading…" : "Capture & Upload"}
                      </button>
                      <button type="button" onClick={stopCamera} className="border border-gray-300 text-gray-600 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 flex-wrap items-center">
                    <button type="button" onClick={startCamera} disabled={uploadingEvidence} className="bg-gray-900 hover:bg-gray-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                      Open Camera
                    </button>
                    <label className="border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors cursor-pointer">
                      {uploadingEvidence ? "Uploading…" : "Upload Photo"}
                      <input type="file" accept="image/*" onChange={handleFileUpload} disabled={uploadingEvidence} className="hidden" />
                    </label>
                  </div>
                )}
                {cameraError && <p className="text-gray-500 text-xs">Camera unavailable or permission denied — use Upload Photo instead.</p>}
                {evidenceError && <p className="text-red-500 text-xs">{evidenceError}</p>}
              </div>
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
