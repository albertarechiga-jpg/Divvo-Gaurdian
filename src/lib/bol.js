// Client helper for the Digital BOL flow (api/submit-bol.js, api/submit-bol-delivery.js).
import { SB_URL, authHeaders } from "./supabase.js";

// SHA-256 hash of a signature canvas's data URL, computed entirely in the
// browser via the native Web Crypto API (no library) — the raw signature
// image never leaves this function, only the hash returned here does.
export async function hashDataUrl(dataUrl) {
  const bytes = new TextEncoder().encode(dataUrl);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function submitBol(accessToken, payload) {
  const res = await fetch("/api/submit-bol", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to submit BOL");
  return data;
}

export async function submitBolDelivery(accessToken, payload) {
  const res = await fetch("/api/submit-bol-delivery", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to submit delivery");
  return data;
}

// Reads with the caller's own session (not the anon key) — bols_select_staff
// RLS requires organization_id = current_org_id(), which only resolves via
// a real logged-in user's auth.uid(). Returns null if this mock shipment has
// never had a BOL bridged for it yet (the common case).
export async function fetchLatestBolForShipment(accessToken, legacyShipmentId) {
  const headers = authHeaders(accessToken);

  const shipRes = await fetch(
    `${SB_URL}/rest/v1/shipments?select=id&legacy_shipment_id=eq.${encodeURIComponent(legacyShipmentId)}&limit=1`,
    { headers }
  );
  if (!shipRes.ok) return null;
  const [v2Shipment] = await shipRes.json();
  if (!v2Shipment) return null;

  const bolRes = await fetch(
    `${SB_URL}/rest/v1/digital_bols?select=id,bol_number,status,mission_id,pickup_location,delivery_location,cargo_description,declared_value_cents,issued_at&shipment_id=eq.${v2Shipment.id}&order=created_at.desc&limit=1`,
    { headers }
  );
  if (!bolRes.ok) return null;
  const [bol] = await bolRes.json();
  return bol || null;
}
