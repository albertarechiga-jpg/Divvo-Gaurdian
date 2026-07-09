import { useState, useRef, useEffect } from "react";
import { fmtCurrency } from "../lib/utils.js";
import { hashDataUrl, submitBol } from "../lib/bol.js";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA",
  "ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK",
  "OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

const inputClass = "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-600";
const labelClass = "block text-gray-400 text-xs font-semibold mb-1";

function StepDots({ step }) {
  return (
    <div className="flex items-center gap-1.5 mb-4">
      {[1, 2, 3, 4].map((n) => (
        <div key={n} className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-blue-600" : "bg-gray-800"}`} />
      ))}
    </div>
  );
}

// Hand-rolled signature pad — no library needed for a single canvas.
function SignaturePad({ onChange }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);

  const getPoint = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const t = e.touches?.[0];
    return { x: (t?.clientX ?? e.clientX) - rect.left, y: (t?.clientY ?? e.clientY) - rect.top };
  };

  const start = (e) => {
    e.preventDefault();
    drawingRef.current = true;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { x, y } = getPoint(e, canvas);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { x, y } = getPoint(e, canvas);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111827";
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const end = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    onChange(canvasRef.current.toDataURL());
  };

  const clear = () => {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    onChange(null);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={400}
        height={140}
        className="w-full bg-white rounded-lg border border-gray-700 touch-none"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <button type="button" onClick={clear} className="mt-1 text-xs text-gray-400 hover:text-gray-200">Clear signature</button>
    </div>
  );
}

