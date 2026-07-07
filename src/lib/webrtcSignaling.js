import { SB_URL, sbHeaders } from "./supabase.js";

// Polling-based WebRTC signaling channel over the `webrtc_signals` Supabase
// table — the dashboard is always the "viewer" side, the physical/simulated
// device is always the "cam" side.
export async function sendSignal(deviceId, type, payload) {
  await fetch(SB_URL + "/rest/v1/webrtc_signals", {
    method: "POST",
    headers: sbHeaders({ "Content-Type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify({ device_id: deviceId + "-viewer", type, payload }),
  });
}

export async function pollSignal(deviceId, type) {
  const res = await fetch(
    SB_URL + "/rest/v1/webrtc_signals?device_id=eq." + deviceId + "-cam&type=eq." + type + "&order=created_at.desc&limit=1",
    { headers: sbHeaders() }
  );
  const rows = await res.json();
  return rows?.[0] ?? null;
}
