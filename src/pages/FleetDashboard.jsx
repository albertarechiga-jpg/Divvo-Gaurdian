import { useState, useEffect, useRef, useCallback } from "react";
import { dispatchAlert } from "../lib/notifications.js";

const MAPBOX_TOKEN = "REDACTED_MAPBOX_TOKEN";
const SB_URL = "https://vnywjwncanldpsffiwtn.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZueXdqd25jYW5sZHBzZmZpd3RuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MjExMjAsImV4cCI6MjA5ODQ5NzEyMH0.J-5KjItWTEgolONGOHhLORJNh5K6rla19vJnASl2ay4";
const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] };

// Each device has 3 camera slots: left=device-1, center=device-2, right=device-3
// In production each physical device would have its own 3 camera IDs
// For the prototype we use the same 3 slots and connect per-device
const DEVICE_CAMERA_SLOTS = {
  "DG-1028": ["device-1", "device-2", "device-3"],
  "DG-1041": ["device-1", "device-2", "device-3"],
  "DG-0994": ["device-1", "device-2", "device-3"],
  "DG-1102": ["device-1", "device-2", "device-3"],
  "DG-1055": ["device-1", "device-2", "device-3"],
  "DG-1076": ["device-1", "device-2", "device-3"],
  "DG-1088": ["device-1", "device-2", "device-3"],
  "DG-1099": ["device-1", "device-2", "device-3"],
};

async function sendSignal(deviceId, type, payload) {
  await fetch(SB_URL + "/rest/v1/webrtc_signals", {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, Prefer: "return=minimal" },
    body: JSON.stringify({ device_id: deviceId + "-viewer", type, payload }),
  });
}

async function pollSignal(deviceId, type) {
  const res = await fetch(
    SB_URL + "/rest/v1/webrtc_signals?device_id=eq." + deviceId + "-cam&type=eq." + type + "&order=created_at.desc&limit=1",
    { headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY } }
  );
  const rows = await res.json();
  return rows?.[0] ?? null;
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const INITIAL_ALERTS = [
  {
    id: "DG-1028", type: "Lock Tamper Detected", severity: "Critical",
    location: "I-35 N near Laredo, TX", timestamp: "2026-06-19 · 10:14 AM",
    device: "DG-1028", trailerId: "TRL-4482", lat: 27.5306, lon: -99.4803,
    lockStatus: "Secure", battery: 74, lte: "Strong", camera: "Online",
    door: "Closed", vibration: "Normal", lastCheckin: "10:14:02 AM",
    timeline: [
      { time: "10:14", icon: "alert", text: "Lock tamper alert triggered" },
      { time: "10:12", icon: "vibration", text: "Vibration spike detected — 4.1G" },
      { time: "10:08", icon: "gps", text: "GPS ping — I-35 N, Mile 22" },
      { time: "09:55", icon: "lock", text: "Lock confirmed secure — check-in" },
    ],
  },
  {
    id: "DG-1041", type: "Door Opened Outside Geofence", severity: "Critical",
    location: "US-281 near Corpus Christi, TX", timestamp: "2026-06-19 · 10:09 AM",
    device: "DG-1041", trailerId: "TRL-3391", lat: 27.8006, lon: -97.3964,
    lockStatus: "Unlocked", battery: 61, lte: "Moderate", camera: "Online",
    door: "Open", vibration: "Elevated", lastCheckin: "10:09:44 AM",
    timeline: [
      { time: "10:09", icon: "alert", text: "Door opened outside geofence boundary" },
      { time: "10:07", icon: "gps", text: "Geofence exit detected" },
      { time: "09:48", icon: "lock", text: "Lock disengaged — event logged" },
      { time: "09:30", icon: "gps", text: "GPS ping — US-281 S, Mile 44" },
    ],
  },
  {
    id: "DG-0994", type: "Battery Below 18%", severity: "Warning",
    location: "I-10 W near San Antonio, TX", timestamp: "2026-06-19 · 09:52 AM",
    device: "DG-0994", trailerId: "TRL-8820", lat: 29.4241, lon: -98.4936,
    lockStatus: "Secure", battery: 17, lte: "Strong", camera: "Online",
    door: "Closed", vibration: "Normal", lastCheckin: "09:52:11 AM",
    timeline: [
      { time: "09:52", icon: "battery", text: "Battery dropped below 18% threshold" },
      { time: "08:30", icon: "battery", text: "Battery at 31% — monitoring" },
      { time: "07:15", icon: "gps", text: "GPS ping — I-10 W, Mile 556" },
      { time: "06:00", icon: "lock", text: "Lock confirmed secure — daily check" },
    ],
  },
  {
    id: "DG-1102", type: "GPS Signal Degraded", severity: "Warning",
    location: "FM-2252 near Helotes, TX", timestamp: "2026-06-19 · 09:38 AM",
    device: "DG-1102", trailerId: "TRL-5567", lat: 29.5736, lon: -98.6947,
    lockStatus: "Secure", battery: 88, lte: "Weak", camera: "Degraded",
    door: "Closed", vibration: "Normal", lastCheckin: "09:38:55 AM",
    timeline: [
      { time: "09:38", icon: "gps", text: "GPS signal degraded — LTE fallback" },
      { time: "09:35", icon: "alert", text: "Signal strength dropped below threshold" },
      { time: "09:20", icon: "gps", text: "GPS ping — FM-2252, near Helotes" },
      { time: "08:55", icon: "lock", text: "Lock confirmed secure" },
    ],
  },
];

