import { useState, useEffect, useRef, useCallback } from "react";
import { dispatchAlert } from "../lib/notifications.js";

// ── Config ────────────────────────────────────────────────────────────────────
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] };

// ── Supabase route helpers ───────────────────────────────────────────────────
async function fetchSavedRoutes() {
  try {
    const res = await fetch(SB_URL + "/rest/v1/saved_routes?select=*&order=created_at.desc", { headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY } });
    return await res.json();
  } catch { return []; }
}
async function saveRouteToSB(route) {
  try {
    await fetch(SB_URL + "/rest/v1/saved_routes", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, Prefer: "return=minimal" },
      body: JSON.stringify(route),
    });
  } catch {}
}
async function deleteRouteFromSB(id) {
  try {
    await fetch(SB_URL + "/rest/v1/saved_routes?id=eq." + id, { method: "DELETE", headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY } });
  } catch {}
}

async function logAuditEvent(action, operator, details, aiSummary) {
  try {
    await fetch(SB_URL + "/rest/v1/audit_log", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, Prefer: "return=minimal" },
      body: JSON.stringify({ action, operator, details, ai_summary: aiSummary }),
    });
  } catch {}
}

async function generateDeletionSummary(route, operator) {
  const prompt = `You are a Divvo Guardian security audit AI. An operator just deleted a monitored route.

Operator: ${operator}
Route Name: ${route.name}
Waypoints: ${route.waypoints?.length || 0} points
Corridor Width: ${route.corridor_meters || route.corridorMeters || 500}m
Assigned Device: ${route.assigned_device || route.assignedDevice || "all"}
Deleted At: ${new Date().toLocaleString("en-US")}

Write a 1-2 sentence professional audit log entry confirming this deletion. Note any security implications of removing this monitored corridor. Be concise and factual.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    return data.content?.[0]?.text || "Route deleted by operator.";
  } catch {
    return `Route "${route.name}" deleted by ${operator} at ${new Date().toLocaleString("en-US")}. Corridor monitoring for assigned devices has been deactivated.`;
  }
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function distanceFromRoute(lat, lon, waypoints) {
  if (!waypoints || waypoints.length < 2) return Infinity;
  let min = Infinity;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const [ax, ay] = waypoints[i], [bx, by] = waypoints[i+1];
    const dx = bx-ax, dy = by-ay;
    const t = Math.max(0, Math.min(1, ((lon-ax)*dx + (lat-ay)*dy) / (dx*dx+dy*dy)));
    const d = distanceMeters(lat, lon, ay+t*dy, ax+t*dx);
    if (d < min) min = d;
  }
  return min;
}

// ── Live devices & shipments ──────────────────────────────────────────────────
const DEVICES = [
  { id: "DG-1028", trailerId: "TRL-4482", lat: 27.5306, lon: -99.4803, severity: "Critical", type: "Lock Tamper Detected",           location: "I-35 N near Laredo, TX",          battery: 74, lte: "Strong",   camera: "Online",   door: "Closed",  lock: "Tampered", vibration: "Elevated", checkin: "10:14 AM", carrier: "Maersk Line",    cargo: "$840,000" },
  { id: "DG-1041", trailerId: "TRL-3391", lat: 27.8006, lon: -97.3964, severity: "Critical", type: "Door Opened Outside Geofence",    location: "US-281 near Corpus Christi, TX",   battery: 61, lte: "Moderate", camera: "Online",   door: "Open",    lock: "Unlocked", vibration: "Elevated", checkin: "10:09 AM", carrier: "Hapag-Lloyd",    cargo: "$1,200,000" },
  { id: "DG-0994", trailerId: "TRL-8820", lat: 29.4241, lon: -98.4936, severity: "Warning",  type: "Battery Below 18%",               location: "I-10 W near San Antonio, TX",      battery: 17, lte: "Strong",   camera: "Online",   door: "Closed",  lock: "Secure",   vibration: "Normal",   checkin: "09:52 AM", carrier: "COSCO Shipping", cargo: "$560,000" },
  { id: "DG-1102", trailerId: "TRL-5567", lat: 29.5736, lon: -98.6947, severity: "Warning",  type: "GPS Signal Degraded",             location: "FM-2252 near Helotes, TX",         battery: 88, lte: "Weak",    camera: "Degraded", door: "Closed",  lock: "Secure",   vibration: "Normal",   checkin: "09:38 AM", carrier: "Evergreen",      cargo: "$320,000" },
  { id: "DG-1055", trailerId: "TRL-2210", lat: 29.3787, lon: -98.5531, severity: "Secure",   type: "All Systems Normal",              location: "I-410 Loop, San Antonio TX",       battery: 92, lte: "Strong",   camera: "Online",   door: "Closed",  lock: "Secure",   vibration: "Normal",   checkin: "10:18 AM", carrier: "Maersk Line",    cargo: "$420,000" },
  { id: "DG-1076", trailerId: "TRL-7714", lat: 29.7282, lon: -95.2713, severity: "Secure",   type: "All Systems Normal",              location: "Port of Houston — Bay 14",         battery: 78, lte: "Strong",   camera: "Online",   door: "Closed",  lock: "Secure",   vibration: "Normal",   checkin: "10:15 AM", carrier: "COSCO Shipping", cargo: "$980,000" },
  { id: "DG-1088", trailerId: "TRL-3305", lat: 29.7030, lon: -98.0810, severity: "Secure",   type: "All Systems Normal",              location: "I-35 S near New Braunfels TX",     battery: 85, lte: "Strong",   camera: "Online",   door: "Closed",  lock: "Secure",   vibration: "Normal",   checkin: "10:12 AM", carrier: "Hapag-Lloyd",    cargo: "$650,000" },
  { id: "DG-1099", trailerId: "TRL-9921", lat: 29.5688, lon: -97.9641, severity: "Secure",   type: "All Systems Normal",              location: "IH-10 E near Seguin TX",          battery: 69, lte: "Strong",   camera: "Online",   door: "Closed",  lock: "Secure",   vibration: "Normal",   checkin: "10:08 AM", carrier: "Evergreen",      cargo: "$290,000" },
];

const SHIPMENT_ROUTES = [
  { id: "OWL-SAV-1003", severity: "Critical", from: [-81.0998, 32.0835], to: [-84.3880, 33.7490], label: "Savannah → Atlanta", cargo: "$3.1M", carrier: "Hapag-Lloyd",    origin: "Savannah, GA",   destination: "Atlanta, GA" },
  { id: "OWL-HOU-1001", severity: "High",     from: [-95.3698, 29.7604], to: [-118.2437, 34.0522], label: "Houston → LA",       cargo: "$2.4M", carrier: "Maersk Line",    origin: "Houston, TX",    destination: "Los Angeles, CA" },
];

// Device shipment context for routing
const DEVICE_SHIPMENT_CONTEXT = {
  "DG-1028": { origin: "Laredo, TX",          destination: "San Antonio, TX", carrier: "Maersk Line",    cargo: "$840,000" },
  "DG-1041": { origin: "Corpus Christi, TX",  destination: "Houston, TX",     carrier: "Hapag-Lloyd",    cargo: "$1,200,000" },
  "DG-0994": { origin: "San Antonio, TX",     destination: "Dallas, TX",      carrier: "COSCO Shipping", cargo: "$560,000" },
  "DG-1102": { origin: "Helotes, TX",         destination: "San Antonio, TX", carrier: "Evergreen",      cargo: "$320,000" },
  "DG-1055": { origin: "San Antonio, TX",     destination: "Austin, TX",      carrier: "Maersk Line",    cargo: "$420,000" },
  "DG-1076": { origin: "Houston, TX",         destination: "New Orleans, LA", carrier: "COSCO Shipping", cargo: "$980,000" },
  "DG-1088": { origin: "New Braunfels, TX",   destination: "San Antonio, TX", carrier: "Hapag-Lloyd",    cargo: "$650,000" },
  "DG-1099": { origin: "Seguin, TX",          destination: "Houston, TX",     carrier: "Evergreen",      cargo: "$290,000" },
};

// ── AI Response Generator ─────────────────────────────────────────────────────
async function generateAIResponse(device) {
  const prompt = `You are the AI operations center for Divvo Guardian, a cargo security platform. 
Analyze this alert and generate a structured response for a single operator.

Device: ${device.id} | Trailer: ${device.trailerId}
Alert Type: ${device.type}
Severity: ${device.severity}
Location: ${device.location}
Carrier: ${device.carrier}
Cargo Value: ${device.cargo}
Lock Status: ${device.lock}
Door: ${device.door}
Battery: ${device.battery}%
LTE: ${device.lte}
Vibration: ${device.vibration}
Camera: ${device.camera}
Last Check-in: ${device.checkin}

Respond ONLY with valid JSON, no markdown, no backticks:
{
  "situation": "2-3 sentence plain English assessment of what is happening and severity",
  "threat_level": "CRITICAL" or "HIGH" or "MEDIUM" or "LOW",
  "ai_actions_taken": ["action 1", "action 2", "action 3"],
  "operator_must_do": ["exact action 1", "exact action 2"],
  "do_not": "one critical thing operator must NOT do",
  "evidence_status": "brief status of evidence collection",
  "escalate_le": true or false,
  "estimated_response_window": "e.g. Act within 8 minutes"
}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    const text = data.content?.[0]?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch (e) {
    return {
      situation: `${device.type} detected on ${device.id} at ${device.location}. Cargo value ${device.cargo}. Immediate operator attention required.`,
      threat_level: device.severity === "Critical" ? "CRITICAL" : "MEDIUM",
      ai_actions_taken: ["GPS history captured", "Evidence packet initiated", "Carrier notified via system"],
      operator_must_do: ["Call driver immediately", device.severity === "Critical" ? "Dispatch law enforcement" : "Monitor situation"],
      do_not: "Do not alert the driver if theft is suspected",
      evidence_status: "GPS log and sensor data captured automatically",
      escalate_le: device.severity === "Critical",
      estimated_response_window: device.severity === "Critical" ? "Act within 5 minutes" : "Review within 15 minutes",
    };
  }
}