export default function CreateBolModal({ shipment, session, onClose, onCreated }) {
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [bol, setBol] = useState({
    pickupLocation: shipment.originPort || "",
    deliveryLocation: shipment.destination || "",
    cargoDescription: shipment.cargoType || "",
    declaredValue: shipment.cargoValue || "",
  });
  const [driver, setDriver] = useState({ fullName: "", phone: "", email: "", licenseNumber: "", licenseState: "" });

  const [consentGiven, setConsentGiven] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [signatureDataUrl, setSignatureDataUrl] = useState(null);
  const [result, setResult] = useState(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => () => stopCamera(), []);

  const runVerification = async () => {
    setCameraError(false);
    setVerifying(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      // Simulated pass after a short "scan" — the live camera feed is only
      // ever shown to the operator locally; it is never captured to an
      // image, uploaded, or sent to any API, and the stream is stopped
      // immediately below.
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
      const data = await submitBol(session.access_token, {
        shipmentId: shipment.id,
        shipment: {
          containerNumber: shipment.containerNumber,
          cargoType: shipment.cargoType,
          cargoValue: shipment.cargoValue,
          originPort: shipment.originPort,
          destination: shipment.destination,
          carrier: shipment.carrier,
        },
        bol,
        driver,
        signatureHash,
        consentGiven,
      });
      setResult(data);
      setStep(5);
      onCreated?.(data);
    } catch (err) {
      setError(err.message || "Failed to submit BOL");
    } finally {
      setSubmitting(false);
    }
  };

  const canContinueStep1 = bol.pickupLocation.trim() && bol.deliveryLocation.trim() && bol.declaredValue;
  const canContinueStep2 = driver.fullName.trim() && driver.licenseNumber.trim() && driver.licenseState;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-xl shadow-2xl p-6">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h2 className="text-white text-sm font-bold">Create Digital BOL</h2>
            <p className="text-gray-500 text-xs mt-0.5">{shipment.id} · {shipment.carrier}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 -mt-1 -mr-1 p-1" aria-label="Close">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {step <= 4 && <StepDots step={step} />}
        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

        {step === 1 && (
          <div className="space-y-3">
            <div>
              <label className={labelClass}>Pickup Location</label>
              <input className={inputClass} value={bol.pickupLocation} onChange={(e) => setBol((b) => ({ ...b, pickupLocation: e.target.value }))} />
            </div>
            <div>
              <label className={labelClass}>Delivery Location</label>
              <input className={inputClass} value={bol.deliveryLocation} onChange={(e) => setBol((b) => ({ ...b, deliveryLocation: e.target.value }))} />
            </div>
            <div>
              <label className={labelClass}>Cargo Description</label>
              <input className={inputClass} value={bol.cargoDescription} onChange={(e) => setBol((b) => ({ ...b, cargoDescription: e.target.value }))} />
            </div>
            <div>
              <label className={labelClass}>Declared Value (USD)</label>
              <input type="number" className={inputClass} value={bol.declaredValue} onChange={(e) => setBol((b) => ({ ...b, declaredValue: e.target.value }))} />
            </div>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={onClose} className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-semibold rounded-lg py-2 transition-colors">Cancel</button>
              <button
                type="button"
                disabled={!canContinueStep1}
                onClick={() => setStep(2)}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg py-2 transition-colors disabled:opacity-50"
              >
                Next: Driver Info
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div>
              <label className={labelClass}>Driver Full Name</label>
              <input className={inputClass} value={driver.fullName} onChange={(e) => setDriver((d) => ({ ...d, fullName: e.target.value }))} placeholder="Jane Rodriguez" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Phone</label>
                <input className={inputClass} value={driver.phone} onChange={(e) => setDriver((d) => ({ ...d, phone: e.target.value }))} placeholder="+1 210 555 0000" />
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <input className={inputClass} value={driver.email} onChange={(e) => setDriver((d) => ({ ...d, email: e.target.value }))} placeholder="driver@carrier.com" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>License Number</label>
                <input className={inputClass} value={driver.licenseNumber} onChange={(e) => setDriver((d) => ({ ...d, licenseNumber: e.target.value }))} placeholder="Hashed before storage" />
              </div>
              <div>
                <label className={labelClass}>License State</label>
                <select className={inputClass} value={driver.licenseState} onChange={(e) => setDriver((d) => ({ ...d, licenseState: e.target.value }))}>
                  <option value="">—</option>
                  {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <p className="text-gray-600 text-xs">The license number is hashed before it's ever stored — the raw number isn't kept.</p>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setStep(1)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-semibold rounded-lg py-2 transition-colors">Back</button>
              <button
                type="button"
                disabled={!canContinueStep2}
                onClick={() => setStep(3)}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg py-2 transition-colors disabled:opacity-50"
              >
                Next: Verify Identity
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div className="bg-amber-950/40 border border-amber-800/40 rounded-lg p-3">
              <p className="text-amber-300 text-xs font-semibold mb-1">Simulated demo verification</p>
              <p className="text-amber-200/80 text-xs leading-relaxed">
                No photo or biometric data is transmitted or stored — everything in this step stays in your browser and is discarded immediately. This is not a real identity check.
              </p>
            </div>

            <label className="flex items-start gap-2 text-xs text-gray-300 cursor-pointer">
              <input type="checkbox" checked={consentGiven} onChange={(e) => setConsentGiven(e.target.checked)} className="mt-0.5" />
              <span>{driver.fullName || "The driver"} consents to this identity verification step.</span>
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
                  <p className="text-emerald-300 text-sm font-semibold">Identity Verified (simulated)</p>
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
              <button type="button" onClick={() => setStep(2)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-semibold rounded-lg py-2 transition-colors">Back</button>
              <button
                type="button"
                disabled={!verified}
                onClick={() => setStep(4)}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg py-2 transition-colors disabled:opacity-50"
              >
                Next: Signature
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <label className={labelClass}>Driver Signature</label>
            <SignaturePad onChange={setSignatureDataUrl} />
            <p className="text-gray-600 text-xs">Only a hash of this signature is stored — the image itself is never sent anywhere.</p>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setStep(3)} disabled={submitting} className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-semibold rounded-lg py-2 transition-colors disabled:opacity-50">Back</button>
              <button
                type="button"
                disabled={!signatureDataUrl || submitting}
                onClick={handleSubmit}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg py-2 transition-colors disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Submit BOL"}
              </button>
            </div>
          </div>
        )}

        {step === 5 && result && (
          <div className="space-y-3 text-center py-2">
            <span className="text-emerald-400 text-3xl">✓</span>
            <p className="text-white text-sm font-bold">BOL Created</p>
            <p className="text-gray-400 text-xs font-mono">{result.bolNumber}</p>
            <p className="text-gray-500 text-xs">Signed at pickup by {driver.fullName} · {fmtCurrency(Number(bol.declaredValue) || 0)} declared value</p>
            <button onClick={onClose} className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg py-2 transition-colors mt-2">Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
