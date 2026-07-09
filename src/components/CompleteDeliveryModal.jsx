import { useState, useRef, useEffect } from "react";
import { hashDataUrl, submitBolDelivery } from "../lib/bol.js";
import SignaturePad from "./SignaturePad.jsx";

const inputClass = "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-600";
const labelClass = "block text-gray-400 text-xs font-semibold mb-1";

const VERIFICATION_TYPES = [
  { value: "signature", label: "Signature only" },
  { value: "government_id", label: "Government ID" },
  { value: "biometric_face", label: "Biometric (face)" },
  { value: "qr_code", label: "QR code scan" },
];

function StepDots({ step }) {
  return (
    <div className="flex items-center gap-1.5 mb-4">
      {[1, 2, 3].map((n) => (
        <div key={n} className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-blue-600" : "bg-gray-800"}`} />
      ))}
    </div>
  );
}

export default function CompleteDeliveryModal({ bol, session, onClose, onCompleted }) {
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [verificationType, setVerificationType] = useState("signature");

  const [consentGiven, setConsentGiven] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [signatureDataUrl, setSignatureDataUrl] = useState(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => () => stopCamera(), []);

  // The <video> element only exists once `verifying` is true (it's behind
  // that conditional below), so attaching the stream has to happen in an
  // effect that runs after that render commits, not inline in
  // runVerification right after getUserMedia resolves — videoRef.current
  // isn't guaranteed to be populated at that point.
  useEffect(() => {
    if (verifying && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [verifying]);

  const runVerification = async () => {
    setCameraError(false);
    setVerifying(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      // Same guarantee as pickup verification: the live preview is shown
      // only to the operator locally and is never captured, uploaded, or
      // sent to any API. The stream is stopped immediately below.
      setTimeout(() => {
        stopCamera();
        setVerifying(false);
        setVerified(true);
      }, 2500);
    } catch {
      stopCamera();
      setCameraError(true);
      setVerifying(false);
    }
  };

  const simulateWithoutCamera = () => {
    setVerifying(true);
    setTimeout(() => {
      setVerifying(false);
      setVerified(true);
    }, 1200);
  };

  const handleSubmit = async () => {
    if (!signatureDataUrl) {
      setError("Signature is required");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const signatureHash = await hashDataUrl(signatureDataUrl);
      const data = await submitBolDelivery(session.access_token, {
        bolId: bol.id,
        receiverName,
        receiverPhone,
        verificationType,
        signatureHash,
        consentGiven,
      });
      onCompleted?.(data);
      onClose();
    } catch (err) {
      setError(err.message || "Failed to complete delivery");
    } finally {
      setSubmitting(false);
    }
  };

  const canContinueStep1 = receiverName.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-xl shadow-2xl p-6">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h2 className="text-white text-sm font-bold">Complete Delivery</h2>
            <p className="text-gray-500 text-xs mt-0.5 font-mono">{bol.bol_number}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 -mt-1 -mr-1 p-1" aria-label="Close">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <StepDots step={step} />
        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

        {step === 1 && (
          <div className="space-y-3">
            <div>
              <label className={labelClass}>Receiver Full Name</label>
              <input className={inputClass} value={receiverName} onChange={(e) => setReceiverName(e.target.value)} placeholder="Warehouse contact name" />
            </div>
            <div>
              <label className={labelClass}>Receiver Phone (optional)</label>
              <input className={inputClass} value={receiverPhone} onChange={(e) => setReceiverPhone(e.target.value)} placeholder="+1 210 555 0000" />
            </div>
            <div>
              <label className={labelClass}>Verification Type</label>
              <select className={inputClass} value={verificationType} onChange={(e) => setVerificationType(e.target.value)}>
                {VERIFICATION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={onClose} className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-semibold rounded-lg py-2 transition-colors">Cancel</button>
              <button
                type="button"
                disabled={!canContinueStep1}
                onClick={() => setStep(2)}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg py-2 transition-colors disabled:opacity-50"
              >
                Next: Verify Receiver
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="bg-amber-950/40 border border-amber-800/40 rounded-lg p-3">
              <p className="text-amber-300 text-xs font-semibold mb-1">Simulated demo verification</p>
              <p className="text-amber-200/80 text-xs leading-relaxed">
                No photo or biometric data is transmitted or stored — everything in this step stays in your browser and is discarded immediately. This is not a real identity check.
              </p>
            </div>

            <label className="flex items-start gap-2 text-xs text-gray-300 cursor-pointer">
              <input type="checkbox" checked={consentGiven} onChange={(e) => setConsentGiven(e.target.checked)} className="mt-0.5" />
              <span>{receiverName || "The receiver"} consents to this identity verification step.</span>
            </label>

            {!verified && (
              <div className="bg-black rounded-lg overflow-hidden aspect-video flex items-center justify-center">
                {verifying ? (
                  <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                ) : (
                  <span className="text-gray-600 text-xs">Camera preview will appear here</span>
                )}
              </div>
            )}

            {verified && (
              <div className="bg-emerald-950/40 border border-emerald-800/40 rounded-lg p-4 flex items-center gap-3">
                <span className="text-emerald-400 text-xl">✓</span>
                <div>
                  <p className="text-emerald-300 text-sm font-semibold">Receiver Verified (simulated)</p>
                  <p className="text-emerald-200/70 text-xs">Result recorded — provider: simulated</p>
                </div>
              </div>
            )}

            {cameraError && !verified && (
              <p className="text-gray-500 text-xs">Camera unavailable or permission denied — you can still simulate the result below.</p>
            )}

            {!verified && (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!consentGiven || verifying}
                  onClick={runVerification}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg py-2 transition-colors disabled:opacity-50"
                >
                  {verifying ? "Scanning…" : "Start Camera Verification"}
                </button>
                <button
                  type="button"
                  disabled={!consentGiven || verifying}
                  onClick={simulateWithoutCamera}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold rounded-lg py-2 transition-colors disabled:opacity-50"
                >
                  Simulate Verification
                </button>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setStep(1)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-semibold rounded-lg py-2 transition-colors">Back</button>
              <button
                type="button"
                disabled={!verified}
                onClick={() => setStep(3)}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg py-2 transition-colors disabled:opacity-50"
              >
                Next: Signature
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <label className={labelClass}>Receiver Signature</label>
            <SignaturePad onChange={setSignatureDataUrl} />
            <p className="text-gray-600 text-xs">Only a hash of this signature is stored — the image itself is never sent anywhere.</p>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setStep(2)} disabled={submitting} className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-semibold rounded-lg py-2 transition-colors disabled:opacity-50">Back</button>
              <button
                type="button"
                disabled={!signatureDataUrl || submitting}
                onClick={handleSubmit}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg py-2 transition-colors disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Complete Delivery"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