// ── AI Route Generator ───────────────────────────────────────────────────────
async function geocode(place) {
  // Use Mapbox Geocoding v6 with full URL
  const encoded = encodeURIComponent(place.trim());
  const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encoded}&access_token=${MAPBOX_TOKEN}&limit=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocode failed ${res.status}: ${place}`);
  const data = await res.json();
  const feat = data.features?.[0];
  if (!feat) throw new Error(`No results for: ${place}`);
  // v6 returns coordinates in geometry
  return feat.geometry.coordinates; // [lng, lat]
}

async function getMapboxRoute(originCoord, destCoord) {
  const coords = `${originCoord[0]},${originCoord[1]};${destCoord[0]},${destCoord[1]}`;
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&steps=false&access_token=${MAPBOX_TOKEN}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Directions API failed: ${res.status}`);
  const data = await res.json();
  if (data.code !== "Ok" || !data.routes?.length) throw new Error(`No route found: ${data.message || data.code}`);
  const route = data.routes[0];
  const allCoords = route.geometry.coordinates;
  // Sample up to 20 evenly spaced waypoints
  const total = allCoords.length;
  const samples = Math.min(20, total);
  const step = Math.max(1, Math.floor(total / samples));
  const waypoints = [];
  for (let i = 0; i < total; i += step) waypoints.push(allCoords[i]);
  if (waypoints[waypoints.length-1] !== allCoords[total-1]) waypoints.push(allCoords[total-1]);
  return {
    waypoints,
    distanceMiles: Math.round(route.distance / 1609.34),
    durationHours: (route.duration / 3600).toFixed(1),
  };
}

async function generateAIRoute(origin, destination, carrier, cargoValue) {
  let geocodeError = null;
  let routeError = null;
  let originCoord, destCoord, routeData;

  // Step 1: Geocode
  try {
    [originCoord, destCoord] = await Promise.all([geocode(origin), geocode(destination)]);
  } catch(e) {
    geocodeError = e.message;
    console.error("Geocode error:", e);
  }

  // Step 2: Get real driving route
  if (!geocodeError) {
    try {
      routeData = await getMapboxRoute(originCoord, destCoord);
    } catch(e) {
      routeError = e.message;
      console.error("Route error:", e);
    }
  }

  // Step 3: Claude security analysis
  const distStr = routeData ? routeData.distanceMiles + " miles" : "unknown distance";
  const durStr  = routeData ? routeData.durationHours + " hours" : "unknown duration";

  const analysisPrompt = `You are a cargo security analyst for Divvo Guardian.
Analyze this shipment route for security risks.

Origin: ${origin}
Destination: ${destination}
Carrier: ${carrier}
Cargo Value: ${cargoValue}
Distance: ${distStr}
Drive Time: ${durStr}

Return ONLY valid JSON, no markdown, no backticks:
{
  "route_name": "${origin} → ${destination}",
  "summary": "2 sentence security assessment",
  "corridor_meters": 800,
  "risk_level": "Low",
  "security_notes": "key checkpoints or risk areas",
  "recommended_stops": ["stop 1", "stop 2"]
}`;

  let analysis = {
    route_name: `${origin} → ${destination}`,
    summary: "Direct route selected for cargo security. Monitoring active for full transit duration.",
    corridor_meters: 800,
    risk_level: "Medium",
    security_notes: "Monitor for signal loss in rural stretches.",
    recommended_stops: [],
  };

  try {
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        messages: [{ role: "user", content: analysisPrompt }],
      }),
    });
    const aiData = await aiRes.json();
    const text = aiData.content?.[0]?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    analysis = { ...analysis, ...parsed };
  } catch(e) {
    console.warn("AI analysis fallback:", e);
  }

  // If we got real route data, use it
  if (routeData) {
    return {
      ...analysis,
      waypoints: routeData.waypoints,
      estimated_distance_miles: routeData.distanceMiles,
      estimated_drive_hours: routeData.durationHours,
      _geocodeError: null,
    };
  }

  // Fallback: tell user what went wrong
  return {
    ...analysis,
    waypoints: originCoord && destCoord ? [originCoord, destCoord] : [[-95.3698, 29.7604], [-98.4936, 29.4241]],
    estimated_distance_miles: "N/A",
    estimated_drive_hours: "N/A",
    _geocodeError: geocodeError || routeError || "Could not calculate route",
  };
}

// ── WebRTC helpers ────────────────────────────────────────────────────────────
async function sendSignal(slotId, type, payload) {
  await fetch(SB_URL + "/rest/v1/webrtc_signals", {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, Prefer: "return=minimal" },
    body: JSON.stringify({ device_id: slotId + "-viewer", type, payload }),
  });
}
async function pollSignal(slotId, type) {
  const res = await fetch(
    SB_URL + "/rest/v1/webrtc_signals?device_id=eq." + slotId + "-cam&type=eq." + type + "&order=created_at.desc&limit=1",
    { headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY } }
  );
  const rows = await res.json();
  return rows?.[0] ?? null;
}

// ── Inline Camera Feed ────────────────────────────────────────────────────────
function CamFeed({ slotId, label }) {
  const videoRef = useRef(null);
  const pcRef    = useRef(null);
  const intRef   = useRef(null);
  const [status, setStatus] = useState("idle");
  const [zoom, setZoom]     = useState(1);
  const [ir, setIr]         = useState(false);

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
          const tryPlay = () => { const p = videoRef.current?.play(); if (p) p.catch(() => setTimeout(tryPlay, 500)); };
          tryPlay();
          setStatus("live");
        }
      };
      pc.onconnectionstatechange = () => { if (pc.connectionState === "failed" || pc.connectionState === "disconnected") { setStatus("error"); } };
      pc.onicecandidate = async (e) => { if (e.candidate) await sendSignal(slotId, "ice-viewer", { candidate: e.candidate }); };
      const offer = await pc.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: false });
      await pc.setLocalDescription(offer);
      await sendSignal(slotId, "offer", { sdp: offer });
      let t = 0;
      intRef.current = setInterval(async () => {
        if (++t > 30) { clearInterval(intRef.current); setStatus("error"); return; }
        const row = await pollSignal(slotId, "answer");
        if (row?.payload?.sdp && pc.signalingState === "have-local-offer") {
          clearInterval(intRef.current);
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
    } catch { setStatus("error"); }
  };

  const disconnect = () => {
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    if (intRef.current) clearInterval(intRef.current);
    if (videoRef.current) { videoRef.current.srcObject = null; videoRef.current.style.transform = "scale(1)"; videoRef.current.style.filter = "none"; }
    setStatus("idle"); setZoom(1); setIr(false);
  };

  useEffect(() => () => disconnect(), []);

  const isLive = status === "live";
  const dotCol = isLive ? "#22c55e" : status === "calling" || status === "connecting" ? "#f59e0b" : status === "error" ? "#ef4444" : "#374151";

  return (
    <div style={{ background: "#030712", border: `1px solid ${isLive ? "#22c55e33" : "#1f2937"}`, borderRadius: 6, overflow: "hidden" }}>
      <div style={{ padding: "4px 8px", background: "#0d1117", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: dotCol, display: "inline-block", animation: isLive || status === "calling" ? "pulse 1.5s infinite" : "none" }}/>
          <span style={{ fontSize: 9, fontWeight: 700, color: "#9ca3af" }}>{label}</span>
        </div>
        {isLive && <button onClick={(e) => { e.stopPropagation(); disconnect(); }} style={{ background: "none", border: "none", color: "#ef444480", cursor: "pointer", fontSize: 9 }}>✕</button>}
      </div>
      <div style={{ position: "relative", background: "#000", height: 80, cursor: isLive ? "default" : "pointer" }} onClick={!isLive ? connect : undefined}>
        <video ref={videoRef} autoPlay playsInline muted
          style={{ width: "100%", height: "100%", objectFit: "cover", display: isLive ? "block" : "none", transform: `scale(${zoom})`, transformOrigin: "center", filter: ir ? "grayscale(100%) brightness(140%) contrast(160%)" : "none" }}
          onLoadedMetadata={e => e.target.play()}
        />
        {!isLive && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3 }}>
            {(status === "calling" || status === "connecting") ? (
              <><div style={{ width: 12, height: 12, border: "1.5px solid #f59e0b", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }}/><span style={{ fontSize: 8, color: "#f59e0b" }}>Connecting...</span></>
            ) : status === "error" ? (
              <><span style={{ fontSize: 12 }}>⚠</span><span style={{ fontSize: 8, color: "#ef4444" }}>No signal</span></>
            ) : (
              <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="1.5"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg><span style={{ fontSize: 8, color: "#374151" }}>Tap to connect</span></>
            )}
          </div>
        )}
        {isLive && <div style={{ position: "absolute", top: 3, left: 3, background: "rgba(127,29,29,0.9)", border: "1px solid #ef4444", borderRadius: 3, padding: "1px 5px", fontSize: 7, fontWeight: 700, color: "#fca5a5" }}>● REC</div>}
      </div>
      {isLive && (
        <div style={{ padding: "3px 6px", background: "#0a0f1a", display: "flex", alignItems: "center", gap: 4 }}>
          <input type="range" min="1" max="4" step="0.5" value={zoom} onChange={e => { setZoom(parseFloat(e.target.value)); }} style={{ flex: 1, accentColor: "#2563eb", height: 2 }}/>
          <span style={{ fontSize: 8, color: "#60a5fa", minWidth: 20 }}>{zoom}x</span>
          <button onClick={() => { const next = !ir; setIr(next); if (videoRef.current) videoRef.current.style.filter = next ? "grayscale(100%) brightness(140%) contrast(160%)" : "none"; }}
            style={{ background: ir ? "#052e16" : "#111827", border: `1px solid ${ir ? "#22c55e" : "#374151"}`, color: ir ? "#86efac" : "#6b7280", borderRadius: 3, padding: "1px 4px", fontSize: 8, cursor: "pointer" }}>
            🌙
          </button>
        </div>
      )}
    </div>
  );
}