const SECURE_DEVICES = [
  { id: "DG-1055", trailerId: "TRL-2210", location: "I-410 Loop, San Antonio TX", battery: 92, status: "Secure", lat: 29.3787, lon: -98.5531 },
  { id: "DG-1076", trailerId: "TRL-7714", location: "Port of Houston — Bay 14",   battery: 78, status: "Secure", lat: 29.7282, lon: -95.2713 },
  { id: "DG-1088", trailerId: "TRL-3305", location: "I-35 S near New Braunfels",  battery: 85, status: "Secure", lat: 29.7030, lon: -98.0810 },
  { id: "DG-1099", trailerId: "TRL-9921", location: "IH-10 E near Seguin TX",     battery: 69, status: "Secure", lat: 29.5688, lon: -97.9641 },
];

const SVCOL = { Critical: "#ef4444", Warning: "#f59e0b", Secure: "#22c55e", Online: "#22c55e", Offline: "#ef4444", Degraded: "#f59e0b", Strong: "#22c55e", Moderate: "#f59e0b", Weak: "#ef4444", Open: "#ef4444", Closed: "#22c55e", Unlocked: "#f59e0b", Tampered: "#ef4444", Elevated: "#f59e0b", Normal: "#22c55e" };

// ── Mapbox Fleet Map ──────────────────────────────────────────────────────────

function FleetMap({ alerts, secureDevices, onSelectDevice, selectedId, theftActive }) {
  const mapContainer = useRef(null);
  const map          = useRef(null);
  const markers      = useRef({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://api.mapbox.com/mapbox-gl-js/v3.4.0/mapbox-gl.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://api.mapbox.com/mapbox-gl-js/v3.4.0/mapbox-gl.js";
    script.onload = () => {
      window.mapboxgl.accessToken = MAPBOX_TOKEN;
      map.current = new window.mapboxgl.Map({
        container: mapContainer.current,
        style: "mapbox://styles/mapbox/dark-v11",
        center: [-98.8, 28.5],
        zoom: 5.8,
      });
      map.current.addControl(new window.mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      map.current.on("load", () => setLoaded(true));
    };
    document.head.appendChild(script);
  }, []);

  // Add/update markers when map loads or data changes
  useEffect(() => {
    if (!loaded || !window.mapboxgl) return;

    const allDevices = [
      ...alerts.map(a => ({ id: a.id, lat: a.lat, lon: a.lon, severity: a.severity, label: a.id, type: a.type })),
      ...secureDevices.map(d => ({ id: d.id, lat: d.lat, lon: d.lon, severity: "Secure", label: d.id, type: "Secure" })),
    ];

    allDevices.forEach(device => {
      const color = device.severity === "Critical" ? "#ef4444" : device.severity === "Warning" ? "#f59e0b" : "#22c55e";
      const isSelected = device.id === selectedId;
      const isCrit = device.severity === "Critical";

      if (markers.current[device.id]) {
        // Update existing marker style
        const el = markers.current[device.id]._element;
        el.style.width = isSelected ? "22px" : "16px";
        el.style.height = isSelected ? "22px" : "16px";
        el.style.boxShadow = isSelected ? `0 0 0 3px ${color}44, 0 0 16px ${color}66` : `0 0 8px ${color}66`;
      } else {
        // Create new marker
        const el = document.createElement("div");
        el.style.cssText = `
          width: ${isSelected ? "22px" : "16px"};
          height: ${isSelected ? "22px" : "16px"};
          border-radius: 50%;
          background: ${color};
          border: 2.5px solid white;
          box-shadow: 0 0 8px ${color}66;
          cursor: pointer;
          transition: all 0.2s;
        `;

        if (isCrit) {
          el.style.animation = "mapPulse 1.5s infinite";
        }

        el.addEventListener("click", () => onSelectDevice(device.id));
        el.title = device.label;

        const popup = new window.mapboxgl.Popup({ offset: 20, closeButton: false, closeOnClick: false })
          .setHTML(`<div style="background:#0a0f1a;color:#f9fafb;padding:8px 10px;border-radius:8px;font-family:monospace;font-size:11px;border:1px solid #1f2937;min-width:140px;">
            <div style="font-weight:700;color:${color};margin-bottom:3px;">${device.id}</div>
            <div style="color:#9ca3af;font-size:10px;">${device.type}</div>
          </div>`);

        markers.current[device.id] = new window.mapboxgl.Marker(el)
          .setLngLat([device.lon, device.lat])
          .setPopup(popup)
          .addTo(map.current);

        el.addEventListener("mouseenter", () => markers.current[device.id].getPopup().addTo(map.current));
        el.addEventListener("mouseleave", () => markers.current[device.id].getPopup().remove());
      }
    });
  }, [loaded, alerts, secureDevices, selectedId]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <style>{`
        @keyframes mapPulse {
          0%, 100% { box-shadow: 0 0 8px #ef444466; }
          50% { box-shadow: 0 0 20px #ef4444aa, 0 0 40px #ef444444; }
        }
      `}</style>
      <div ref={mapContainer} style={{ width: "100%", height: "100%", borderRadius: 12 }}/>
      {!loaded && (
        <div style={{ position: "absolute", inset: 0, background: "#060d18", borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, border: "2px solid #2563eb", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }}/>
          <span style={{ fontSize: 12, color: "#6b7280" }}>Loading map...</span>
        </div>
      )}
    </div>
  );
}

// ── Status Dot ────────────────────────────────────────────────────────────────

const StatusDot = ({ val }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: SVCOL[val] || "#9ca3af" }}>
    <span style={{ width: 6, height: 6, borderRadius: "50%", background: SVCOL[val] || "#6b7280", display: "inline-block", flexShrink: 0 }}/>
    {val}
  </span>
);

