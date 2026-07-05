import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { fmtCurrency, fmtCurrencyCompact } from "../lib/utils.js";
import { SeverityBadge } from "../components/Badges.jsx";
import { dispatchAlert } from "../lib/notifications.js";

// ── Config ────────────────────────────────────────────────────────────────────
const SB_URL = "https://vnywjwncanldpsffiwtn.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZueXdqd25jYW5sZHBzZmZpd3RuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MjExMjAsImV4cCI6MjA5ODQ5NzEyMH0.J-5KjItWTEgolONGOHhLORJNh5K6rla19vJnASl2ay4";
const MAPBOX_TOKEN = "REDACTED_MAPBOX_TOKEN";

const DEVICE_COLORS = { "device-1": "#22c55e", "device-2": "#3b82f6", "device-3": "#f59e0b" };
const SPEED_THRESHOLD_MPH = 25;

// ── Supabase helpers ──────────────────────────────────────────────────────────
async function fetchRecentPings() {
  try {
    const res = await fetch(
      SB_URL + "/rest/v1/gps_pings?select=*&order=created_at.desc&limit=200",
      { headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY } }
    );
    return await res.json();
  } catch { return []; }
}

async function saveRoute(route) {
  try {
    await fetch(SB_URL + "/rest/v1/saved_routes", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, Prefer: "return=minimal" },
      body: JSON.stringify(route),
    });
  } catch (e) { console.error("Save route failed", e); }
}

async function fetchRoutes() {
  try {
    const res = await fetch(
      SB_URL + "/rest/v1/saved_routes?select=*&order=created_at.desc",
      { headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY } }
    );
    return await res.json();
  } catch { return []; }
}

async function deleteRoute(id) {
  try {
    await fetch(SB_URL + "/rest/v1/saved_routes?id=eq." + id, {
      method: "DELETE",
      headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY },
    });
  } catch (e) { console.error("Delete route failed", e); }
}

// ── Distance helpers ──────────────────────────────────────────────────────────
function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function pointToSegmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  if (dx === 0 && dy === 0) return distanceMeters(py, px, ay, ax);
  const t = Math.max(0, Math.min(1, ((px-ax)*dx + (py-ay)*dy) / (dx*dx + dy*dy)));
  return distanceMeters(py, px, ay + t*dy, ax + t*dx);
}