// ── Route Deletion Modal ─────────────────────────────────────────────────────
function RouteDeletionModal({ route, operator, onConfirm, onCancel }) {
  const [loading, setLoading]     = useState(false);
  const [aiSummary, setAiSummary] = useState(null);
  const [reason, setReason]       = useState("");

  useEffect(() => {
    // Pre-generate AI summary while operator reviews
    generateDeletionSummary(route, operator).then(setAiSummary);
  }, [route.id]);

  const handleConfirm = async () => {
    setLoading(true);
    const summary = aiSummary || `Route "${route.name}" deleted by ${operator}.`;
    await logAuditEvent(
      "ROUTE_DELETED",
      operator,
      { routeId: route.id, routeName: route.name, waypoints: route.waypoints?.length, corridor: route.corridor_meters || route.corridorMeters, reason: reason || "No reason provided" },
      summary
    );
    onConfirm(route.id);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#0a0f1a", border: "1px solid #ef4444", borderRadius: 14, width: "100%", maxWidth: 460, overflow: "hidden", boxShadow: "0 24px 64px rgba(0,0,0,0.8)" }}>
        {/* Header */}
        <div style={{ background: "#450a0a", borderBottom: "1px solid #ef444444", padding: "14px 18px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", animation: "pulse 1s infinite", display: "inline-block" }}/>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#fca5a5" }}>Confirm Route Deletion</div>
            <div style={{ fontSize: 11, color: "#ef444480", marginTop: 1 }}>This action will be logged and cannot be undone</div>
          </div>
        </div>

        <div style={{ padding: 18 }}>
          {/* Route info */}
          <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Route Being Deleted</div>
            {[
              ["Route Name", route.name],
              ["Waypoints", (route.waypoints?.length || 0) + " points"],
              ["Corridor", (route.corridor_meters || route.corridorMeters || 500) + "m each side"],
              ["Assigned To", route.assigned_device || route.assignedDevice || "All devices"],
              ["Deleted By", operator],
              ["Timestamp", new Date().toLocaleString("en-US")],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #111827", fontSize: 12 }}>
                <span style={{ color: "#6b7280" }}>{k}</span>
                <span style={{ color: "#d1d5db", fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>

          {/* AI Summary */}
          <div style={{ background: "#1e3a8a22", border: "1px solid #2563eb33", borderRadius: 10, padding: "10px 12px", marginBottom: 14 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontSize: 11 }}>🤖</span> AI Audit Summary
            </div>
            {aiSummary ? (
              <p style={{ fontSize: 11, color: "#93c5fd", lineHeight: 1.6, margin: 0 }}>{aiSummary}</p>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 10, height: 10, border: "1.5px solid #2563eb", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }}/>
                <span style={{ fontSize: 11, color: "#6b7280" }}>AI generating audit summary...</span>
              </div>
            )}
          </div>

          {/* Reason input */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Reason for Deletion (optional)</div>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Route completed, shipment delivered · Rerouting due to weather · Updated corridor required..."
              rows={2}
              style={{ width: "100%", background: "#111827", border: "1px solid #1f2937", borderRadius: 8, padding: "8px 10px", color: "#d1d5db", fontSize: 12, resize: "none", outline: "none", fontFamily: "inherit", lineHeight: 1.5 }}
            />
          </div>

          {/* Buttons */}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onCancel}
              style={{ flex: 1, background: "#111827", border: "1px solid #374151", color: "#9ca3af", borderRadius: 9, padding: "10px 0", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              Cancel
            </button>
            <button onClick={handleConfirm} disabled={loading}
              style={{ flex: 1, background: loading ? "#7f1d1d80" : "#7f1d1d", border: "1px solid #ef4444", color: "#fca5a5", borderRadius: 9, padding: "10px 0", fontSize: 12, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              {loading ? (
                <><div style={{ width: 12, height: 12, border: "1.5px solid #fca5a5", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }}/> Logging...</>
              ) : "Confirm Delete & Log"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── AI Route Simulation Panel ────────────────────────────────────────────────
function AIRoutePanel({ onRouteGenerated, onClose, prefill }) {
  const [origin, setOrigin]           = useState(prefill?.origin || "Houston, TX");
  const [destination, setDestination] = useState(prefill?.destination || "San Antonio, TX");
  const [carrier, setCarrier]         = useState(prefill?.carrier || "Maersk Line");
  const [cargoValue, setCargoValue]   = useState(prefill?.cargo || "$840,000");

  // Update fields when prefill changes
  useEffect(() => {
    if (prefill) {
      setOrigin(prefill.origin || "Houston, TX");
      setDestination(prefill.destination || "San Antonio, TX");
      setCarrier(prefill.carrier || "Maersk Line");
      setCargoValue(prefill.cargo || "$840,000");
    }
  }, [prefill?.origin, prefill?.destination]);
  const [loading, setLoading]         = useState(false);
  const [result, setResult]           = useState(null);
  const [step, setStep]               = useState(0);
  const [corridorMeters, setCorridorMeters] = useState(800);

  const STEPS = ["Analyzing origin & destination...", "Calculating optimal highway route...", "Checking high-risk zones...", "Setting security corridor...", "Route ready"];

  const generate = async () => {
    setLoading(true);
    setResult(null);
    setStep(0);
    // Animate steps
    for (let i = 0; i < STEPS.length - 1; i++) {
      await new Promise(r => setTimeout(r, 600));
      setStep(i + 1);
    }
    const route = await generateAIRoute(origin, destination, carrier, cargoValue);
    setResult(route);
    setCorridorMeters(route.corridor_meters || 800);
    setLoading(false);
  };

  const applyRoute = () => {
    if (!result) return;
    onRouteGenerated({
      name: result.route_name,
      waypoints: result.waypoints,
      corridorMeters,
      assignedDevice: "all",
      created_at: new Date().toISOString(),
    });
    onClose();
  };

  const riskColor = result?.risk_level === "High" ? "#ef4444" : result?.risk_level === "Medium" ? "#f59e0b" : "#22c55e";

  return (
    <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 300, background: "rgba(7,13,23,0.97)", borderLeft: "1px solid #1f2937", zIndex: 20, display: "flex", flexDirection: "column", overflowY: "auto", backdropFilter: "blur(4px)" }}>
      {/* Header */}
      <div style={{ padding: "12px 14px", borderBottom: "1px solid #1f2937", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#f9fafb", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 14 }}>🤖</span> AI Route Planner
          </div>
          <div style={{ fontSize: 10, color: "#6b7280", marginTop: 1 }}>AI generates and draws the optimal secure route</div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 18 }}>×</button>
      </div>

      <div style={{ flex: 1, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Shipment inputs */}
        {[
          { label: "Origin", value: origin, set: setOrigin, placeholder: "e.g. Houston, TX" },
          { label: "Destination", value: destination, set: setDestination, placeholder: "e.g. San Antonio, TX" },
          { label: "Carrier", value: carrier, set: setCarrier, placeholder: "e.g. Maersk Line" },
          { label: "Cargo Value", value: cargoValue, set: setCargoValue, placeholder: "e.g. $840,000" },
        ].map(({ label, value, set, placeholder }) => (
          <div key={label}>
            <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{label}</div>
            <input value={value} onChange={e => set(e.target.value)} placeholder={placeholder}
              style={{ width: "100%", background: "#111827", border: "1px solid #1f2937", borderRadius: 7, padding: "7px 10px", color: "#f9fafb", fontSize: 12, outline: "none" }}/>
          </div>
        ))}

        {/* Presets */}
        <div>
          <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Quick Presets</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
            {[
              { label: "Houston → SA", o: "Houston, TX", d: "San Antonio, TX" },
              { label: "Houston → Dallas", o: "Houston, TX", d: "Dallas, TX" },
              { label: "Laredo → SA", o: "Laredo, TX", d: "San Antonio, TX" },
              { label: "SA → Corpus", o: "San Antonio, TX", d: "Corpus Christi, TX" },
            ].map(p => (
              <button key={p.label} onClick={() => { setOrigin(p.o); setDestination(p.d); }}
                style={{ background: "#0a0f1a", border: "1px solid #1f2937", color: "#9ca3af", borderRadius: 6, padding: "5px 8px", fontSize: 10, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Generate button */}
        <button onClick={generate} disabled={loading}
          style={{ width: "100%", background: loading ? "#1e3a8a80" : "#2563eb", border: "none", color: "white", borderRadius: 8, padding: "10px 0", fontSize: 12, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {loading ? (
            <><div style={{ width: 14, height: 14, border: "2px solid white", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }}/> Generating...</>
          ) : "🤖 Generate AI Route"}
        </button>

        {/* Loading steps */}
        {loading && (
          <div style={{ background: "#0a0f1a", border: "1px solid #1f2937", borderRadius: 10, padding: "10px 12px" }}>
            {STEPS.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: i < step ? "#22c55e" : i === step ? "#2563eb" : "#374151", flexShrink: 0, animation: i === step ? "pulse 1s infinite" : "none" }}/>
                <span style={{ fontSize: 11, color: i < step ? "#86efac" : i === step ? "#93c5fd" : "#374151" }}>{s}</span>
              </div>
            ))}
          </div>
        )}

        {/* AI Result */}
        {result && !loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ background: "#052e1620", border: "1px solid #22c55e33", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#22c55e", marginBottom: 6 }}>✓ Route Generated</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#f9fafb", marginBottom: 4 }}>{result.route_name}</div>
              <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.5 }}>{result.summary}</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {[
                { label: "Distance", value: result.estimated_distance_miles + " mi" },
                { label: "Drive Time", value: result.estimated_drive_hours + " hrs" },
                { label: "Risk Level", value: result.risk_level, color: riskColor },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: "#0a0f1a", border: "1px solid #1f2937", borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: color || "#f9fafb" }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Geofence / corridor width — adjustable */}
            <div style={{ background: "#0a0f1a", border: "1px solid #1f2937", borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>
                Geofence Corridor — {corridorMeters >= 1000 ? (corridorMeters/1000).toFixed(1) + "km" : corridorMeters + "m"} each side
              </div>
              <input type="range" min="100" max="2000" step="100" value={corridorMeters} onChange={e => setCorridorMeters(Number(e.target.value))}
                style={{ width: "100%", accentColor: "#2563eb" }}/>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#4b5563", marginTop: 2 }}>
                <span>100m tight</span><span>1km normal</span><span>2km loose</span>
              </div>
            </div>

            {result._geocodeError && (
              <div style={{ background: "#450a0a", border: "1px solid #ef4444", borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ fontSize: 9, color: "#ef4444", fontWeight: 700, marginBottom: 3 }}>⚠ Route Error</div>
                <div style={{ fontSize: 11, color: "#fca5a5" }}>{result._geocodeError}</div>
                <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>Try adding state abbreviation e.g. "Orlando, FL" or "San Antonio, TX"</div>
              </div>
            )}

            {result.security_notes && (
              <div style={{ background: "#1a120033", border: "1px solid #f59e0b33", borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ fontSize: 9, color: "#f59e0b", fontWeight: 700, marginBottom: 3 }}>⚠ Security Notes</div>
                <div style={{ fontSize: 11, color: "#fcd34d" }}>{result.security_notes}</div>
              </div>
            )}

            {result.recommended_stops?.length > 0 && (
              <div>
                <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>Recommended Check-in Stops</div>
                {result.recommended_stops.map((stop, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", borderBottom: "1px solid #111827" }}>
                    <span style={{ fontSize: 10, color: "#4b5563" }}>{i + 1}.</span>
                    <span style={{ fontSize: 11, color: "#d1d5db" }}>{stop}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={applyRoute}
                disabled={!!result._geocodeError}
                style={{ flex: 1, background: result._geocodeError ? "#111827" : "#2563eb", border: "none", color: result._geocodeError ? "#4b5563" : "white", borderRadius: 8, padding: "10px 0", fontSize: 12, fontWeight: 700, cursor: result._geocodeError ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {result._geocodeError ? "Fix error first" : "✓ Apply to Map"}
              </button>
              <button onClick={() => setResult(null)}
                style={{ background: "#450a0a", border: "1px solid #ef4444", color: "#fca5a5", borderRadius: 8, padding: "10px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                ✕ Clear
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Route Manager Panel ──────────────────────────────────────────────────────
function RouteManagerPanel({ savedRoutes, waypointCount, onSave, onUndo, onClear, onDelete, onClose }) {
  const [routeName, setRouteName] = useState("");
  const [corridorMeters, setCorridorMeters] = useState(500);
  const [assignedDevice, setAssignedDevice] = useState("all");

  return (
    <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 260, background: "rgba(7,13,23,0.97)", borderLeft: "1px solid #1f2937", zIndex: 20, display: "flex", flexDirection: "column", padding: 14, overflowY: "auto", backdropFilter: "blur(4px)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#f9fafb" }}>Route Manager</div>
          <div style={{ fontSize: 10, color: "#6b7280", marginTop: 1 }}>Click map to place waypoints</div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 18 }}>×</button>
      </div>

      {/* Drawing status */}
      <div style={{ background: "#1e3a8a22", border: "1px solid #2563eb44", borderRadius: 8, padding: "8px 10px", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#3b82f6", animation: "pulse 1.5s infinite", display: "inline-block" }}/>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#60a5fa" }}>DRAWING MODE ACTIVE</span>
        </div>
        <div style={{ fontSize: 11, color: "#93c5fd" }}>
          {waypointCount === 0 ? "Click anywhere on the map to place first waypoint" : waypointCount + " waypoint" + (waypointCount > 1 ? "s" : "") + " placed — keep clicking to extend route"}
        </div>
      </div>

      {/* Route name */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>Route Name</div>
        <input value={routeName} onChange={e => setRouteName(e.target.value)} placeholder="e.g. Houston → San Antonio"
          style={{ width: "100%", background: "#111827", border: "1px solid #1f2937", borderRadius: 7, padding: "7px 10px", color: "#f9fafb", fontSize: 12, outline: "none" }}/>
      </div>

      {/* Corridor width */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>
          Corridor Width — {corridorMeters >= 1000 ? (corridorMeters/1000).toFixed(1) + "km" : corridorMeters + "m"} each side
        </div>
        <input type="range" min="100" max="2000" step="100" value={corridorMeters} onChange={e => setCorridorMeters(Number(e.target.value))}
          style={{ width: "100%", accentColor: "#2563eb" }}/>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#4b5563", marginTop: 2 }}>
          <span>100m tight</span><span>1km normal</span><span>2km loose</span>
        </div>
      </div>

      {/* Assign to device */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>Assign to Device</div>
        <select value={assignedDevice} onChange={e => setAssignedDevice(e.target.value)}
          style={{ width: "100%", background: "#111827", border: "1px solid #1f2937", borderRadius: 7, padding: "7px 10px", color: "#f9fafb", fontSize: 12, outline: "none" }}>
          <option value="all">All Devices</option>
          <option value="device-1">Phone 1 — Green</option>
          <option value="device-2">Phone 2 — Blue</option>
          <option value="device-3">Phone 3 — Amber</option>
        </select>
      </div>

      {/* Save / undo / clear */}
      <button onClick={() => { if (waypointCount >= 2) onSave({ name: routeName || "Unnamed Route", corridorMeters, assignedDevice }); }}
        disabled={waypointCount < 2}
        style={{ width: "100%", background: waypointCount >= 2 ? "#2563eb" : "#111827", border: "none", color: waypointCount >= 2 ? "white" : "#4b5563", borderRadius: 8, padding: "9px 0", fontSize: 12, fontWeight: 700, cursor: waypointCount >= 2 ? "pointer" : "not-allowed", marginBottom: 6 }}>
        {waypointCount < 2 ? "Place at least 2 waypoints" : "Save Route (" + waypointCount + " points)"}
      </button>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <button onClick={onUndo} disabled={waypointCount === 0}
          style={{ flex: 1, background: waypointCount > 0 ? "#1f2937" : "#0d1117", border: "1px solid #374151", color: waypointCount > 0 ? "#d1d5db" : "#374151", borderRadius: 7, padding: "6px 0", fontSize: 11, fontWeight: 700, cursor: waypointCount > 0 ? "pointer" : "not-allowed" }}>
          ↩ Undo
        </button>
        <button onClick={onClear} disabled={waypointCount === 0}
          style={{ flex: 1, background: waypointCount > 0 ? "#450a0a" : "#0d1117", border: "1px solid " + (waypointCount > 0 ? "#ef4444" : "#374151"), color: waypointCount > 0 ? "#fca5a5" : "#374151", borderRadius: 7, padding: "6px 0", fontSize: 11, fontWeight: 700, cursor: waypointCount > 0 ? "pointer" : "not-allowed" }}>
          ✕ Clear
        </button>
      </div>

      {/* Saved routes */}
      {savedRoutes.length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Saved Routes ({savedRoutes.length})</div>
          {savedRoutes.map(r => (
            <div key={r.id} style={{ background: "#0a0f1a", border: "1px solid #1f2937", borderRadius: 8, padding: "8px 10px", marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#f9fafb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                  <div style={{ fontSize: 10, color: "#6b7280" }}>{r.waypoints?.length} pts · {r.corridor_meters || r.corridorMeters}m · {r.assigned_device || r.assignedDevice}</div>
                </div>
                <button onClick={() => onDelete(r.id)}
                  style={{ background: "#450a0a", border: "1px solid #ef444466", color: "#fca5a5", borderRadius: 5, padding: "3px 8px", fontSize: 10, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button onClick={onClose} style={{ marginTop: "auto", background: "none", border: "1px solid #1f2937", color: "#6b7280", borderRadius: 7, padding: "6px 0", fontSize: 11, cursor: "pointer" }}>Cancel</button>
    </div>
  );
}

// ── Mapbox Map ────────────────────────────────────────────────────────────────
function LiveMap({ devices, onSelect, selectedId, fullscreen, onFullscreen, savedRoutes, onRouteSave, onRouteDelete, routeDeviations }) {
  const mapContainer      = useRef(null);
  const map               = useRef(null);
  const mapInitStarted    = useRef(false);
  const markersRef        = useRef({});
  const waypointMarkersRef = useRef([]);
  const [loaded, setLoaded]         = useState(false);
  const [drawingMode, setDrawingMode] = useState(false);
  const [waypoints, setWaypoints]   = useState([]);
  const [showRoutePanel, setShowRoutePanel] = useState(false);
  const [showAIRoutePanel, setShowAIRoutePanel] = useState(false);
  const [aiPrefill, setAiPrefill]   = useState(null);

  // Listen for Route Shipment events from alert panel
  useEffect(() => {
    const handler = (e) => {
      setAiPrefill(e.detail);
      setShowAIRoutePanel(true);
      setShowRoutePanel(false);
      setDrawingMode(false);
    };
    window.addEventListener("open-ai-route-panel", handler);
    return () => window.removeEventListener("open-ai-route-panel", handler);
  }, []);

  useEffect(() => {
    // Guards against React StrictMode's double-invoke: map.current isn't set until
    // the async script.onload fires, so checking only map.current here would let a
    // second invocation race past this check and create a second Mapbox instance —
    // both wiring "load" handlers that add the same route sources to the same
    // eventual map.current, causing "There is already a source with ID ..." errors.
    if (mapInitStarted.current || !mapContainer.current) return;
    mapInitStarted.current = true;
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
        center: [-98.8, 28.8],
        zoom: fullscreen ? 6.2 : 5.8,
      });
      map.current.addControl(new window.mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      map.current.on("load", () => {
        setLoaded(true);
        // Add shipment routes
        SHIPMENT_ROUTES.forEach(route => {
          const color = route.severity === "Critical" ? "#ef4444" : "#f97316";
          map.current.addSource("route-" + route.id, { type: "geojson", data: { type: "Feature", geometry: { type: "LineString", coordinates: [route.from, route.to] } } });
          map.current.addLayer({ id: "route-" + route.id, type: "line", source: "route-" + route.id, paint: { "line-color": color, "line-width": 2, "line-dasharray": [3, 3], "line-opacity": 0.6 } });
        });
      });

      // Map click for drawing waypoints
      map.current.on("click", (e) => {
        setDrawingMode(dm => {
          if (dm) {
            const coord = [e.lngLat.lng, e.lngLat.lat];
            setWaypoints(prev => {
              const next = [...prev, coord];
              // Draw line on map
              const geojson = { type: "Feature", geometry: { type: "LineString", coordinates: next } };
              if (map.current.getSource("drawing-route")) {
                map.current.getSource("drawing-route").setData(geojson);
              } else {
                map.current.addSource("drawing-route", { type: "geojson", data: geojson });
                map.current.addLayer({ id: "drawing-route-line", type: "line", source: "drawing-route", paint: { "line-color": "#3b82f6", "line-width": 3, "line-dasharray": [2, 2] } });
              }
              // Add waypoint marker
              const el = document.createElement("div");
              el.style.cssText = "width:16px;height:16px;border-radius:50%;background:#3b82f6;border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:8px;color:white;font-weight:bold;";
              el.textContent = next.length;
              const marker = new window.mapboxgl.Marker(el).setLngLat(coord).addTo(map.current);
              waypointMarkersRef.current.push(marker);
              return next;
            });
          }
          return dm;
        });
      });
    };
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!loaded || !window.mapboxgl) return;
    devices.forEach(device => {
      const color = device.severity === "Critical" ? "#ef4444" : device.severity === "Warning" ? "#f59e0b" : "#22c55e";
      const isSelected = device.id === selectedId;
      if (markersRef.current[device.id]) {
        const el = markersRef.current[device.id]._element;
        el.style.width = isSelected ? "24px" : "14px";
        el.style.height = isSelected ? "24px" : "14px";
        el.style.boxShadow = isSelected ? `0 0 0 3px ${color}55, 0 0 20px ${color}77` : `0 0 6px ${color}55`;
        el.style.border = isSelected ? "3px solid white" : "2px solid white";
      } else {
        const el = document.createElement("div");
        el.style.cssText = `width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 0 6px ${color}55;cursor:pointer;transition:all 0.2s;`;
        if (device.severity === "Critical") el.style.animation = "mapGlow 1.5s infinite";
        el.addEventListener("click", () => {
          onSelect(device.id);
          // For secure (green) devices, open AI route panel directly
          if (device.severity === "Secure") {
            const ctx = DEVICE_SHIPMENT_CONTEXT[device.id];
            if (ctx) {
              window.dispatchEvent(new CustomEvent("open-ai-route-panel", { detail: ctx }));
            }
          }
        });
        const popup = new window.mapboxgl.Popup({ offset: 16, closeButton: false })
          .setHTML(`<div style="background:#0a0f1a;color:#f9fafb;padding:8px 10px;border-radius:8px;font-size:11px;border:1px solid #1f2937;min-width:150px;font-family:monospace;">
            <div style="font-weight:700;color:${color};margin-bottom:2px;">${device.id}</div>
            <div style="color:#9ca3af;font-size:10px;">${device.type}</div>
            <div style="color:#6b7280;font-size:10px;margin-top:2px;">${device.location}</div>
          </div>`);
        markersRef.current[device.id] = new window.mapboxgl.Marker(el).setLngLat([device.lon, device.lat]).setPopup(popup).addTo(map.current);
        el.addEventListener("mouseenter", () => markersRef.current[device.id].getPopup().addTo(map.current));
        el.addEventListener("mouseleave", () => markersRef.current[device.id].getPopup().remove());
      }
    });
  }, [loaded, devices, selectedId]);

  // Draw saved routes on map
  useEffect(() => {
    if (!loaded || !savedRoutes?.length) return;
    savedRoutes.forEach(route => {
      const srcId = "saved-route-" + route.id;
      const isDeviation = routeDeviations?.includes(route.id);
      const color = isDeviation ? "#ef4444" : "#22c55e";
      const geojson = { type: "Feature", geometry: { type: "LineString", coordinates: route.waypoints } };
      try {
        if (map.current.getSource(srcId)) {
          map.current.getSource(srcId).setData(geojson);
        } else {
          map.current.addSource(srcId, { type: "geojson", data: geojson });
          map.current.addLayer({ id: srcId + "-corridor", type: "line", source: srcId, paint: { "line-color": color, "line-width": (route.corridor_meters || route.corridorMeters || 500) / 40, "line-opacity": 0.15 } });
          map.current.addLayer({ id: srcId + "-line", type: "line", source: srcId, paint: { "line-color": color, "line-width": 2 } });
        }
      } catch {}
    });
  }, [loaded, savedRoutes, routeDeviations]);

  const clearWaypointMarkers = () => {
    waypointMarkersRef.current.forEach(m => m.remove());
    waypointMarkersRef.current = [];
    if (map.current?.getLayer("drawing-route-line")) map.current.removeLayer("drawing-route-line");
    if (map.current?.getSource("drawing-route")) map.current.removeSource("drawing-route");
  };

  const handleSaveRoute = (opts) => {
    if (waypoints.length < 2) return;
    const route = { name: opts.name, waypoints, corridorMeters: opts.corridorMeters, assignedDevice: opts.assignedDevice, created_at: new Date().toISOString() };
    onRouteSave?.(route);
    clearWaypointMarkers();
    setWaypoints([]);
    setDrawingMode(false);
    setShowRoutePanel(false);
    if (map.current) map.current.getCanvas().style.cursor = "";
  };

  const handleDeleteRoute = (id) => {
    try {
      if (map.current?.getLayer("saved-route-" + id + "-corridor")) map.current.removeLayer("saved-route-" + id + "-corridor");
      if (map.current?.getLayer("saved-route-" + id + "-line")) map.current.removeLayer("saved-route-" + id + "-line");
      if (map.current?.getSource("saved-route-" + id)) map.current.removeSource("saved-route-" + id);
    } catch {}
    onRouteDelete?.(id);
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <style>{`
        @keyframes mapGlow { 0%,100%{box-shadow:0 0 6px #ef444466} 50%{box-shadow:0 0 20px #ef4444aa,0 0 40px #ef444433} }
        .mapboxgl-ctrl-attrib { display:none!important }
      `}</style>
      <div ref={mapContainer} style={{ width: "100%", height: "100%", borderRadius: fullscreen ? 0 : 12, cursor: drawingMode ? "crosshair" : "default" }}/>
      {!loaded && (
        <div style={{ position: "absolute", inset: 0, background: "#060d18", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10 }}>
          <div style={{ width: 28, height: 28, border: "2px solid #2563eb", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }}/>
          <span style={{ fontSize: 12, color: "#6b7280" }}>Loading map...</span>
        </div>
      )}
      {/* Fullscreen toggle */}
      <button onClick={onFullscreen}
        style={{ position: "absolute", top: 10, left: 10, background: "rgba(6,13,24,0.9)", border: "1px solid #374151", color: "#9ca3af", borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", backdropFilter: "blur(4px)", zIndex: 10 }}>
        {fullscreen ? "✕ Exit" : "⛶ Full Screen"}
      </button>

      {/* Draw Route button */}
      <button onClick={() => {
          setDrawingMode(true);
          setShowRoutePanel(true);
          setShowAIRoutePanel(false);
          if (map.current) map.current.getCanvas().style.cursor = "crosshair";
        }}
        style={{ position: "absolute", top: 10, left: 120, background: drawingMode ? "rgba(30,58,138,0.95)" : "rgba(6,13,24,0.9)", border: "1px solid " + (drawingMode ? "#2563eb" : "#374151"), color: drawingMode ? "#93c5fd" : "#9ca3af", borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", backdropFilter: "blur(4px)", zIndex: 10, display: "flex", alignItems: "center", gap: 5 }}>
        {drawingMode ? "✏ Drawing..." : "🗺 Draw Route"}
      </button>

      {/* AI Route button */}
      <button onClick={() => { setShowAIRoutePanel(true); setShowRoutePanel(false); setDrawingMode(false); if (map.current) map.current.getCanvas().style.cursor = ""; }}
        style={{ position: "absolute", top: 10, left: 234, background: showAIRoutePanel ? "rgba(30,58,138,0.95)" : "rgba(6,13,24,0.9)", border: "1px solid " + (showAIRoutePanel ? "#2563eb" : "#374151"), color: showAIRoutePanel ? "#93c5fd" : "#9ca3af", borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", backdropFilter: "blur(4px)", zIndex: 10, display: "flex", alignItems: "center", gap: 5 }}>
        🤖 AI Route
      </button>

      {/* Drawing mode banner */}
      {drawingMode && (
        <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", background: "rgba(30,58,138,0.95)", border: "1px solid #2563eb", borderRadius: 8, padding: "6px 14px", fontSize: 11, fontWeight: 700, color: "#93c5fd", zIndex: 10, display: "flex", alignItems: "center", gap: 8, backdropFilter: "blur(4px)", whiteSpace: "nowrap" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#3b82f6", animation: "pulse 1s infinite", display: "inline-block" }}/>
          Drawing Mode — Click map to place waypoints · {waypoints.length} placed
        </div>
      )}

      {/* AI Route Panel */}
      {showAIRoutePanel && (
        <AIRoutePanel
          prefill={aiPrefill}
          onRouteGenerated={(route) => {
            onRouteSave?.(route);
            // Draw the AI route on the map immediately
            const srcId = "ai-preview-route";
            try {
              const geojson = { type: "Feature", geometry: { type: "LineString", coordinates: route.waypoints } };
              if (map.current?.getSource(srcId)) {
                map.current.getSource(srcId).setData(geojson);
              } else if (map.current?.loaded()) {
                map.current.addSource(srcId, { type: "geojson", data: geojson });
                map.current.addLayer({ id: srcId + "-line", type: "line", source: srcId, paint: { "line-color": "#22c55e", "line-width": 3 } });
              }
              // Fit map to route bounds
              if (route.waypoints.length > 1) {
                const lngs = route.waypoints.map(w => w[0]);
                const lats = route.waypoints.map(w => w[1]);
                map.current?.fitBounds([[Math.min(...lngs)-0.5, Math.min(...lats)-0.5], [Math.max(...lngs)+0.5, Math.max(...lats)+0.5]], { padding: 60, duration: 1500 });
              }
            } catch {}
            setShowAIRoutePanel(false);
          }}
          onClose={() => setShowAIRoutePanel(false)}
        />
      )}

      {/* Route Manager Panel */}
      {showRoutePanel && (
        <RouteManagerPanel
          savedRoutes={savedRoutes || []}
          waypointCount={waypoints.length}
          onSave={handleSaveRoute}
          onUndo={() => {
            setWaypoints(prev => {
              const next = prev.slice(0, -1);
              clearWaypointMarkers();
              // Redraw remaining
              next.forEach((coord, i) => {
                const el = document.createElement("div");
                el.style.cssText = "width:16px;height:16px;border-radius:50%;background:#3b82f6;border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:8px;color:white;font-weight:bold;";
                el.textContent = i + 1;
                const marker = new window.mapboxgl.Marker(el).setLngLat(coord).addTo(map.current);
                waypointMarkersRef.current.push(marker);
              });
              if (next.length >= 2 && map.current.getSource("drawing-route")) {
                map.current.getSource("drawing-route").setData({ type: "Feature", geometry: { type: "LineString", coordinates: next } });
              }
              return next;
            });
          }}
          onClear={() => { clearWaypointMarkers(); setWaypoints([]); }}
          onDelete={handleDeleteRoute}
          onClose={() => { clearWaypointMarkers(); setWaypoints([]); setDrawingMode(false); setShowRoutePanel(false); if (map.current) map.current.getCanvas().style.cursor = ""; }}
        />
      )}
    </div>
  );
}

// ── AI Response Panel ─────────────────────────────────────────────────────────
function parseResponseWindowSeconds(text) {
  const match = text?.match(/(\d+)\s*minute/i);
  return match ? parseInt(match[1], 10) * 60 : null;
}

function formatMMSS(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function AIResponsePanel({ device, onDismiss, onNav }) {
  const [aiData, setAiData]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep]       = useState(0); // 0=analyzing, 1=ready
  const [confirmed, setConfirmed] = useState([]);
  const [totalSeconds, setTotalSeconds] = useState(null);
  const [secondsLeft, setSecondsLeft]   = useState(null);
  const [actionTaken, setActionTaken]   = useState(false);
  const [escalated, setEscalated]       = useState(false);
  const [confirmDismiss, setConfirmDismiss] = useState(false);

  useEffect(() => {
    if (!device) return;
    setLoading(true);
    setAiData(null);
    setStep(0);
    setConfirmed([]);
    setTotalSeconds(null);
    setSecondsLeft(null);
    setActionTaken(false);
    setEscalated(false);
    setConfirmDismiss(false);
    generateAIResponse(device).then(data => {
      setAiData(data);
      setLoading(false);
      setStep(1);
      if (device.severity === "Critical") {
        const secs = parseResponseWindowSeconds(data.estimated_response_window);
        if (secs) { setTotalSeconds(secs); setSecondsLeft(secs); }
      }
    });
  }, [device?.id]);

  // Live countdown — ticks down once a second while a critical alert is unacknowledged
  useEffect(() => {
    if (secondsLeft == null) return;
    if (secondsLeft <= 0) {
      if (!actionTaken && !escalated) {
        setEscalated(true);
        dispatchAlert({
          alertType: `${device.type} — ESCALATED (no operator action within ${Math.round(totalSeconds / 60)} min)`,
          deviceId: device.id,
          location: device.location,
          severity: device.severity,
          details: [["Cargo", device.cargo], ["Carrier", device.carrier], ["Escalation", "Automatic — response window expired unacknowledged"]],
        });
      }
      return;
    }
    const t = setTimeout(() => setSecondsLeft(s => (s == null ? s : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft, actionTaken, escalated, totalSeconds]);

  if (!device) return null;

  const isCrit = device.severity === "Critical";
  const borderColor = isCrit ? "#ef4444" : "#f59e0b";
  const bgColor     = isCrit ? "#450a0a" : "#1a1200";
  const textColor   = isCrit ? "#fca5a5" : "#fcd34d";
  const urgencyPct  = (totalSeconds && secondsLeft != null) ? secondsLeft / totalSeconds : 1;
  const urgent      = isCrit && secondsLeft != null && secondsLeft > 0 && urgencyPct <= 0.2;

  const confirmAction = (i) => setConfirmed(prev => {
    if (prev.includes(i)) return prev;
    const next = [...prev, i];
    if (aiData?.operator_must_do && next.length >= aiData.operator_must_do.length) setActionTaken(true);
    return next;
  });

  const handleDismissClick = () => {
    if (isCrit && !actionTaken && !escalated && secondsLeft > 0) {
      setConfirmDismiss(true);
    } else {
      onDismiss();
    }
  };

  return (
    <div style={{ background: "#070d17", border: `1px solid ${borderColor}`, borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column", height: "100%", boxShadow: urgent ? `0 0 28px ${borderColor}66` : "none", transition: "box-shadow 0.3s" }}>
      {/* Header */}
      <div style={{ background: bgColor, borderBottom: `1px solid ${borderColor}44`, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: borderColor, display: "inline-block", animation: `pulse ${urgent ? 0.5 : 1}s infinite` }}/>
          <span style={{ fontSize: 11, fontWeight: 800, color: textColor, letterSpacing: "0.08em" }}>
            {loading ? "AI ANALYZING..." : `AI RESPONSE — ${aiData?.threat_level}`}
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#f9fafb" }}>{device.id}</span>
          {confirmDismiss ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 9, color: "#fca5a5", whiteSpace: "nowrap" }}>Dismiss without action?</span>
              <button onClick={onDismiss} style={{ background: "#7f1d1d", border: "1px solid #ef4444", color: "#fecaca", borderRadius: 5, padding: "2px 8px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Yes</button>
              <button onClick={() => setConfirmDismiss(false)} style={{ background: "none", border: "1px solid #374151", color: "#9ca3af", borderRadius: 5, padding: "2px 8px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
            </div>
          ) : (
            <button onClick={handleDismissClick} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 16 }}>×</button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>

        {/* Loading state */}
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "20px 0" }}>
            <div style={{ display: "flex", items: "center", gap: 10 }}>
              <div style={{ width: 16, height: 16, border: "2px solid #2563eb", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite", flexShrink: 0, marginTop: 2 }}/>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#f9fafb" }}>AI analyzing alert data...</div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>Reviewing sensor logs, GPS history, and carrier data</div>
              </div>
            </div>
            {["Capturing GPS history...", "Pulling sensor logs...", "Generating evidence packet...", "Calculating response plan..."].map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "#0a0f1a", borderRadius: 8 }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#2563eb", animation: `pulse ${1 + i * 0.2}s infinite`, flexShrink: 0 }}/>
                <span style={{ fontSize: 11, color: "#6b7280" }}>{item}</span>
              </div>
            ))}
          </div>
        )}

        {/* AI Response */}
        {!loading && aiData && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Escalation banner */}
            {escalated && (
              <div style={{ background: "#7f1d1d", border: "1px solid #ef4444", borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>🚨</span>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "#fecaca" }}>ESCALATED — RESPONSE WINDOW EXPIRED</div>
                  <div style={{ fontSize: 11, color: "#fca5a5" }}>No operator action taken in time. SMS/email escalation sent automatically.</div>
                </div>
              </div>
            )}

            {/* Situation */}
            <div style={{ background: bgColor, border: `1px solid ${borderColor}44`, borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: borderColor, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Situation Assessment</div>
              <p style={{ fontSize: 12, color: "#e5e7eb", lineHeight: 1.6, margin: 0 }}>{aiData.situation}</p>
              {isCrit && secondsLeft != null ? (
                <div style={{ marginTop: 8, fontSize: 13, fontWeight: 800, color: urgent ? "#fca5a5" : borderColor, fontVariantNumeric: "tabular-nums", animation: urgent ? "pulse 0.5s infinite" : "none" }}>
                  ⏱ {escalated ? "Window expired" : `${formatMMSS(secondsLeft)} remaining`}
                </div>
              ) : aiData.estimated_response_window && (
                <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: borderColor }}>⏱ {aiData.estimated_response_window}</div>
              )}
            </div>

            {/* AI Actions Taken */}
            <div style={{ background: "#052e1620", border: "1px solid #22c55e33", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#22c55e", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>✓ AI Has Already Done</div>
              {aiData.ai_actions_taken?.map((action, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: i < aiData.ai_actions_taken.length - 1 ? "1px solid #1f2937" : "none" }}>
                  <span style={{ color: "#22c55e", fontSize: 13, flexShrink: 0 }}>✓</span>
                  <span style={{ fontSize: 11, color: "#86efac" }}>{action}</span>
                </div>
              ))}
            </div>

            {/* Operator Must Do */}
            <div style={{ background: "#1e3a8a22", border: "1px solid #2563eb44", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Your Action Required</div>
              {aiData.operator_must_do?.map((action, i) => (
                <div key={i} onClick={() => confirmAction(i)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: confirmed.includes(i) ? "#052e16" : "#0a0f1a", border: `1px solid ${confirmed.includes(i) ? "#22c55e" : "#1f2937"}`, borderRadius: 8, marginBottom: 6, cursor: "pointer", transition: "all 0.15s" }}>
                  <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${confirmed.includes(i) ? "#22c55e" : "#374151"}`, background: confirmed.includes(i) ? "#22c55e" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 11, color: "white", fontWeight: 700 }}>
                    {confirmed.includes(i) ? "✓" : i + 1}
                  </div>
                  <span style={{ fontSize: 12, color: confirmed.includes(i) ? "#86efac" : "#e5e7eb", fontWeight: 600 }}>{action}</span>
                </div>
              ))}
            </div>

            {/* Do NOT */}
            {aiData.do_not && (
              <div style={{ background: "#450a0a33", border: "1px solid #ef444444", borderRadius: 10, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>⛔</span>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#ef4444", marginBottom: 2 }}>DO NOT</div>
                  <span style={{ fontSize: 11, color: "#fca5a5" }}>{aiData.do_not}</span>
                </div>
              </div>
            )}

            {/* Evidence Status */}
            <div style={{ background: "#0a0f1a", border: "1px solid #1f2937", borderRadius: 10, padding: "8px 12px" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Evidence Status</div>
              <span style={{ fontSize: 11, color: "#9ca3af" }}>{aiData.evidence_status}</span>
            </div>

            {/* Action buttons */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button onClick={() => { setActionTaken(true); window.dispatchEvent(new CustomEvent("divvo-nav", { detail: { page: "recovery-case", deviceId: device.id } })); }}
                style={{ background: isCrit ? "#7f1d1d" : "#451a03", border: `1px solid ${borderColor}`, color: textColor, borderRadius: 8, padding: "9px 0", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                Open Recovery Case
              </button>
              <button onClick={() => { setActionTaken(true); dispatchAlert({ alertType: device.type, deviceId: device.id, location: device.location, severity: device.severity, details: [["Cargo", device.cargo], ["Carrier", device.carrier]] }); }}
                style={{ background: "#1e3a8a", border: "1px solid #2563eb", color: "#93c5fd", borderRadius: 8, padding: "9px 0", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                Send Alert Notification
              </button>
            </div>

            {/* Cameras */}
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Live Camera Feeds — {device.id}</span>
                <a href="/camera.html" target="_blank" rel="noreferrer" style={{ fontSize: 9, color: "#60a5fa", textDecoration: "none" }}>Arm Phone →</a>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
                <CamFeed slotId="device-1" label="LEFT"/>
                <CamFeed slotId="device-2" label="CENTER"/>
                <CamFeed slotId="device-3" label="RIGHT"/>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

// ── Alert Row ─────────────────────────────────────────────────────────────────
function AlertRow({ device, selected, onClick, onRoute }) {
  const isCrit = device.severity === "Critical";
  const isWarn = device.severity === "Warning";
  if (!isCrit && !isWarn) return null;
  const col = isCrit ? "#ef4444" : "#f59e0b";
  const bg  = selected ? (isCrit ? "#1a0505" : "#1a1200") : "#0a0f1a";
  const ctx = DEVICE_SHIPMENT_CONTEXT[device.id];

  return (
    <div style={{ background: bg, border: `1px solid ${selected ? col : "#1f2937"}`, borderRadius: 8, marginBottom: 6, overflow: "hidden", transition: "border-color 0.15s" }}>
      <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer" }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: col, flexShrink: 0, animation: isCrit ? "pulse 1s infinite" : "none" }}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 1 }}>
            <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: col }}>{device.id}</span>
            <span style={{ fontSize: 9, background: isCrit ? "#450a0a" : "#1a1200", color: col, border: `1px solid ${col}44`, padding: "1px 6px", borderRadius: 10, fontWeight: 700, textTransform: "uppercase" }}>{device.severity}</span>
          </div>
          <div style={{ fontSize: 11, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{device.type}</div>
          <div style={{ fontSize: 10, color: "#4b5563", marginTop: 1 }}>📍 {device.location}</div>
        </div>
        <span style={{ fontSize: 10, color: selected ? col : "#374151", fontWeight: 700, flexShrink: 0 }}>{selected ? "AI Active ›" : "Analyze ›"}</span>
      </div>
      {ctx && (
        <div style={{ borderTop: `1px solid ${col}22`, padding: "6px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(0,0,0,0.2)" }}>
          <span style={{ fontSize: 10, color: "#4b5563" }}>{ctx.origin} → {ctx.destination}</span>
          <button
            onClick={(e) => { e.stopPropagation(); onRoute && onRoute(ctx); }}
            style={{ background: "#1e3a8a", border: "1px solid #2563eb44", color: "#93c5fd", borderRadius: 5, padding: "3px 8px", fontSize: 9, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4 }}>
            🤖 Route Shipment
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Unified Command Center ───────────────────────────────────────────────
export default function UnifiedCommandCenter({ onNav }) {
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [mapFullscreen, setMapFullscreen]   = useState(false);
  const [devices, setDevices]               = useState(DEVICES);
  const [toast, setToast]                   = useState(null);
  const [liveGPS, setLiveGPS]               = useState([]);
  const [savedRoutes, setSavedRoutes]       = useState([]);
  const [routeDeviations, setRouteDeviations] = useState([]);
  const [deletionTarget, setDeletionTarget] = useState(null); // route pending deletion
  const [aiRoutePrefill, setAiRoutePrefill] = useState(null); // prefill for AI route panel

  // Load saved routes on mount
  useEffect(() => {
    fetchSavedRoutes().then(rows => { if (Array.isArray(rows)) setSavedRoutes(rows); });
  }, []);

  // Poll Supabase for live phone GPS
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(SB_URL + "/rest/v1/gps_pings?select=*&order=created_at.desc&limit=50", { headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY } });
        const pings = await res.json();
        if (!pings?.length) return;
        const fresh = [];
        const seen = {};
        for (const p of pings) {
          const id = p.device_id || "device-1";
          const age = (Date.now() - new Date(p.created_at).getTime()) / 1000;
          if (age < 300 && !seen[id]) { seen[id] = true; fresh.push({ ...p, deviceId: id }); }
        }
        setLiveGPS(fresh);
        // Check route deviations
        const deviations = [];
        for (const p of fresh) {
          for (const route of savedRoutes) {
            if (route.assigned_device !== "all" && route.assigned_device !== p.deviceId) continue;
            const dist = distanceFromRoute(p.lat, p.lon, route.waypoints);
            if (dist > (route.corridor_meters || route.corridorMeters || 500)) {
              deviations.push(route.id);
            }
          }
        }
        setRouteDeviations(deviations);
      } catch {}
    };
    poll();
    const iv = setInterval(poll, 5000);
    return () => clearInterval(iv);
  }, []);

  const handleRouteShipment = (ctx) => {
    setAiRoutePrefill(ctx);
    // Trigger map to show AI route panel — dispatch event
    window.dispatchEvent(new CustomEvent("open-ai-route-panel", { detail: ctx }));
  };

  const handleRouteSave = async (route) => {
    await saveRouteToSB(route);
    const newRoute = { ...route, id: Date.now() };
    setSavedRoutes(prev => [newRoute, ...prev]);
  };

  const handleRouteDelete = (id) => {
    const route = savedRoutes.find(r => r.id === id);
    if (route) setDeletionTarget(route);
  };

  const confirmRouteDelete = async (id) => {
    await deleteRouteFromSB(id);
    setSavedRoutes(prev => prev.filter(r => r.id !== id));
    setRouteDeviations(prev => prev.filter(rid => rid !== id));
    setDeletionTarget(null);
  };

  const handleSelectDevice = useCallback((id) => {
    const device = devices.find(d => d.id === id);
    if (!device) return;
    // Secure devices only open route planner — no AI alert panel
    if (device.severity === "Secure") {
      setSelectedDevice(null);
      return;
    }
    setSelectedDevice(device);
    if (device.severity === "Critical") {
      setToast("AI analyzing critical alert — " + id);
      setTimeout(() => setToast(null), 3000);
    }
  }, [devices]);

  const criticalDevices = devices.filter(d => d.severity === "Critical");
  const warningDevices  = devices.filter(d => d.severity === "Warning");
  const secureCount     = devices.filter(d => d.severity === "Secure").length;
  const totalCargo      = devices.reduce((s, d) => s + parseFloat(d.cargo.replace(/[$,]/g, "")), 0);

  return (
    <div style={{ background: "#070d17", height: "100vh", color: "#f9fafb", fontFamily: "ui-sans-serif, system-ui, sans-serif", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes spin { to{transform:rotate(360deg)} }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: #1f2937; border-radius: 2px; }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 1000, background: "#052e16", border: "1px solid #22c55e", borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", animation: "pulse 1s infinite", display: "inline-block" }}/>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#86efac" }}>{toast}</span>
        </div>
      )}

      {/* Route Deletion Modal */}
      {deletionTarget && (
        <RouteDeletionModal
          route={deletionTarget}
          operator="J. Torres"
          onConfirm={confirmRouteDelete}
          onCancel={() => setDeletionTarget(null)}
        />
      )}

      {/* Fullscreen Map */}
      {mapFullscreen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "#070d17", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "10px 16px", background: "#060d18", borderBottom: "1px solid #1f2937", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", animation: "pulse 2s infinite", display: "inline-block" }}/>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Divvo Guardian — Full Fleet View</span>
              <span style={{ fontSize: 11, color: "#6b7280" }}>{devices.length} devices · South Texas</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ color: "#ef4444", fontSize: 11 }}>● {criticalDevices.length} Critical</span>
              <span style={{ color: "#f59e0b", fontSize: 11 }}>● {warningDevices.length} Warning</span>
              <span style={{ color: "#22c55e", fontSize: 11 }}>● {secureCount} Secure</span>
              <button onClick={() => setMapFullscreen(false)}
                style={{ background: "#1f2937", border: "1px solid #374151", color: "#9ca3af", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                ✕ Exit Full Screen
              </button>
            </div>
          </div>
          <div style={{ flex: 1, position: "relative" }}>
            <LiveMap devices={devices} onSelect={handleSelectDevice} selectedId={selectedDevice?.id} fullscreen={true} onFullscreen={() => setMapFullscreen(false)} savedRoutes={savedRoutes} onRouteSave={handleRouteSave} onRouteDelete={handleRouteDelete} routeDeviations={routeDeviations}/>
            {selectedDevice && (
              <div style={{ position: "absolute", top: 12, right: 12, bottom: 12, width: 360, zIndex: 30 }}>
                <AIResponsePanel device={selectedDevice} onDismiss={() => setSelectedDevice(null)} onNav={onNav}/>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Top Header Bar */}
      <div style={{ background: "#060d18", borderBottom: "1px solid #1f2937", padding: "8px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, background: "#2563eb", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, lineHeight: 1 }}>Divvo Guardian</div>
              <div style={{ fontSize: 10, color: "#6b7280" }}>Unified Command Center</div>
            </div>
          </div>
          <div style={{ width: 1, height: 28, background: "#1f2937" }}/>
          <div style={{ display: "flex", items: "center", gap: 16, fontSize: 11 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e", display: "inline-block", animation: "pulse 2s infinite" }}/>
              <span style={{ color: "#22c55e", fontWeight: 700 }}>LIVE</span>
            </span>
            <span style={{ color: "#6b7280" }}>{devices.length} devices</span>
            <span style={{ color: "#ef4444", fontWeight: 700 }}>{criticalDevices.length} critical</span>
            <span style={{ color: "#f59e0b" }}>{warningDevices.length} warning</span>
            <span style={{ color: "#22c55e" }}>{secureCount} secure</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* KPIs inline */}
          {[
            { label: "Cargo Protected", value: "$" + (totalCargo/1000000).toFixed(1) + "M" },
            { label: "Active Devices", value: devices.length },
            { label: "Owlet Pilot", value: "Active" },
          ].map(kpi => (
            <div key={kpi.label} style={{ background: "#0a0f1a", border: "1px solid #1f2937", borderRadius: 8, padding: "5px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "#6b7280" }}>{kpi.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#f9fafb" }}>{kpi.value}</div>
            </div>
          ))}
          <div style={{ width: 30, height: 30, background: "#1f2937", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 700 }}>JT</span>
          </div>
        </div>
      </div>

      {/* Main Layout */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: selectedDevice ? "1fr 320px 360px" : "1fr 320px", gap: 0, overflow: "hidden" }}>

        {/* LEFT — Map */}
        <div style={{ display: "flex", flexDirection: "column", borderRight: "1px solid #1f2937", overflow: "hidden" }}>
          <div style={{ padding: "8px 12px", background: "#060d18", borderBottom: "1px solid #1f2937", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e", animation: "pulse 2s infinite", display: "inline-block" }}/>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em" }}>Live Fleet Map · South Texas</span>
            </div>
            {liveGPS.length > 0 && (
              <span style={{ fontSize: 10, color: "#22c55e", fontWeight: 600 }}>● {liveGPS.length} phone GPS live</span>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <LiveMap devices={devices} onSelect={handleSelectDevice} selectedId={selectedDevice?.id} fullscreen={false} onFullscreen={() => setMapFullscreen(true)} savedRoutes={savedRoutes} onRouteSave={handleRouteSave} onRouteDelete={handleRouteDelete} routeDeviations={routeDeviations}/>
          </div>
          {/* Live GPS ticker */}
          {liveGPS.length > 0 && (
            <div style={{ background: "#060d18", borderTop: "1px solid #1f2937", padding: "6px 12px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 9, color: "#22c55e", fontWeight: 700 }}>● PHONE GPS</span>
              {liveGPS.map(p => (
                <span key={p.deviceId} style={{ fontSize: 9, color: "#6b7280", fontFamily: "monospace" }}>
                  {p.device_name || p.deviceId} · {p.lat?.toFixed(4)}N {Math.abs(p.lon)?.toFixed(4)}W · {((p.speed||0)*2.237).toFixed(1)}mph
                </span>
              ))}
            </div>
          )}
        </div>

        {/* MIDDLE — Alert Feed */}
        <div style={{ display: "flex", flexDirection: "column", borderRight: "1px solid #1f2937", overflow: "hidden" }}>
          <div style={{ padding: "8px 12px", background: "#060d18", borderBottom: "1px solid #1f2937", flexShrink: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 1 }}>Active Alerts</div>
            <div style={{ fontSize: 10, color: "#4b5563" }}>Click an alert — AI responds instantly</div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>

            {routeDeviations.length > 0 && (
              <div style={{ background: "#1a0a00", border: "1px solid #f97316", borderRadius: 8, padding: "8px 10px", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f97316", animation: "pulse 1s infinite", display: "inline-block", flexShrink: 0 }}/>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#f97316" }}>ROUTE DEVIATION DETECTED</div>
                  <div style={{ fontSize: 10, color: "#fed7aa" }}>Phone GPS outside approved corridor</div>
                </div>
              </div>
            )}

            {criticalDevices.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#ef4444", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#ef4444", animation: "pulse 1s infinite", display: "inline-block" }}/>
                  Critical — Immediate Action
                </div>
                {criticalDevices.map(d => (
                  <AlertRow key={d.id} device={d} selected={selectedDevice?.id === d.id} onClick={() => handleSelectDevice(d.id)} onRoute={handleRouteShipment}/>
                ))}
              </div>
            )}

            {warningDevices.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#f59e0b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#f59e0b", display: "inline-block" }}/>
                  Warning — Monitor
                </div>
                {warningDevices.map(d => (
                  <AlertRow key={d.id} device={d} selected={selectedDevice?.id === d.id} onClick={() => handleSelectDevice(d.id)} onRoute={handleRouteShipment}/>
                ))}
              </div>
            )}

            {/* Shipment routes */}
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Shipment Routes</div>
              {SHIPMENT_ROUTES.map(route => (
                <div key={route.id} style={{ padding: "8px 10px", background: "#0a0f1a", border: "1px solid #1f2937", borderRadius: 8, marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: route.severity === "Critical" ? "#fca5a5" : "#fcd34d" }}>{route.id}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 9, color: "#6b7280" }}>{route.cargo}</span>
                      <button
                        onClick={() => handleRouteShipment({ origin: route.origin, destination: route.destination, carrier: route.carrier, cargo: route.cargo })}
                        style={{ background: "#1e3a8a", border: "1px solid #2563eb44", color: "#93c5fd", borderRadius: 5, padding: "2px 7px", fontSize: 9, fontWeight: 700, cursor: "pointer" }}>
                        🤖 Route
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: "#6b7280" }}>{route.label} · {route.carrier}</div>
                </div>
              ))}
            </div>

            {/* Secure fleet summary */}
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#22c55e", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e", display: "inline-block" }}/>
                Secure — {secureCount} Devices
              </div>
              <div style={{ padding: "8px 10px", background: "#0a0f1a", border: "1px solid #1f2937", borderRadius: 8, fontSize: 11, color: "#6b7280" }}>
                All remaining devices nominal · No action required
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT — AI Response Panel */}
        {selectedDevice && (
          <div style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <AIResponsePanel device={selectedDevice} onDismiss={() => setSelectedDevice(null)} onNav={onNav}/>
          </div>
        )}

      </div>
    </div>
  );
}
