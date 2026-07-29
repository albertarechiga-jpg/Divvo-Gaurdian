import { useState, useEffect } from "react";
import { fmtDate } from "../lib/utils.js";
import { fetchBolDetail, getDriverVerificationUrls, fetchPriorPassedVerification, reviewDriverVerification } from "../lib/bol.js";

// The action-oriented counterpart to BolPacketModal's read-only verification
// section — this is where an admin actually looks at the two captured
// photos and decides. Approving here is the single action that authorizes
// real-world cargo release (see api/driver-verification.js) — it's
// the one moment in this whole feature that matters most, so it's the one
// gated behind an explicit second confirmation, same pattern as
// BolPacketModal's tamper/forced-open confirm.
export default function DriverVerificationReviewModal({ bolId, session, onClose, onReviewed }) {
  const [bol, setBol] = useState(undefined); // undefined = loading, null = failed
  const [loadError, setLoadError] = useState("");
  const [selfieUrl, setSelfieUrl] = useState(null);
  const [idPhotoUrl, setIdPhotoUrl] = useState(null);
  const [priorSelfieUrl, setPriorSelfieUrl] = useState(null);
  const [priorVerifiedAt, setPriorVerifiedAt] = useState(null);

  const [confirmingApprove, setConfirmingApprove] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    setLoadError("");
    fetchBolDetail(session.access_token, bolId).then(async (b) => {
      setBol(b);
      const verification = b?.bol_signatures?.find((s) => s.signer_type === "driver")?.driver_verifications;
      if (!verification) return;
      try {
        const urls = await getDriverVerificationUrls(session.access_token, verification.id);
        setSelfieUrl(urls.selfieUrl);
        setIdPhotoUrl(urls.idPhotoUrl);
        if (verification.driver_id) {
          const prior = await fetchPriorPassedVerification(session.access_token, verification.driver_id, verification.id);
          if (prior) {
            const priorUrls = await getDriverVerificationUrls(session.access_token, prior.id);
            setPriorSelfieUrl(priorUrls.selfieUrl);
            setPriorVerifiedAt(prior.verified_at);
          }
        }
      } catch (err) {
        setLoadError(err.message || "Failed to load verification photos");
      }
    }).catch((err) => {
      setBol(null);
      setLoadError(err.message || "Failed to load BOL");
    });
  }, [bolId, session]);

  const verification = bol?.bol_signatures?.find((s) => s.signer_type === "driver")?.driver_verifications;
  const driver = bol?.missions?.drivers;

  const handleApprove = async () => {
    if (!confirmingApprove) {
      setConfirmingApprove(true);
      setRejecting(false);
      return;
    }
    setSubmitting(true);
    setActionError("");
    try {
      await reviewDriverVerification(session.access_token, { verificationId: verification.id, decision: "approve" });
      onReviewed?.();
      onClose();
    } catch (err) {
      setActionError(err.message || "Failed to approve");
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejecting) {
      setRejecting(true);
      setConfirmingApprove(false);
      return;
    }
    if (!rejectReason.trim()) {
      setActionError("A reason is required to reject a verification");
      return;
    }
    setSubmitting(true);
    setActionError("");
    try {
      await reviewDriverVerification(session.access_token, { verificationId: verification.id, decision: "reject", notes: rejectReason.trim() });
      onReviewed?.();
      onClose();
    } catch (err) {
      setActionError(err.message || "Failed to reject");
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8 overflow-y-auto">
      <div className="w-full max-w-lg bg-gray-900 border border-gray-800 rounded-xl shadow-2xl p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-white text-sm font-bold">Review Driver Verification</h2>
            <p className="text-gray-500 text-xs mt-0.5">{bol?.bol_number}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 -mt-1 -mr-1 p-1" aria-label="Close">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {bol === undefined && !loadError && <p className="text-gray-400 text-xs text-center py-6">Loading…</p>}
        {loadError && <p className="text-red-400 text-xs text-center py-6">{loadError}</p>}

        {bol && verification && (
          <div className="space-y-4">
            {verification.result !== "pending" && (
              <div className={`rounded-lg p-3 text-xs font-semibold ${verification.result === "passed" ? "bg-emerald-950/40 border border-emerald-800/40 text-emerald-300" : "bg-red-950/40 border border-red-800/40 text-red-300"}`}>
                Already decided — result: {verification.result}{verification.users?.full_name ? ` (by ${verification.users.full_name})` : ""}
              </div>
            )}

            <div>
              <p className="text-gray-400 text-xs font-semibold mb-1">Driver</p>
              <p className="text-white text-sm">{driver?.full_name}</p>
              <p className="text-gray-500 text-xs">{driver?.license_state} license · {driver?.phone || "—"} · {driver?.email || "—"}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-gray-400 text-xs font-semibold mb-1">ID Photo</p>
                {idPhotoUrl ? (
                  <img src={idPhotoUrl} alt="Captured ID" className="w-full aspect-video object-cover rounded-lg border border-gray-700" />
                ) : (
                  <div className="w-full aspect-video bg-gray-800 rounded-lg flex items-center justify-center text-gray-600 text-xs">Loading…</div>
                )}
              </div>
              <div>
                <p className="text-gray-400 text-xs font-semibold mb-1">Selfie at Pickup</p>
                {selfieUrl ? (
                  <img src={selfieUrl} alt="Captured selfie" className="w-full aspect-video object-cover rounded-lg border border-gray-700" />
                ) : (
                  <div className="w-full aspect-video bg-gray-800 rounded-lg flex items-center justify-center text-gray-600 text-xs">Loading…</div>
                )}
              </div>
            </div>

            {priorSelfieUrl && (
              <div>
                <p className="text-gray-400 text-xs font-semibold mb-1">
                  Selfie From Last Approved Pickup ({fmtDate(priorVerifiedAt)}) — does this look like the same person?
                </p>
                <img src={priorSelfieUrl} alt="Prior approved selfie" className="w-1/2 aspect-video object-cover rounded-lg border border-gray-700" />
              </div>
            )}
            {!priorSelfieUrl && verification.driver_id && (
              <p className="text-gray-600 text-xs">No prior approved verification on file for this driver — this is their first reviewed pickup.</p>
            )}

            {actionError && <p className="text-red-400 text-xs">{actionError}</p>}

            {verification.result === "pending" && (
              <>
                {confirmingApprove && (
                  <div className="bg-emerald-950/50 border border-emerald-700 rounded-lg p-3">
                    <p className="text-emerald-300 text-xs font-semibold mb-2">Approving authorizes real cargo release for this pickup. Confirm the photos match before proceeding.</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setConfirmingApprove(false)} disabled={submitting} className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold rounded-lg py-2 transition-colors disabled:opacity-50">Cancel</button>
                      <button type="button" onClick={handleApprove} disabled={submitting} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg py-2 transition-colors disabled:opacity-50">
                        {submitting ? "Authorizing…" : "Yes, Approve & Authorize Release"}
                      </button>
                    </div>
                  </div>
                )}

                {rejecting && (
                  <div className="bg-red-950/50 border border-red-700 rounded-lg p-3 space-y-2">
                    <label className="block text-red-300 text-xs font-semibold">Reason for rejection (required)</label>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={2}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 outline-none focus:border-red-600"
                      placeholder="e.g. Selfie doesn't match ID photo, ID appears altered, driver doesn't match prior pickup..."
                    />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setRejecting(false); setRejectReason(""); }} disabled={submitting} className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold rounded-lg py-2 transition-colors disabled:opacity-50">Cancel</button>
                      <button type="button" onClick={handleReject} disabled={submitting || !rejectReason.trim()} className="flex-1 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-lg py-2 transition-colors disabled:opacity-50">
                        {submitting ? "Rejecting…" : "Confirm Rejection"}
                      </button>
                    </div>
                  </div>
                )}

                {!confirmingApprove && !rejecting && (
                  <div className="flex gap-2">
                    <button type="button" onClick={handleReject} className="flex-1 bg-red-950/40 hover:bg-red-900/50 border border-red-800/40 text-red-300 text-sm font-semibold rounded-lg py-2 transition-colors">
                      Reject
                    </button>
                    <button type="button" onClick={handleApprove} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg py-2 transition-colors">
                      Approve
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
