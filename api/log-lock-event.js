// Server-only: logs a lock/unlock/tamper/forced-open event for a mission's
// Guardian device. Mirrors api/submit-bol-delivery.js's exact pattern:
// validate the caller is a real, currently-authenticated dispatcher-or-
// above, then use the service-role key for the actual write.
//
// This one is required even more strictly than the others: lock_events has
// NO client-facing insert policy at all in the schema (device/service-role
// only, by design — a dispatcher's browser session should never be able to
// fake a hardware lock signal). "Locked"/"Unlocked" here are real staff-
// initiated remote actions (triggered_by: dispatcher_remote — a real
// Guardian device does support remote lock/unlock from ops). "Tamper
// Detected"/"Forced Open" are simulated hardware-detected events
// (triggered_by: automatic) since there's no real Guardian hardware in this
// pilot — the client gates these behind an extra confirm step for the same
// reason Incident Action custody entries are gated.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const VALID_EVENT_TYPES = ["locked", "unlocked", "tamper_detected", "forced_open"];

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

  const { missionId, eventType } = req.body || {};
  if (!missionId || !VALID_EVENT_TYPES.includes(eventType)) {
    return res.status(400).json({ error: "Missing missionId or invalid eventType" });
  }
  const triggeredBy = (eventType === "locked" || eventType === "unlocked") ? "dispatcher_remote" : "automatic";

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
      `${SUPABASE_URL}/rest/v1/user_roles?select=role,organization_id&user_id=eq.${caller.id}`,
      { headers: serviceHeaders }
    );
    const callerRoles = await callerRolesRes.json();
    const staffRow = Array.isArray(callerRoles) ? callerRoles.find((r) => r.role === "admin" || r.role === "dispatcher") : null;
    if (!staffRow) {
      return res.status(403).json({ error: "Only dispatchers or admins can log a lock event" });
    }
    const organizationId = staffRow.organization_id;

    // 3. Look up the mission's guardian, confirm org match.
    const missionRes = await fetch(
      `${SUPABASE_URL}/rest/v1/missions?select=id,organization_id,guardian_id&id=eq.${missionId}`,
      { headers: serviceHeaders }
    );
    const [missionRow] = await missionRes.json();
    if (!missionRow) {
      return res.status(404).json({ error: "Mission not found" });
    }
    if (missionRow.organization_id !== organizationId) {
      return res.status(403).json({ error: "This mission does not belong to your organization" });
    }
    if (!missionRow.guardian_id) {
      return res.status(409).json({ error: "This mission has no Guardian device assigned yet" });
    }

    // 4. The lock event itself.
    const eventRes = await fetch(`${SUPABASE_URL}/rest/v1/lock_events`, {
      method: "POST",
      headers: serviceHeaders,
      body: JSON.stringify({
        mission_id: missionRow.id,
        guardian_id: missionRow.guardian_id,
        event_type: eventType,
        triggered_by: triggeredBy,
        occurred_at: new Date().toISOString(),
      }),
    });
    if (!eventRes.ok) {
      const err = await eventRes.json().catch(() => ({}));
      return res.status(500).json({ error: `Failed to log lock event: ${err.message || eventRes.status}` });
    }
    const [event] = await eventRes.json();

    return res.status(201).json({ eventId: event.id, eventType, triggeredBy });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
