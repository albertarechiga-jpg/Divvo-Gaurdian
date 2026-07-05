import { useState, useEffect, useRef } from "react";
import { COMPANIES, COMPANY_DEVICES } from "../data/companyFleets.js";

const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

const SEVERITY_COLOR = { Critical: "#ef4444", Warning: "#f59e0b", Secure: "#22c55e" };

async function sendSignal(deviceId, type, payload) {
  await fetch(SB_URL + "/rest/v1/webrtc_signals", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SB_KEY,
      Authorization: "Bearer " + SB_KEY,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ device_id: deviceId + "-viewer", type, payload }),
  });
}

async function pollSignals(deviceId, type) {
  const res = await fetch(
    SB_URL + "/rest/v1/webrtc_signals?device_id=eq." + deviceId + "-cam&type=eq." + type + "&order=created_at.desc&limit=1",
    { headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY } }
  );
  const rows = await res.json();
  return rows?.[0] ?? null;
}

// ── Single Camera Feed ────────────────────────────────────────────────────────

function CameraFeed({ camera, onStatusChange }) {
  const videoRef    = useRef(null);
  const pcRef       = useRef(null);
  const intervalRef = useRef(null);
  const elapsedRef  = useRef(null);

  const [status, setStatus]       = useState("idle");
  const [errorMsg, setErrorMsg]   = useState("");
  const [elapsed, setElapsed]     = useState(0);
  const [zoom, setZoom]           = useState(1);
  const [irMode, setIrMode]       = useState(false);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast]   = useState(100);

  const applyFilter = (ir, bright, cont) => {
    if (!videoRef.current) return;
    videoRef.current.style.filter = ir
      ? `grayscale(100%) brightness(${bright}%) contrast(${cont}%) sepia(20%)`
      : `brightness(${bright}%) contrast(${cont}%)`;
  };

  const toggleIR = () => {
    const next = !irMode;
    setIrMode(next);
    const b = next ? 140 : 100;
    const c = next ? 160 : 100;
    setBrightness(b);
    setContrast(c);
    applyFilter(next, b, c);
  };

  const handleZoom = (val) => {
    const v = parseFloat(val);
    setZoom(v);
    if (videoRef.current) {
      videoRef.current.style.transform = `scale(${v})`;
      videoRef.current.style.transformOrigin = "center center";
    }
  };

  const connect = async () => {
    setStatus("waiting");
    setErrorMsg("");
    setElapsed(0);
    setZoom(1);
    setIrMode(false);
    setBrightness(100);
    setContrast(100);

    try {
      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;

      pc.ontrack = (e) => {
        if (videoRef.current && e.streams[0]) {
          videoRef.current.srcObject = e.streams[0];
          videoRef.current.muted = true;
          const p = videoRef.current.play();
          if (p !== undefined) p.catch(() => {
            document.addEventListener("click", () => videoRef.current?.play(), { once: true });
          });
          setStatus("live");
          elapsedRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
          onStatusChange?.(camera.id, camera.label, true);
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === "failed" || state === "disconnected") {
          setStatus("error");
          setErrorMsg("Connection lost — phone may have closed camera");
          clearInterval(elapsedRef.current);
          onStatusChange?.(camera.id, camera.label, false);
        }
      };

      pc.onicecandidate = async (e) => {
        if (e.candidate) {
          await sendSignal(camera.id, "ice-viewer", { candidate: e.candidate });
        }
      };

      const offer = await pc.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: false });
      await pc.setLocalDescription(offer);
      await sendSignal(camera.id, "offer", { sdp: offer });

      let attempts = 0;
      intervalRef.current = setInterval(async () => {
        attempts++;
        if (attempts > 40) {
          clearInterval(intervalRef.current);
          setStatus("error");
          setErrorMsg("Phone not responding. Make sure camera.html is open and armed on your phone.");
          return;
        }
        const row = await pollSignals(camera.id, "answer");
        if (row?.payload?.sdp && pc.signalingState === "have-local-offer") {
          clearInterval(intervalRef.current);
          setStatus("connecting");
          await pc.setRemoteDescription(new RTCSessionDescription(row.payload.sdp));
          let icePoll = 0;
          const iceInterval = setInterval(async () => {
            icePoll++;
            if (icePoll > 20) { clearInterval(iceInterval); return; }
            const ice = await pollSignals(camera.id, "ice-camera");
            if (ice?.payload?.candidate) {
              try { await pc.addIceCandidate(new RTCIceCandidate(ice.payload.candidate)); } catch {}
            }
          }, 1000);
        }
      }, 1500);

    } catch (err) {
      setStatus("error");
      setErrorMsg(err.message);
    }
  };

  const disconnect = () => {
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (elapsedRef.current) { clearInterval(elapsedRef.current); elapsedRef.current = null; }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.style.transform = "scale(1)";
      videoRef.current.style.filter = "none";
    }
    setStatus("idle");
    setElapsed(0);
    setZoom(1);
    setIrMode(false);
    onStatusChange?.(camera.id, camera.label, false);
  };

  useEffect(() => () => disconnect(), []);

  const fmtTime = (s) => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  const STATUS_CONFIG = {
    idle:       { dot: "#374151", label: "Not connected",        labelColor: "#6b7280" },
    waiting:    { dot: "#f59e0b", label: "Calling phone...",     labelColor: "#fcd34d", pulse: true },
    connecting: { dot: "#3b82f6", label: "Connecting...",        labelColor: "#93c5fd", pulse: true },
    live:       { dot: "#22c55e", label: "LIVE",                 labelColor: "#22c55e", pulse: true },
    error:      { dot: "#ef4444", label: errorMsg || "Error",    labelColor: "#fca5a5" },
  };

  const sc = STATUS_CONFIG[status] || STATUS_CONFIG.idle;

  return (
    <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-4 py-2.5 bg-gray-900 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: sc.dot, animation: sc.pulse ? "pulse 1.5s infinite" : "none" }}/>
          <span className="text-xs font-bold text-gray-200">{camera.label}</span>
          <span className="font-mono text-xs text-gray-600">{camera.id}</span>
        </div>
        <div className="flex items-center gap-2">
          {status === "live" && <span className="font-mono text-xs text-gray-500">{fmtTime(elapsed)}</span>}
          <span style={{ color: sc.labelColor }} className="text-xs font-semibold">{sc.label}</span>
        </div>
      </div>

      {/* Video */}
      <div className="relative bg-black" style={{ aspectRatio: "16/9", overflow: "hidden" }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{ display: status === "live" ? "block" : "none" }}
          onLoadedMetadata={(e) => e.target.play()}
        />

        {status !== "live" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            {(status === "idle") && (
              <>
                <svg className="w-10 h-10 text-gray-700" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>
                </svg>
                <p className="text-xs text-gray-600">Click Connect to start viewing</p>
              </>
            )}
            {(status === "waiting") && (
              <>
                <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"/>
                <p className="text-xs text-amber-400">Calling phone camera...</p>
                <p className="text-xs text-gray-600">Make sure camera.html is open and armed</p>
              </>
            )}
            {(status === "connecting") && (
              <>
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
                <p className="text-xs text-blue-400">Establishing connection...</p>
              </>
            )}
            {(status === "error") && (
              <>
                <svg className="w-8 h-8 text-red-700" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <p className="text-xs text-red-400 text-center px-4">{errorMsg}</p>
              </>
            )}
          </div>
        )}

        {status === "live" && (
          <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-red-900/80 border border-red-700 px-2 py-0.5 rounded text-xs font-bold text-red-300">
            <span className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse"/>
            REC
          </div>
        )}

        {irMode && status === "live" && (
          <div className="absolute top-2 right-2 bg-emerald-900/80 border border-emerald-700 px-2 py-0.5 rounded text-xs font-bold text-emerald-300">
            IR
          </div>
        )}
      </div>

      {/* Zoom + IR — only when live */}
      {status === "live" && (
        <div className="px-3 py-2.5 bg-gray-900 border-t border-gray-800 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-8">Zoom</span>
            <input
              type="range" min="1" max="4" step="0.25" value={zoom}
              onChange={(e) => handleZoom(e.target.value)}
              className="flex-1"
              style={{ accentColor: "#2563eb" }}
            />
            <span className="text-xs font-bold text-blue-400 w-8">{zoom.toFixed(1)}x</span>
            <button
              onClick={() => handleZoom(1)}
              className="text-xs text-gray-500 hover:text-gray-300 px-2"
            >Reset</button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-8">IR</span>
            <button
              onClick={toggleIR}
              className={`flex-1 text-xs font-bold py-1.5 rounded-lg transition-colors border ${
                irMode
                  ? "bg-emerald-900/60 border-emerald-700 text-emerald-300"
                  : "bg-gray-800 border-gray-700 text-gray-400"
              }`}
            >
              {irMode ? "🌙 Night Mode ON" : "🌙 Night Mode OFF"}
            </button>
            {irMode && (
              <div className="flex gap-1">
                <button
                  onClick={() => { const b = Math.min(200, brightness + 10); setBrightness(b); applyFilter(irMode, b, contrast); }}
                  className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded border border-gray-700"
                >+B</button>
                <button
                  onClick={() => { const c = Math.min(250, contrast + 10); setContrast(c); applyFilter(irMode, brightness, c); }}
                  className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded border border-gray-700"
                >+C</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="px-3 py-2.5 bg-gray-900 border-t border-gray-800 flex gap-2">
        {status === "idle" || status === "error" ? (
          <button onClick={connect} className="flex-1 bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold py-2 rounded-lg transition-colors">
            Connect
          </button>
        ) : (
          <button onClick={disconnect} className="flex-1 bg-red-900/60 hover:bg-red-800 text-red-300 border border-red-800 text-xs font-bold py-2 rounded-lg transition-colors">
            Disconnect
          </button>
        )}
        <a href="/camera.html" target="_blank" rel="noreferrer"
          className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold py-2 rounded-lg transition-colors text-center">
          Open Phone →
        </a>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CameraView({ company = "owlet" }) {
  const companyInfo = COMPANIES.find((c) => c.id === company) || COMPANIES[0];
  const CAMERAS = (COMPANY_DEVICES[company] || COMPANY_DEVICES.owlet).slice(0, 3).map((d) => ({
    id: d.id,
    label: d.location,
    color: SEVERITY_COLOR[d.severity] || "#22c55e",
  }));
  const [liveFeeds, setLiveFeeds] = useState([]);
  const [toast, setToast]         = useState(null);

  const handleStatusChange = (cameraId, label, isLive) => {
    if (isLive) {
      setLiveFeeds((prev) => prev.includes(cameraId) ? prev : [...prev, cameraId]);
      setToast(label + " is now LIVE");
      setTimeout(() => setToast(null), 4000);
      if (Notification.permission === "granted") {
        new Notification("📷 Divvo Guardian — Camera Live", { body: label + " connected and streaming" });
      }
    } else {
      setLiveFeeds((prev) => prev.filter((id) => id !== cameraId));
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>

      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 1000, background: "#052e16", border: "1px solid #22c55e", borderRadius: 12, padding: "12px 18px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", display: "inline-block", animation: "pulse 1s infinite" }}/>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#86efac" }}>📷 {toast}</span>
        </div>
      )}

      {liveFeeds.length > 0 && (
        <div className="mb-4 bg-emerald-950/40 border border-emerald-800/50 rounded-xl px-4 py-3 flex items-center gap-3">
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", animation: "pulse 1.5s infinite", display: "inline-block", flexShrink: 0 }}/>
          <span className="text-sm font-bold text-emerald-300">
            {liveFeeds.length} camera{liveFeeds.length > 1 ? "s" : ""} live — {liveFeeds.map(id => CAMERAS.find(c => c.id === id)?.label).join(", ")}
          </span>
        </div>
      )}

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Live Camera Feeds — {companyInfo.name}</h1>
          <p className="text-gray-500 text-sm mt-0.5">WebRTC peer-to-peer · No cloud storage · End-to-end encrypted</p>
        </div>
        <a href="/camera.html" target="_blank" rel="noreferrer"
          className="flex items-center gap-2 bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-colors">
          📷 Open Phone Camera
        </a>
      </div>

      <div className="mb-4 bg-blue-950/40 border border-blue-800/40 rounded-xl p-4">
        <p className="text-xs font-bold text-blue-300 mb-2">How to connect:</p>
        <ol className="text-xs text-blue-400 space-y-1 list-decimal list-inside">
          <li>Open <strong>divvo-guardian.vercel.app/camera.html</strong> on your phone</li>
          <li>Select the matching device (e.g. {CAMERAS[0]?.id}) and tap <strong>Arm Device</strong></li>
          <li>Come back here and click <strong>Connect</strong> — feed appears automatically</li>
        </ol>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {CAMERAS.map((cam) => (
          <CameraFeed key={cam.id} camera={cam} onStatusChange={handleStatusChange} />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: "🔒", title: "Peer-to-Peer Encrypted", desc: "Video streams directly from phone to browser. No server storage." },
          { icon: "🔍", title: "Zoom + Night Mode", desc: "1x–4x digital zoom and IR night mode simulation on each feed." },
          { icon: "📡", title: "Real-Time Signaling", desc: "Supabase relays handshake only. Stream data never touches the server." },
        ].map((item) => (
          <div key={item.title} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">{item.icon}</span>
              <span className="text-xs font-bold text-gray-300">{item.title}</span>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