function distanceFromRoute(lat, lon, waypoints) {
  if (!waypoints || waypoints.length < 2) return Infinity;
  let minDist = Infinity;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const d = pointToSegmentDistance(lon, lat, waypoints[i][0], waypoints[i][1], waypoints[i+1][0], waypoints[i+1][1]);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

// ── Mock threat data ──────────────────────────────────────────────────────────
const THREAT_QUEUE = [
  { shipmentId: "OWL-SAV-1003", severity: "Critical", cargoValue: 3_100_000, location: "I-16 W near Macon, GA", rules: ["Door Opened", "Seal Tampered", "Geofence Breach"], recommendation: "Dispatch law enforcement immediately. Recovery Team Bravo is 12 min out.", carrier: "Hapag-Lloyd" },
  { shipmentId: "OWL-HOU-1001", severity: "High", cargoValue: 2_400_000, location: "Junction, TX off I-10 W", rules: ["Route Deviation", "Low Battery"], recommendation: "Contact carrier dispatch for driver status. Escalate if no response.", carrier: "Maersk Line" },
  { shipmentId: "OWL-LGB-1002", severity: "Medium", cargoValue: 1_850_000, location: "I-10 E near Blythe, CA", rules: ["Tracker Offline (47 min)"], recommendation: "Request carrier maintenance report.", carrier: "COSCO Shipping" },
];

const RECOVERY_TEAMS = [
  { id: "bravo", name: "Team Bravo", status: "Assigned", location: "Macon, GA", assignment: "INC-2026-0041", lead: "D. Okafor" },
  { id: "lonestar", name: "Team Lone Star", status: "Available", location: "San Antonio, TX", assignment: "Unassigned", lead: "R. Vasquez" },
  { id: "pacific", name: "Team Pacific", status: "Available", location: "Long Beach, CA", assignment: "Unassigned", lead: "S. Kim" },
];

const TICKER_COLORS = {
  gps:      { dot: "bg-blue-400",    text: "text-blue-300" },
  alert:    { dot: "bg-amber-400",   text: "text-amber-300" },
  critical: { dot: "bg-red-500",     text: "text-red-300" },
  incident: { dot: "bg-purple-400",  text: "text-purple-300" },
  resolved: { dot: "bg-emerald-400", text: "text-emerald-300" },
  live:     { dot: "bg-emerald-400", text: "text-emerald-300" },
  speed:    { dot: "bg-red-500",     text: "text-red-300" },
  route:    { dot: "bg-orange-400",  text: "text-orange-300" },
};

const LIVE_SCAN_EVENTS = [
  { type: "gps", msg: "GPS ping — OWL-NJ-1004 · I-80 W near Gary, IN" },
  { type: "alert", msg: "Route deviation — OWL-HOU-1001 · Junction, TX" },
  { type: "critical", msg: "Door sensor — OWL-SAV-1003 · Mile Marker 44" },
  { type: "incident", msg: "Team Bravo check-in — Macon, GA · ETA 12 min" },
];

// ── Mapbox Map Component ──────────────────────────────────────────────────────
const MapboxMap = forwardRef(function MapboxMap({ liveDevices, speedAlerts, savedRoutes, routeDeviations, drawingMode, onMapClick, newRouteWaypoints, corridorMeters }, ref) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const markersRef = useRef({});
  const waypointMarkersRef = useRef([]);
  const [mapLoaded, setMapLoaded] = useState(false);

  useImperativeHandle(ref, () => ({
    getMap: () => map.current,
    clearWaypointMarkers: () => {
      waypointMarkersRef.current.forEach((m) => m.remove());
      waypointMarkersRef.current = [];
    },
  }), [mapLoaded]);

  // Initialize Mapbox
  useEffect(() => {
    if (map.current || !mapContainer.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-98.4936, 29.4241],
      zoom: 10,
    });
    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.current.on("load", () => setMapLoaded(true));
  }, []);

  // Handle map clicks for route drawing
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const handler = (e) => {
      if (drawingMode) onMapClick([e.lngLat.lng, e.lngLat.lat]);
    };
    map.current.on("click", handler);
    map.current.getCanvas().style.cursor = drawingMode ? "crosshair" : "";
    return () => map.current?.off("click", handler);
  }, [mapLoaded, drawingMode, onMapClick]);

  // Draw new route being built
  useEffect(() => {
    if (!map.current || !mapLoaded || newRouteWaypoints.length < 1) return;
    const geojson = {
      type: "Feature",
      geometry: { type: "LineString", coordinates: newRouteWaypoints },
    };
    if (map.current.getSource("new-route")) {
      map.current.getSource("new-route").setData(geojson);
    } else {
      map.current.addSource("new-route", { type: "geojson", data: geojson });
      map.current.addLayer({ id: "new-route-corridor", type: "line", source: "new-route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#3b82f6", "line-width": corridorMeters / 50, "line-opacity": 0.2 } });
      map.current.addLayer({ id: "new-route-line", type: "line", source: "new-route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#3b82f6", "line-width": 3, "line-dasharray": [2, 2] } });
    }
    // Clear old waypoint markers then redraw all
    waypointMarkersRef.current.forEach((m) => m.remove());
    waypointMarkersRef.current = [];
    newRouteWaypoints.forEach((coord, i) => {
      const el = document.createElement("div");
      el.style.cssText = "width:18px;height:18px;border-radius:50%;background:#3b82f6;border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:9px;color:white;font-weight:bold;cursor:pointer;";
      el.textContent = i + 1;
      const marker = new mapboxgl.Marker(el).setLngLat(coord).addTo(map.current);
      waypointMarkersRef.current.push(marker);
    });
  }, [mapLoaded, newRouteWaypoints, corridorMeters]);

  // Draw saved routes
  useEffect(() => {
    if (!map.current || !mapLoaded || !savedRoutes.length) return;
    savedRoutes.forEach((route) => {
      const srcId = "route-" + route.id;
      const geojson = { type: "Feature", geometry: { type: "LineString", coordinates: route.waypoints } };
      const hasDeviation = routeDeviations.includes(route.id);
      const color = hasDeviation ? "#ef4444" : "#22c55e";
      if (map.current.getSource(srcId)) {
        map.current.getSource(srcId).setData(geojson);
      } else {
        map.current.addSource(srcId, { type: "geojson", data: geojson });
        map.current.addLayer({ id: srcId + "-corridor", type: "line", source: srcId, paint: { "line-color": color, "line-width": route.corridorMeters / 40, "line-opacity": 0.15 } });
        map.current.addLayer({ id: srcId + "-line", type: "line", source: srcId, paint: { "line-color": color, "line-width": 2 } });
      }
    });
  }, [mapLoaded, savedRoutes, routeDeviations]);

  // Live device markers
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    Object.entries(liveDevices).forEach(([deviceId, data]) => {
      const color = DEVICE_COLORS[deviceId] || "#22c55e";
      const isSpeed = speedAlerts.includes(deviceId);
      if (markersRef.current[deviceId]) {
        markersRef.current[deviceId].setLngLat([data.lon, data.lat]);
        markersRef.current[deviceId]._element.style.background = isSpeed ? "#ef4444" : color;
      } else {
        const el = document.createElement("div");
        el.style.cssText = `width:22px;height:22px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 0 0 4px ${color}44;cursor:pointer;transition:background 0.3s;`;
        el.title = data.name;
        const popup = new mapboxgl.Popup({ offset: 25, closeButton: false })
          .setHTML(`<div style="background:#0a0f1a;color:#f9fafb;padding:8px 10px;border-radius:8px;font-family:monospace;font-size:11px;min-width:160px;">
            <div style="font-weight:700;color:${color};margin-bottom:4px;">${data.name}</div>
            <div>Lat: ${data.lat.toFixed(5)}</div>
            <div>Lon: ${data.lon.toFixed(5)}</div>
            <div>Speed: ${((data.speed??0)*2.237).toFixed(1)} mph</div>
            <div style="color:#6b7280;margin-top:4px;">${data.timestamp}</div>
          </div>`);
        markersRef.current[deviceId] = new mapboxgl.Marker(el)
          .setLngLat([data.lon, data.lat])
          .setPopup(popup)
          .addTo(map.current);
      }
    });
    // Fly to first device if we have one
    const devices = Object.values(liveDevices);
    if (devices.length > 0 && !map.current._hasFlewToDevice) {
      map.current.flyTo({ center: [devices[0].lon, devices[0].lat], zoom: 13, duration: 2000 });
      map.current._hasFlewToDevice = true;
    }
  }, [mapLoaded, liveDevices, speedAlerts]);

  return (
    <div ref={mapContainer} className="w-full h-full rounded-xl overflow-hidden"
      style={{ minHeight: 300 }}>
      {!mapLoaded && (
        <div className="w-full h-full flex items-center justify-center bg-gray-900 rounded-xl">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
            <p className="text-xs text-gray-400">Loading Mapbox...</p>
          </div>
        </div>
      )}
    </div>
  );
});

