import { SB_URL, sbHeaders } from "./supabase.js";

// Shapes a dashboard_shipments row (snake_case) into the same camelCase
// shape the mock SHIPMENTS array uses (src/data/shipments.js) — every
// existing consumer of SHIPMENTS can't tell a real row from a mock one.
function toCamelShipment(row) {
  return {
    id: row.id,
    customer: row.customer,
    cargoType: row.cargo_type,
    containerNumber: row.container_number,
    originPort: row.origin_port,
    destination: row.destination,
    carrier: row.carrier,
    status: row.status,
    riskScore: row.risk_score,
    riskLevel: row.risk_level,
    cargoValue: row.cargo_value != null ? Number(row.cargo_value) : null,
    lastLocation: row.last_location,
    eta: row.eta,
    sealStatus: row.seal_status,
    doorStatus: row.door_status,
    trackerBattery: row.tracker_battery,
    route: row.route,
  };
}

export async function fetchLiveShipments() {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/dashboard_shipments?select=*&order=created_at.asc`, {
      headers: sbHeaders(),
    });
    const rows = await res.json();
    if (!Array.isArray(rows)) return [];
    return rows.map(toCamelShipment);
  } catch {
    return [];
  }
}

// Writes go through api/add-shipment.js (service_role key, bypasses RLS,
// and validates the caller is a real dispatcher-or-above session) — the
// anon key used everywhere else in this file can only read.
export async function createShipment(accessToken, payload) {
  const res = await fetch("/api/add-shipment", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to create shipment");
  return data.shipment;
}
