// Server-only: creates a real, persisted shipment (dashboard_shipments —
// distinct from the v2 Mission Engine's `shipments` table, which has a
// different shape/purpose and is only populated automatically via BOL
// creation). Unlike api/add-company.js (built before real auth existed,
// no caller check at all), this validates the caller like the BOL
// endpoints do — dispatcher-or-above — since that's the better, current
// pattern and there's no reason to repeat the older gap on a new endpoint.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

// Shapes a dashboard_shipments row (snake_case) into the same camelCase
// shape the mock SHIPMENTS array uses, so every existing consumer (8 files
// that import SHIPMENTS directly) can't tell a real row from a mock one.
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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
    return res.status(500).json({ error: "Server not configured: missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or VITE_SUPABASE_ANON_KEY" });
  }

  const authHeader = req.headers.authorization || "";
  const callerToken = authHeader.replace(/^Bearer\s+/i, "");
  if (!callerToken) {
    return res.status(401).json({ error: "Missing Authorization bearer token" });
  }

  const { companyId, customer, cargoType, containerNumber, originPort, destination, carrier, cargoValue, eta } = req.body || {};
  if (!companyId || !customer || !destination) {
    return res.status(400).json({ error: "Missing companyId, customer, or destination" });
  }

  try {
    // 1. Validate the caller's token is a real, live Supabase session.
    const callerRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${callerToken}` },
    });
    if (!callerRes.ok) {
      return res.status(401).json({ error: "Invalid or expired session" });
    }
    const caller = await callerRes.json();

    const serviceHeaders = {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      Prefer: "return=representation",
    };

    // 2. Confirm the caller holds dispatcher-or-above (service-role read,
    //    bypasses RLS deliberately — this IS the authorization check).
    const callerRolesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_roles?select=role&user_id=eq.${caller.id}`,
      { headers: serviceHeaders }
    );
    const callerRoles = await callerRolesRes.json();
    const staffRow = Array.isArray(callerRoles) ? callerRoles.find((r) => r.role === "admin" || r.role === "dispatcher") : null;
    if (!staffRow) {
      return res.status(403).json({ error: "Only dispatchers or admins can add a shipment" });
    }

    // 3. Create the shipment. id prefix guarantees no collision with mock
    //    ids like "OWL-HOU-1001".
    const id = `LIVE-${companyId.toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const shipRes = await fetch(`${SUPABASE_URL}/rest/v1/dashboard_shipments`, {
      method: "POST",
      headers: serviceHeaders,
      body: JSON.stringify({
        id,
        company_id: companyId,
        customer,
        cargo_type: cargoType || null,
        container_number: containerNumber || null,
        origin_port: originPort || null,
        destination,
        carrier: carrier || null,
        cargo_value: cargoValue || null,
        last_location: originPort || null,
        eta: eta || null,
        route: originPort && destination ? `${originPort} → ${destination}` : null,
      }),
    });
    if (!shipRes.ok) {
      const err = await shipRes.json().catch(() => ({}));
      return res.status(500).json({ error: `Failed to create shipment: ${err.message || shipRes.status}` });
    }
    const [row] = await shipRes.json();

    return res.status(201).json({ shipment: toCamelShipment(row) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