// ── Route Manager Panel ───────────────────────────────────────────────────────
function RouteManagerPanel({ savedRoutes, onSave, onClose, waypointCount, onUndo, onClear, onDelete }) {
  const [routeName, setRouteName] = useState("");
  const [corridorMeters, setCorridorMeters] = useState(500);
  const [assignedDevice, setAssignedDevice] = useState("device-1");

  return (
    <div className="absolute top-0 right-0 bottom-0 w-72 bg-gray-950/98 border-l border-gray-800 z-20 flex flex-col p-4 overflow-y-auto shadow-2xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-bold text-white">Route Manager</h2>
          <p className="text-xs text-gray-400 mt-0.5">Click on the map to drop waypoints</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
      </div>

      <div className="bg-purple-950/60 border border-purple-800/60 rounded-lg p-3 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"/>
          <p className="text-xs font-bold text-purple-300 uppercase tracking-wider">Drawing Mode Active</p>
        </div>
        <p className="text-xs text-purple-400">
          {waypointCount === 0
            ? "Click anywhere on the map to place your first waypoint"
            : waypointCount + " waypoint" + (waypointCount > 1 ? "s" : "") + " placed — keep clicking to extend the route"
          }
        </p>
      </div>

      <div className="space-y-4 flex-1">
        <div>
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-2">Route Name</label>
          <input
            value={routeName}
            onChange={(e) => setRouteName(e.target.value)}
            placeholder="e.g. Houston to San Antonio"
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-2">
            Corridor — {corridorMeters >= 1000 ? (corridorMeters/1000).toFixed(1) + " km" : corridorMeters + " m"} each side
          </label>
          <input type="range" min="100" max="2000" step="100" value={corridorMeters}
            onChange={(e) => setCorridorMeters(Number(e.target.value))}
            className="w-full accent-blue-500"
          />
          <div className="flex justify-between text-xs text-gray-600 mt-1">
            <span>100m</span><span>1km</span><span>2km</span>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-2">Assign to Device</label>
          <select value={assignedDevice} onChange={(e) => setAssignedDevice(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
            <option value="device-1">Phone 1 — Green</option>
            <option value="device-2">Phone 2 — Blue</option>
            <option value="device-3">Phone 3 — Amber</option>
            <option value="all">All Devices</option>
          </select>
        </div>

        {savedRoutes.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Saved Routes ({savedRoutes.length})</p>
            <div className="space-y-2">
              {savedRoutes.map((r) => (
                <div key={r.id} className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{r.name}</p>
                      <p className="text-xs text-gray-500">{r.waypoints?.length} pts · {r.corridor_meters || r.corridorMeters}m · {r.assigned_device || r.assignedDevice}</p>
                    </div>
                    <button
                      onClick={() => onDelete(r.id)}
                      className="flex-shrink-0 text-xs bg-red-950/60 hover:bg-red-900 text-red-400 border border-red-900/50 px-2 py-1 rounded-lg transition-colors font-semibold"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 space-y-2">
        <button
          onClick={() => onSave({ name: routeName || "Unnamed Route", corridorMeters, assignedDevice })}
          disabled={waypointCount < 2}
          className={`w-full text-sm font-bold py-3 rounded-xl transition-colors ${
            waypointCount >= 2
              ? "bg-blue-600 hover:bg-blue-500 text-white"
              : "bg-gray-800 text-gray-600 cursor-not-allowed"
          }`}
        >
          {waypointCount < 2 ? "Place at least 2 waypoints" : "Save Route (" + waypointCount + " points)"}
        </button>
        <div className="flex gap-2">
          <button
            onClick={onUndo}
            disabled={waypointCount === 0}
            className={`flex-1 text-xs font-bold py-2 rounded-lg transition-colors ${
              waypointCount > 0
                ? "bg-gray-700 hover:bg-gray-600 text-gray-200"
                : "bg-gray-800 text-gray-600 cursor-not-allowed"
            }`}
          >
            ↩ Undo Last
          </button>
          <button
            onClick={onClear}
            disabled={waypointCount === 0}
            className={`flex-1 text-xs font-bold py-2 rounded-lg transition-colors ${
              waypointCount > 0
                ? "bg-red-900/60 hover:bg-red-800 text-red-300 border border-red-800"
                : "bg-gray-800 text-gray-600 cursor-not-allowed"
            }`}
          >
            ✕ Clear All
          </button>
        </div>
        <button onClick={onClose} className="w-full text-xs text-gray-500 hover:text-gray-300 py-2">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function CommandCenter({ incidents, onNav }) {
  const [ticker, setTicker] = useState(() =>
    LIVE_SCAN_EVENTS.map((e, i) => ({
      ...e, id: i,
      time: new Date(Date.now() - (4 - i) * 42000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    }))
  );
  const [lastScan, setLastScan]             = useState(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
  const [scanToast, setScanToast]           = useState(false);
  const [liveScanRunning, setLiveScanRunning] = useState(false);
  const [escalateTarget, setEscalateTarget] = useState(null);

  // Live tracking
  const [liveDevices, setLiveDevices]       = useState({});
  const [speedAlerts, setSpeedAlerts]       = useState([]);
  const [routeDeviations, setRouteDeviations] = useState([]);
  const seenPingIds                          = useRef(new Set());

  const mapRef = useRef(null);

  // Route management
  const [showRouteManager, setShowRouteManager] = useState(false);
  const [drawingMode, setDrawingMode]           = useState(false);
  const [newRouteWaypoints, setNewRouteWaypoints] = useState([]);
  const [corridorMeters, setCorridorMeters]     = useState(500);
  const [savedRoutes, setSavedRoutes]           = useState([]);

  // Load saved routes on mount
  useEffect(() => {
    fetchRoutes().then((rows) => {
      if (Array.isArray(rows)) setSavedRoutes(rows);
    });
  }, []);

  // Poll Supabase every 4 seconds
  useEffect(() => {
    const poll = async () => {
      const pings = await fetchRecentPings();
      if (!pings || !pings.length) return;
      const now = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const newDevices = {};
      const newSpeedAlerts = [];
      const newDeviations = [];
      const newEvents = [];
      const latestPerDevice = {};
      const trailPerDevice = {};

      for (const ping of pings) {
        const id = ping.device_id || "device-1";
        const age = (Date.now() - new Date(ping.created_at).getTime()) / 1000;
        if (age > 300) continue;
        if (!latestPerDevice[id]) { latestPerDevice[id] = ping; trailPerDevice[id] = []; }
        if (trailPerDevice[id].length < 20) trailPerDevice[id].push({ lat: ping.lat, lon: ping.lon });

        if (!seenPingIds.current.has(ping.id)) {
          seenPingIds.current.add(ping.id);
          const mph = ((ping.speed ?? 0) * 2.237);
          const name = ping.device_name || ping.device_label || "Phone";

          if (mph > SPEED_THRESHOLD_MPH) {
            newSpeedAlerts.push(id);
            newEvents.push({ id: Date.now() + Math.random(), type: "speed", msg: name + " — SPEED: " + mph.toFixed(1) + " mph", time: now });
            dispatchAlert({
              alertType: "Speed Threshold Exceeded",
              deviceId: id,
              location: ping.lat.toFixed(4) + "N " + Math.abs(ping.lon).toFixed(4) + "W",
              severity: "Warning",
              details: [["Speed", mph.toFixed(1) + " mph"], ["Threshold", SPEED_THRESHOLD_MPH + " mph"], ["Device", name]],
            });
          }

          // Route deviation check
          for (const route of savedRoutes) {
            if (route.assignedDevice !== "all" && route.assignedDevice !== id) continue;
            const dist = distanceFromRoute(ping.lat, ping.lon, route.waypoints);
            if (dist > route.corridorMeters) {
              newDeviations.push(route.id);
              newEvents.push({ id: Date.now() + Math.random(), type: "route", msg: name + " — Route deviation: " + Math.round(dist) + "m outside " + route.name, time: now });
              dispatchAlert({
                alertType: "Route Deviation Detected",
                deviceId: id,
                location: ping.lat.toFixed(4) + "N " + Math.abs(ping.lon).toFixed(4) + "W",
                severity: "Critical",
                details: [["Route", route.name], ["Deviation", Math.round(dist) + "m outside corridor"], ["Device", name]],
              });
            }
          }

          newEvents.push({ id: Date.now() + Math.random(), type: "live", msg: name + " — " + ping.lat.toFixed(4) + "N " + Math.abs(ping.lon).toFixed(4) + "W · " + ((ping.speed??0)*2.237).toFixed(1) + " mph", time: now });
        }
      }

      for (const [id, ping] of Object.entries(latestPerDevice)) {
        newDevices[id] = {
          lat: ping.lat, lon: ping.lon, speed: ping.speed ?? 0,
          name: ping.device_name || ping.device_label || "Phone",
          trail: (trailPerDevice[id] || []).reverse(),
          timestamp: new Date(ping.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        };
      }

      setLiveDevices(newDevices);
      setSpeedAlerts(newSpeedAlerts);
      setRouteDeviations(newDeviations);
      setLastScan(now);
      if (newEvents.length) setTicker((prev) => [...newEvents, ...prev].slice(0, 14));
    };

    poll();
    const interval = setInterval(poll, 4000);
    return () => clearInterval(interval);
  }, [savedRoutes]);

  const handleMapClick = useCallback((coord) => {
    if (drawingMode) setNewRouteWaypoints((prev) => [...prev, coord]);
  }, [drawingMode]);

  const handleSaveRoute = async ({ name, corridorMeters: cm, assignedDevice }) => {
    if (newRouteWaypoints.length < 2) { alert("Please click at least 2 points on the map to define a route."); return; }
    const route = {
      name,
      waypoints: newRouteWaypoints,
      corridorMeters: cm,
      assignedDevice,
      created_at: new Date().toISOString(),
    };
    await saveRoute(route);
    setSavedRoutes((prev) => [{ ...route, id: Date.now() }, ...prev]);
    setNewRouteWaypoints([]);
    if (mapRef.current) mapRef.current.clearWaypointMarkers?.();
    setDrawingMode(false);
    setShowRouteManager(false);
  };

  const handleDeleteRoute = async (id) => {
    // 1. Remove from map immediately
    if (mapRef.current) {
      const mapInstance = mapRef.current.getMap();
      const srcId = "route-" + id;
      try {
        if (mapInstance) {
          if (mapInstance.getLayer(srcId + "-corridor")) mapInstance.removeLayer(srcId + "-corridor");
          if (mapInstance.getLayer(srcId + "-line")) mapInstance.removeLayer(srcId + "-line");
          if (mapInstance.getSource(srcId)) mapInstance.removeSource(srcId);
        }
      } catch (e) { console.warn("Layer cleanup:", e); }
    }
    // 2. Remove from React state immediately
    setSavedRoutes((prev) => prev.filter((r) => r.id !== id));
    // 3. Delete from Supabase in background
    deleteRoute(id);
  };

  const runLiveScan = () => {
    setLiveScanRunning(true);
    setTimeout(() => {
      const next = LIVE_SCAN_EVENTS[ticker.length % LIVE_SCAN_EVENTS.length];
      const now = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      setTicker((prev) => [{ ...next, id: Date.now(), time: now }, ...prev].slice(0, 14));
      setLastScan(now);
      setScanToast(true);
      setLiveScanRunning(false);
      setTimeout(() => setScanToast(false), 2500);
    }, 1400);
  };

  const liveCount = Object.keys(liveDevices).length;
  const TEAM_STYLE = { Assigned: "bg-blue-900/60 text-blue-300 ring-1 ring-blue-700", Available: "bg-emerald-900/60 text-emerald-300 ring-1 ring-emerald-700" };

  return (
    <div className="flex flex-col h-full bg-gray-950 overflow-hidden">

      {/* Escalation modal */}
      {escalateTarget && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="px-6 py-5 border-b border-gray-800 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"/>
                  <span className="text-xs font-bold text-red-400 uppercase tracking-widest">Escalation Required</span>
                </div>
                <h2 className="text-lg font-bold text-white">{escalateTarget.shipmentId}</h2>
                <p className="text-gray-400 text-sm">{escalateTarget.carrier} · {escalateTarget.location}</p>
              </div>
              <SeverityBadge s={escalateTarget.severity}/>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="flex flex-wrap gap-1.5">
                {escalateTarget.rules.map((r) => <span key={r} className="text-xs bg-gray-800 text-gray-300 border border-gray-700 px-2.5 py-1 rounded-full">{r}</span>)}
              </div>
              <p className="text-xl font-bold text-white">{fmtCurrency(escalateTarget.cargoValue)}</p>
              <div className="bg-gray-800 rounded-xl p-4"><p className="text-sm text-gray-300 leading-relaxed">{escalateTarget.recommendation}</p></div>
            </div>
            <div className="px-6 pb-6 grid grid-cols-2 gap-2">
              <button onClick={() => { onNav("incidents"); setEscalateTarget(null); }} className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold py-2.5 rounded-xl">Create Incident</button>
              <button onClick={() => { onNav("recovery"); setEscalateTarget(null); }} className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2.5 rounded-xl">Assign Team</button>
              <button onClick={() => setEscalateTarget(null)} className="bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold py-2.5 rounded-xl">Generate LE Packet</button>
              <button onClick={() => setEscalateTarget(null)} className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold py-2.5 rounded-xl border border-gray-700">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {scanToast && (
        <div className="fixed top-4 right-4 z-40 bg-emerald-900 border border-emerald-700 text-emerald-300 text-sm font-semibold px-5 py-3 rounded-xl shadow-xl flex items-center gap-2">
          <span className="text-emerald-400">✓</span> Live scan completed · {lastScan}
        </div>
      )}

      {speedAlerts.length > 0 && (
        <div className="bg-red-950 border-b border-red-800 px-6 py-2 flex items-center gap-3 flex-shrink-0">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"/>
          <span className="text-xs font-bold text-red-400 uppercase tracking-widest">Speed Alert</span>
          <span className="text-xs text-red-300">Device exceeding {SPEED_THRESHOLD_MPH} mph threshold</span>
        </div>
      )}

      {routeDeviations.length > 0 && (
        <div className="bg-orange-950/80 border-b border-orange-800 px-6 py-2 flex items-center gap-3 flex-shrink-0">
          <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"/>
          <span className="text-xs font-bold text-orange-400 uppercase tracking-widest">Route Deviation</span>
          <span className="text-xs text-orange-300">Device outside approved route corridor</span>
        </div>
      )}

      {/* Header */}
      <div className="bg-gray-950 border-b border-gray-800 px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-white text-base font-bold tracking-tight">Divvo Guardian Command Center</p>
            <span className="flex items-center gap-1.5 bg-red-950/60 border border-red-800/50 text-red-400 text-xs font-bold px-2.5 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"/>LIVE
            </span>
            {liveCount > 0 && (
              <span className="flex items-center gap-1.5 bg-emerald-950/60 border border-emerald-800/50 text-emerald-400 text-xs font-bold px-2.5 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"/>
                {liveCount} DEVICE{liveCount > 1 ? "S" : ""} LIVE
              </span>
            )}
            {savedRoutes.length > 0 && (
              <span className="text-xs bg-blue-950/60 border border-blue-800/40 text-blue-400 px-2.5 py-0.5 rounded-full font-semibold">
                {savedRoutes.length} route{savedRoutes.length > 1 ? "s" : ""} active
              </span>
            )}
          </div>
          <p className="text-gray-500 text-xs mt-0.5">Mapbox live map · Route deviation detection · Speed monitoring</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right mr-1">
            <p className="text-gray-500 text-xs">Last poll</p>
            <p className="text-gray-300 text-xs font-mono font-semibold">{lastScan}</p>
          </div>
          <a href="/gps.html" target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border border-blue-600 bg-blue-700 text-white hover:bg-blue-600 transition-all">
            📍 Phone GPS
          </a>
          <button
            onClick={() => { setShowRouteManager(true); setDrawingMode(true); }}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border border-purple-600 bg-purple-700 text-white hover:bg-purple-600 transition-all">
            🗺 Draw Route
          </button>
          <button onClick={runLiveScan} disabled={liveScanRunning}
            className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border transition-all ${
              liveScanRunning ? "bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed" : "bg-emerald-700 border-emerald-600 text-white hover:bg-emerald-600"
            }`}>
            {liveScanRunning ? "Scanning..." : "Run Scan"}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left — Map */}
        <div className="flex flex-col flex-1 min-w-0 border-r border-gray-800">
          <div className="px-4 py-2 border-b border-gray-800 flex items-center justify-between bg-gray-900/50 flex-shrink-0">
            <div className="flex items-center gap-3">
              <p className="text-xs font-bold text-gray-300 uppercase tracking-widest">Live Map</p>
              {drawingMode && <span className="text-xs bg-purple-900/60 border border-purple-700 text-purple-300 px-2 py-0.5 rounded font-semibold animate-pulse">DRAWING MODE — Click map to add waypoints</span>}
            </div>
            <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded font-mono">{4 + liveCount} assets · {savedRoutes.length} routes</span>
          </div>

          <div className="flex-1 p-2 relative">
            <MapboxMap
              ref={mapRef}
              liveDevices={liveDevices}
              speedAlerts={speedAlerts}
              savedRoutes={savedRoutes}
              routeDeviations={routeDeviations}
              drawingMode={drawingMode}
              onMapClick={handleMapClick}
              newRouteWaypoints={newRouteWaypoints}
              corridorMeters={corridorMeters}
            />
            {showRouteManager && (
              <RouteManagerPanel
                savedRoutes={savedRoutes}
                waypointCount={newRouteWaypoints.length}
                onSave={handleSaveRoute}
                onUndo={() => {
                  setNewRouteWaypoints((prev) => prev.slice(0, -1));
                  if (mapRef.current) {
                    const markers = mapRef.current.clearWaypointMarkers && mapRef.current;
                    // Will be redrawn by useEffect with one fewer point
                  }
                }}
                onClear={() => {
                  setNewRouteWaypoints([]);
                  if (mapRef.current) mapRef.current.clearWaypointMarkers?.();
                }}
                onDelete={handleDeleteRoute}
                onClose={() => {
                  setShowRouteManager(false);
                  setDrawingMode(false);
                  setNewRouteWaypoints([]);
                  if (mapRef.current) mapRef.current.clearWaypointMarkers?.();
                }}
              />
            )}
          </div>

          {/* Ticker */}
          <div className="border-t border-gray-800 bg-gray-900/60 flex-shrink-0" style={{ height: "130px" }}>
            <div className="px-4 py-1.5 border-b border-gray-800/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse"/>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Live Activity</p>
              </div>
              <span className="text-xs text-gray-600 font-mono">{ticker.length} events</span>
            </div>
            <div className="overflow-y-auto" style={{ height: "88px" }}>
              {ticker.map((event) => {
                const style = TICKER_COLORS[event.type] || TICKER_COLORS.gps;
                return (
                  <div key={event.id} className="flex items-center gap-3 px-4 py-1.5 hover:bg-gray-800/40 border-b border-gray-800/30 last:border-0">
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${style.dot}`}/>
                    <span className="text-xs font-mono text-gray-500 flex-shrink-0 w-20">{event.time}</span>
                    <span className={`text-xs ${style.text} flex-1 truncate`}>{event.msg}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="w-72 flex flex-col flex-shrink-0 overflow-hidden">
          <div className="border-b border-gray-800 px-4 py-2.5 bg-gray-900/50 flex items-center justify-between flex-shrink-0">
            <p className="text-xs font-bold text-gray-300 uppercase tracking-widest">Threat Queue</p>
            <span className="text-xs font-bold text-red-400">{THREAT_QUEUE.length} active</span>
          </div>

          <div className="overflow-y-auto flex-1">
            {THREAT_QUEUE.map((threat) => (
              <div key={threat.shipmentId} className={`border-b border-gray-800 p-3 ${threat.severity === "Critical" ? "bg-red-950/20" : threat.severity === "High" ? "bg-orange-950/10" : ""}`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-mono text-xs font-bold text-white">{threat.shipmentId}</p>
                    <p className="text-xs text-gray-500">{threat.carrier}</p>
                  </div>
                  <SeverityBadge s={threat.severity}/>
                </div>
                <p className="text-xs text-gray-400 mb-2 leading-relaxed">{threat.location}</p>
                <div className="flex flex-wrap gap-1 mb-2">
                  {threat.rules.map((r) => <span key={r} className="text-xs bg-gray-800 border border-gray-700 text-gray-400 px-1.5 py-0.5 rounded">{r}</span>)}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => onNav("recovery")} className="flex-1 bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold py-1.5 rounded-lg">Open Case</button>
                  <button onClick={() => setEscalateTarget(threat)} className={`flex-1 text-white text-xs font-bold py-1.5 rounded-lg ${threat.severity === "Critical" ? "bg-red-700 hover:bg-red-600" : "bg-orange-700 hover:bg-orange-600"}`}>Escalate</button>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-gray-800 flex-shrink-0" style={{ maxHeight: "260px", overflowY: "auto" }}>
            <div className="px-4 py-2.5 border-b border-gray-800 bg-gray-900/50 sticky top-0 flex items-center justify-between">
              <p className="text-xs font-bold text-gray-300 uppercase tracking-widest">Recovery Teams</p>
              <span className="text-xs text-emerald-400 font-semibold">2 available</span>
            </div>
            {RECOVERY_TEAMS.map((team) => (
              <div key={team.id} className="px-4 py-3 border-b border-gray-800/60 last:border-0">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-bold text-white">{team.name}</p>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TEAM_STYLE[team.status]}`}>{team.status}</span>
                </div>
                <p className="text-xs text-gray-500 mb-0.5">{team.location} · {team.lead}</p>
                {team.status === "Assigned" && <p className="text-xs text-blue-400 font-mono mb-1">{team.assignment}</p>}
                <button className={`w-full text-xs font-bold py-1.5 rounded-lg mt-1 ${team.status === "Available" ? "bg-blue-700 hover:bg-blue-600 text-white" : "bg-gray-800 border border-gray-700 text-gray-400"}`}>
                  {team.status === "Available" ? "Assign Team" : "View Assignment"}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