// ── Inline Camera Feed (WebRTC) ───────────────────────────────────────────────

function InlineCameraFeed({ slotId, label, expanded, onExpand }) {
  const videoRef    = useRef(null);
  const pcRef       = useRef(null);
  const intervalRef = useRef(null);
  const elapsedRef  = useRef(null);
  const [status, setStatus]   = useState("idle");
  const [elapsed, setElapsed] = useState(0);
  const [zoom, setZoom]       = useState(1);
  const [irMode, setIrMode]   = useState(false);

  const applyFilter = (ir) => {
    if (!videoRef.current) return;
    videoRef.current.style.filter = ir ? "grayscale(100%) brightness(140%) contrast(160%) sepia(20%)" : "none";
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
    if (status !== "idle" && status !== "error") return;
    setStatus("calling");
    try {
      const pc = new RTCPeerConnection(ICE);
      pcRef.current = pc;
      pc.ontrack = (e) => {
        if (videoRef.current && e.streams[0]) {
          videoRef.current.srcObject = e.streams[0];
          videoRef.current.muted = true;
          // Force play with multiple attempts
          const tryPlay = () => {
            const p = videoRef.current?.play();
            if (p) p.catch(() => setTimeout(tryPlay, 500));
          };
          tryPlay();
          setStatus("live");
          elapsedRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
        }
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          setStatus("error");
          clearInterval(elapsedRef.current);
        }
      };
      pc.onicecandidate = async (e) => {
        if (e.candidate) await sendSignal(slotId, "ice-viewer", { candidate: e.candidate });
      };
      const offer = await pc.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: false });
      await pc.setLocalDescription(offer);
      await sendSignal(slotId, "offer", { sdp: offer });

      let tries = 0;
      intervalRef.current = setInterval(async () => {
        if (++tries > 30) { clearInterval(intervalRef.current); setStatus("error"); return; }
        const row = await pollSignal(slotId, "answer");
        if (row?.payload?.sdp && pc.signalingState === "have-local-offer") {
          clearInterval(intervalRef.current);
          setStatus("connecting");
          await pc.setRemoteDescription(new RTCSessionDescription(row.payload.sdp));
          let ic = 0;
          const iceInt = setInterval(async () => {
            if (++ic > 15) { clearInterval(iceInt); return; }
            const ice = await pollSignal(slotId, "ice-camera");
            if (ice?.payload?.candidate) try { await pc.addIceCandidate(new RTCIceCandidate(ice.payload.candidate)); } catch {}
          }, 1000);
        }
      }, 1500);
    } catch (err) { setStatus("error"); }
  };

  const disconnect = () => {
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    if (intervalRef.current) { clearInterval(intervalRef.current); }
    if (elapsedRef.current) { clearInterval(elapsedRef.current); }
    if (videoRef.current) { videoRef.current.srcObject = null; videoRef.current.style.transform = "scale(1)"; videoRef.current.style.filter = "none"; }
    setStatus("idle"); setElapsed(0); setZoom(1); setIrMode(false);
  };

  useEffect(() => () => disconnect(), []);

  const fmtTime = (s) => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
  const isLive = status === "live";
  const dotColor = isLive ? "#22c55e" : status === "calling" || status === "connecting" ? "#f59e0b" : status === "error" ? "#ef4444" : "#374151";

  return (
    <div style={{ background: "#030712", border: `1px solid ${isLive ? "#22c55e44" : "#1f2937"}`, borderRadius: 8, overflow: "hidden", cursor: "pointer" }} onClick={!isLive ? connect : undefined}>
      {/* Header */}
      <div style={{ padding: "5px 8px", background: "#0d1117", borderBottom: "1px solid #1f2937", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: dotColor, display: "inline-block", animation: isLive || status === "calling" ? "pulse 1.5s infinite" : "none" }}/>
          <span style={{ fontSize: 9, fontWeight: 700, color: "#9ca3af" }}>{label}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {isLive && <span style={{ fontSize: 9, color: "#6b7280", fontFamily: "monospace" }}>{fmtTime(elapsed)}</span>}
          {isLive && (
            <button onClick={(e) => { e.stopPropagation(); onExpand?.(); }}
              style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 10, padding: "0 2px" }} title="Expand">⛶</button>
          )}
          {isLive && (
            <button onClick={(e) => { e.stopPropagation(); disconnect(); }}
              style={{ background: "none", border: "none", color: "#ef444480", cursor: "pointer", fontSize: 10 }}>✕</button>
          )}
        </div>
      </div>

      {/* Video area */}
      <div style={{ position: "relative", background: "#000", overflow: "hidden", height: expanded ? 180 : 90 }}>
        <video ref={videoRef} autoPlay playsInline muted
          style={{ width: "100%", height: "100%", objectFit: "cover", display: isLive ? "block" : "none" }}
          onLoadedMetadata={e => e.target.play()}
        />
        {!isLive && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
            {status === "idle" && (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="1.5">
                  <path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>
                </svg>
                <span style={{ fontSize: 9, color: "#374151" }}>Tap to connect</span>
              </>
            )}
            {(status === "calling" || status === "connecting") && (
              <>
                <div style={{ width: 14, height: 14, border: "1.5px solid #f59e0b", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }}/>
                <span style={{ fontSize: 9, color: "#f59e0b" }}>{status === "calling" ? "Calling..." : "Connecting..."}</span>
              </>
            )}
            {status === "error" && (
              <>
                <span style={{ fontSize: 14 }}>⚠</span>
                <span style={{ fontSize: 9, color: "#ef4444" }}>No signal</span>
              </>
            )}
          </div>
        )}
        {isLive && (
          <div style={{ position: "absolute", top: 4, left: 4, background: "rgba(127,29,29,0.85)", border: "1px solid #ef4444", borderRadius: 4, padding: "2px 6px", fontSize: 8, fontWeight: 700, color: "#fca5a5", display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#ef4444", display: "inline-block" }}/>REC
          </div>
        )}
        {irMode && isLive && (
          <div style={{ position: "absolute", top: 4, right: 4, background: "rgba(5,46,22,0.85)", border: "1px solid #22c55e", borderRadius: 4, padding: "2px 6px", fontSize: 8, fontWeight: 700, color: "#86efac" }}>IR</div>
        )}
      </div>

      {/* Zoom + IR controls when live */}
      {isLive && (
        <div style={{ padding: "5px 8px", background: "#0a0f1a", borderTop: "1px solid #1f2937", display: "flex", alignItems: "center", gap: 6 }}>
          <input type="range" min="1" max="4" step="0.25" value={zoom}
            onChange={e => handleZoom(e.target.value)}
            style={{ flex: 1, accentColor: "#2563eb", height: 3 }}
            onClick={e => e.stopPropagation()}
          />
          <span style={{ fontSize: 9, color: "#60a5fa", minWidth: 24 }}>{zoom.toFixed(1)}x</span>
          <button onClick={(e) => { e.stopPropagation(); const next = !irMode; setIrMode(next); applyFilter(next); }}
            style={{ background: irMode ? "#052e16" : "#111827", border: `1px solid ${irMode ? "#22c55e" : "#374151"}`, color: irMode ? "#86efac" : "#6b7280", borderRadius: 4, padding: "2px 6px", fontSize: 9, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
            🌙
          </button>
        </div>
      )}
    </div>
  );
}

// ── Device Detail ─────────────────────────────────────────────────────────────

const DeviceDetail = ({ device, theftActive, onSimulateTheft, onClose, onNav }) => {
  if (!device) return null;
  const isCrit = device.severity === "Critical" || (theftActive && device.id === "DG-1028");

  const rows = [
    ["Device ID", device.id || device.device],
    ["Trailer ID", device.trailerId],
    ["GPS Location", device.location],
    ["Lock Status", device.lockStatus],
    ["Battery", `${device.battery}%`],
    ["LTE Signal", device.lte || "Strong"],
    ["Camera", device.camera || "Online"],
    ["Door Sensor", device.door || "Closed"],
    ["Vibration", device.vibration || "Normal"],
    ["Last Check-in", device.lastCheckin],
  ];

  const statusFields = ["Lock Status", "Camera", "Door Sensor", "Vibration", "LTE Signal"];

  return (
    <div style={{ background: "#0a0f1a", border: `1px solid ${isCrit ? "#ef4444" : "#1f2937"}`, borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ background: "#060d18", borderBottom: "1px solid #1f2937", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isCrit && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", display: "inline-block", animation: "pulse 1s infinite" }}/>}
          <span style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: "#f9fafb" }}>{device.id || device.device}</span>
          {device.severity && (
            <span style={{ background: isCrit ? "#450a0a" : "#1a1200", color: isCrit ? "#fca5a5" : "#fcd34d", border: `1px solid ${isCrit ? "#ef4444" : "#f59e0b"}`, fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 20, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {device.severity}
            </span>
          )}
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#4b5563", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>

        {/* Recovery mode banner */}
        {theftActive && device.id === "DG-1028" && (
          <div style={{ background: "#450a0a", border: "1px solid #ef4444", borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#ef4444", letterSpacing: "0.1em", marginBottom: 6 }}>⚠ RECOVERY MODE ACTIVE</div>
            <div style={{ fontSize: 11, color: "#fca5a5", marginBottom: 10 }}>GPS every 5s · Camera 4K · All sensors elevated</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["Create Recovery Case", "Notify Operations", "Export Evidence"].map((lbl) => (
                <button key={lbl} onClick={() => lbl === "Create Recovery Case" && window.dispatchEvent(new CustomEvent("divvo-nav", { detail: { page: "recovery-case", deviceId: "DG-1028" } }))}
                  style={{ background: "#7f1d1d", color: "#fca5a5", border: "1px solid #ef4444", borderRadius: 6, padding: "4px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Status rows */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 9, color: "#4b5563", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Device Status</div>
          {rows.map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid #111827" }}>
              <span style={{ fontSize: 11, color: "#6b7280" }}>{k}</span>
              {statusFields.includes(k) ? <StatusDot val={v}/> : <span style={{ fontSize: 11, color: "#d1d5db", fontWeight: 600 }}>{v}</span>}
            </div>
          ))}
        </div>

        {/* Battery bar */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: "#4b5563" }}>Battery Level</span>
            <span style={{ fontSize: 10, color: device.battery < 20 ? "#ef4444" : "#9ca3af", fontWeight: 700 }}>{device.battery}%</span>
          </div>
          <div style={{ height: 4, background: "#1f2937", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: device.battery + "%", background: device.battery < 20 ? "#ef4444" : device.battery < 40 ? "#f59e0b" : "#22c55e", borderRadius: 4, transition: "width 0.3s" }}/>
          </div>
        </div>

        {/* Live Camera Feeds */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ fontSize: 9, color: "#4b5563", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Live Camera Feeds</div>
            <a href="/camera.html" target="_blank" rel="noreferrer"
              style={{ fontSize: 9, color: "#60a5fa", textDecoration: "none", fontWeight: 600 }}>Arm Phone →</a>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
            {(DEVICE_CAMERA_SLOTS[device.id] || ["device-1","device-2","device-3"]).map((slotId, i) => (
              <InlineCameraFeed
                key={slotId + device.id}
                slotId={slotId}
                label={["LEFT","CENTER","RIGHT"][i]}
                expanded={false}
                onExpand={() => onNav && onNav("camera")}
              />
            ))}
          </div>
          <div style={{ fontSize: 10, color: "#374151", marginTop: 6, textAlign: "center" }}>
            Tap any feed to connect · Open camera.html on phone first
          </div>
        </div>

        {/* Timeline */}
        {device.timeline && (
          <div>
            <div style={{ fontSize: 9, color: "#4b5563", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Event Timeline</div>
            {device.timeline.map((e, i) => (
              <div key={i} style={{ display: "flex", gap: 8, paddingBottom: 8 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: i === 0 ? "#2563eb" : "#374151", marginTop: 3, flexShrink: 0 }}/>
                  {i < device.timeline.length - 1 && <div style={{ width: 1, flex: 1, background: "#1f2937", marginTop: 2, minHeight: 16 }}/>}
                </div>
                <div>
                  <span style={{ fontSize: 11, color: "#d1d5db" }}>{e.text}</span>
                  <div style={{ fontSize: 10, color: "#4b5563", fontFamily: "monospace" }}>{e.time}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Simulate theft */}
        {!theftActive && device.severity === "Critical" && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #1f2937" }}>
            <button onClick={onSimulateTheft}
              style={{ width: "100%", background: "#1a0505", border: "1px solid #7f1d1d", color: "#fca5a5", borderRadius: 8, padding: "10px 0", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              ⚡ Simulate Theft Event
            </button>
          </div>
        )}

        {/* Recovery case button for all */}
        <div style={{ marginTop: 8 }}>
          <button onClick={() => window.dispatchEvent(new CustomEvent("divvo-nav", { detail: { page: "recovery-case", deviceId: device.id } }))}
            style={{ width: "100%", background: device.severity === "Critical" ? "#450a0a" : "#1a1200", border: `1px solid ${device.severity === "Critical" ? "#ef4444" : "#f59e0b"}`, color: device.severity === "Critical" ? "#fca5a5" : "#fcd34d", borderRadius: 8, padding: "8px 0", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            + Open Recovery Case
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Alert Card ────────────────────────────────────────────────────────────────

const AlertCard = ({ alert, selected, onClick, onNav }) => {
  const isCrit = alert.severity === "Critical";
  return (
    <div onClick={onClick} style={{ background: selected ? (isCrit ? "#1a0505" : "#1a1200") : "#0f1923", border: `1px solid ${selected ? (isCrit ? "#ef4444" : "#f59e0b") : "#1f2937"}`, borderRadius: 10, padding: "12px 14px", cursor: "pointer", transition: "border-color 0.15s" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: isCrit ? "#ef4444" : "#f59e0b", display: "inline-block", animation: isCrit ? "pulse 1s infinite" : "none" }}/>
          <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: isCrit ? "#fca5a5" : "#fcd34d" }}>{alert.id}</span>
          <span style={{ background: isCrit ? "#450a0a" : "#1a1200", color: isCrit ? "#fca5a5" : "#fcd34d", fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 10, textTransform: "uppercase" }}>{alert.severity}</span>
        </div>
        <span style={{ fontSize: 10, color: "#4b5563" }}>{alert.timestamp.split(" · ")[1]}</span>
      </div>
      <div style={{ fontSize: 12, color: "#e5e7eb", fontWeight: 600, marginBottom: 3 }}>{alert.type}</div>
      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 10 }}>📍 {alert.location}</div>
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={(e) => { e.stopPropagation(); onClick(); }}
          style={{ flex: 1, background: isCrit ? "#7f1d1d" : "#451a03", color: isCrit ? "#fca5a5" : "#fcd34d", border: "none", borderRadius: 6, padding: "5px 0", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
          {isCrit ? "Respond →" : "Review →"}
        </button>
        <button onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent("divvo-nav", { detail: { page: "recovery-case", deviceId: alert.id } })); }}
          style={{ flex: 1, background: isCrit ? "#450a0a" : "#1a1200", color: isCrit ? "#fca5a5" : "#fcd34d", border: `1px solid ${isCrit ? "#ef4444" : "#f59e0b"}`, borderRadius: 6, padding: "5px 0", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
          + Recovery Case
        </button>
      </div>
    </div>
  );
};

// ── Stat Card ─────────────────────────────────────────────────────────────────

const Stat = ({ label, val, sub, accent }) => (
  <div style={{ background: "#0a0f1a", border: "1px solid #1f2937", borderRadius: 10, padding: "14px 16px" }}>
    <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 700, color: accent || "#f9fafb", lineHeight: 1 }}>{val}</div>
    {sub && <div style={{ fontSize: 11, color: "#4b5563", marginTop: 4 }}>{sub}</div>}
  </div>
);

// ── Toast ─────────────────────────────────────────────────────────────────────

const Toast = ({ msg, onDismiss }) => (
  <div style={{ position: "fixed", top: 20, right: 20, zIndex: 1000, background: "#450a0a", border: "1px solid #ef4444", borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.6)", maxWidth: 340 }}>
    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", display: "inline-block", animation: "pulse 1s infinite" }}/>
    <span style={{ fontSize: 13, fontWeight: 700, color: "#fca5a5", flex: 1 }}>{msg}</span>
    <button onClick={onDismiss} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 16 }}>×</button>
  </div>
);

// ── Main Component ────────────────────────────────────────────────────────────

export default function FleetDashboard({ onNav }) {
  const [alerts, setAlerts]       = useState(INITIAL_ALERTS);
  const [selectedId, setSelectedId] = useState(null);
  const [theftActive, setTheftActive] = useState(false);
  const [toast, setToast]         = useState(null);
  const [mapFullscreen, setMapFullscreen] = useState(false);

  const allDevices = [...alerts, ...SECURE_DEVICES];
  const selectedDevice = allDevices.find((d) => (d.id || d.device) === selectedId) || null;

  const handleSelectDevice = (id) => setSelectedId(id);

  const goToRecoveryCase = () => {
    window.dispatchEvent(new CustomEvent("divvo-nav", { detail: { page: "recovery-case", deviceId: "DG-1028" } }));
  };

  const handleSimulateTheft = () => {
    setAlerts((prev) => prev.map((a) => a.id === "DG-1028" ? { ...a, lockStatus: "Tampered", severity: "Critical" } : a));
    setTheftActive(true);
    setToast("Critical theft alert triggered — DG-1028");
    setTimeout(() => setToast(null), 5000);
    dispatchAlert({
      alertType: "Forced Entry — Active Theft",
      deviceId: "DG-1028",
      location: "I-35 N near Laredo, TX",
      severity: "Critical",
      details: [["Lock Status", "Tampered"], ["Door Sensor", "Triggered"], ["Camera", "Recording"], ["Cargo Value", "$840,000"]],
    });
  };

  const criticalCount = alerts.filter(a => a.severity === "Critical").length;
  const warningCount  = alerts.filter(a => a.severity === "Warning").length;

  return (
    <div style={{ background: "#070d17", minHeight: "100vh", color: "#f9fafb", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes spin { to{transform:rotate(360deg)} }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0a0f1a; }
        ::-webkit-scrollbar-thumb { background: #1f2937; border-radius: 2px; }
        .mapboxgl-ctrl-attrib { display: none !important; }
      `}</style>

      {toast && <Toast msg={toast} onDismiss={() => setToast(null)}/>}

      {/* Fullscreen Map Overlay */}
      {mapFullscreen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "#070d17", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "10px 16px", background: "#060d18", borderBottom: "1px solid #1f2937", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", animation: "pulse 2s infinite", display: "inline-block" }}/>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#f9fafb" }}>Live Fleet Map — Full Screen</span>
              <span style={{ fontSize: 11, color: "#6b7280" }}>South Texas · {allDevices.length} devices tracked</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ color: "#ef4444", fontSize: 11 }}>● {criticalCount} Critical</span>
              <span style={{ color: "#f59e0b", fontSize: 11 }}>● {warningCount} Warning</span>
              <span style={{ color: "#22c55e", fontSize: 11 }}>● {SECURE_DEVICES.length} Secure</span>
              <button onClick={() => setMapFullscreen(false)}
                style={{ background: "#1f2937", border: "1px solid #374151", color: "#9ca3af", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                ✕ Exit Full Screen
              </button>
            </div>
          </div>
          <div style={{ flex: 1, padding: 12 }}>
            <FleetMap
              alerts={alerts}
              secureDevices={SECURE_DEVICES}
              onSelectDevice={(id) => { handleSelectDevice(id); setMapFullscreen(false); }}
              selectedId={selectedId}
              theftActive={theftActive}
            />
          </div>
        </div>
      )}

      {/* Recovery mode banner */}
      {theftActive && (
        <div style={{ background: "#450a0a", borderBottom: "1px solid #ef4444", padding: "8px 24px", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", animation: "pulse 1s infinite", display: "inline-block", flexShrink: 0 }}/>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#ef4444", letterSpacing: "0.1em" }}>RECOVERY MODE ACTIVE</span>
          <span style={{ fontSize: 11, color: "#fca5a5" }}>DG-1028 · Forced entry detected · GPS ping rate: every 5 seconds</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {["Create Recovery Case", "Notify Operations", "Export Evidence Packet"].map((lbl) => (
              <button key={lbl} onClick={() => lbl === "Create Recovery Case" && goToRecoveryCase()}
                style={{ background: "#7f1d1d", color: "#fca5a5", border: "1px solid #ef4444", borderRadius: 6, padding: "4px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: "20px 24px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: "#f9fafb", margin: 0 }}>Fleet Command</h1>
              <span style={{ display: "flex", alignItems: "center", gap: 5, background: "#052e16", border: "1px solid #22c55e", color: "#86efac", fontSize: 10, fontWeight: 700, padding: "2px 10px", borderRadius: 20 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e", display: "inline-block", animation: "pulse 2s infinite" }}/>
                LIVE · {allDevices.length} DEVICES
              </span>
              {criticalCount > 0 && (
                <span style={{ background: "#450a0a", border: "1px solid #ef4444", color: "#fca5a5", fontSize: 10, fontWeight: 700, padding: "2px 10px", borderRadius: 20 }}>
                  {criticalCount} CRITICAL
                </span>
              )}
            </div>
            <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>Owlet Pilot Program · San Antonio / South Texas Region</p>
          </div>
          <button onClick={goToRecoveryCase}
            style={{ background: "#450a0a", border: "1px solid #ef4444", color: "#fca5a5", borderRadius: 10, padding: "9px 18px", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            🚨 Recovery Case
          </button>
        </div>

        {/* KPI Strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 10, marginBottom: 20 }}>
          <Stat label="Active Devices"       val="28"    sub="Fleet-wide"/>
          <Stat label="Trailers Secured"     val="24"    sub="Lock confirmed"/>
          <Stat label="Critical Alerts"      val={criticalCount} sub="Immediate action" accent="#ef4444"/>
          <Stat label="Warnings"             val={warningCount}  sub="Monitoring"       accent="#f59e0b"/>
          <Stat label="Cargo Protected"      val="$18.4M" sub="Active fleet"      accent="#60a5fa"/>
          <Stat label="Avg Response"         val="12 min" sub="Last 30 days"/>
        </div>

        {/* Main grid */}
        <div style={{ display: "grid", gridTemplateColumns: selectedDevice ? "1fr 340px" : "1fr 340px", gap: 16 }}>

          {/* Left — Map + Alerts */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Map */}
            <div style={{ background: "#0a0f1a", border: "1px solid #1f2937", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "10px 16px", borderBottom: "1px solid #1f2937", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", animation: "pulse 2s infinite", display: "inline-block" }}/>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em" }}>Live Fleet Map · South Texas</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ color: "#ef4444", fontSize: 10 }}>● {criticalCount} Critical</span>
                  <span style={{ color: "#f59e0b", fontSize: 10 }}>● {warningCount} Warning</span>
                  <span style={{ color: "#22c55e", fontSize: 10 }}>● {SECURE_DEVICES.length} Secure</span>
                  <button onClick={() => setMapFullscreen(true)}
                    style={{ background: "#1f2937", border: "1px solid #374151", color: "#9ca3af", borderRadius: 6, padding: "4px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                    ⛶ Full Screen
                  </button>
                </div>
              </div>
              <div style={{ height: 400, padding: 12 }}>
                <FleetMap
                  alerts={alerts}
                  secureDevices={SECURE_DEVICES}
                  onSelectDevice={handleSelectDevice}
                  selectedId={selectedId}
                  theftActive={theftActive}
                />
              </div>
            </div>

            {/* Alert Queue */}
            <div style={{ background: "#0a0f1a", border: "1px solid #1f2937", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "10px 16px", borderBottom: "1px solid #1f2937", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", animation: "pulse 1.5s infinite", display: "inline-block" }}/>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em" }}>Active Alert Queue</span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#ef4444" }}>{alerts.length} alerts</span>
              </div>
              <div style={{ padding: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {alerts.map((alert) => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    selected={selectedId === alert.id}
                    onClick={() => handleSelectDevice(alert.id)}
                    onNav={onNav}
                  />
                ))}
              </div>
            </div>

          </div>

          {/* Right — Device Detail */}
          <div style={{ position: "sticky", top: 20, maxHeight: "calc(100vh - 120px)", display: "flex", flexDirection: "column" }}>
            {selectedDevice ? (
              <DeviceDetail
                device={selectedDevice}
                theftActive={theftActive}
                onSimulateTheft={handleSimulateTheft}
                onClose={() => setSelectedId(null)}
                onNav={onNav}
              />
            ) : (
              <div style={{ background: "#0a0f1a", border: "1px dashed #1f2937", borderRadius: 12, padding: 32, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, minHeight: 300, color: "#374151", textAlign: "center" }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="1.5">
                  <rect x="5" y="2" width="14" height="20" rx="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/>
                </svg>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#4b5563" }}>No device selected</div>
                <div style={{ fontSize: 12, color: "#374151" }}>Click a pin on the map or an alert card</div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
