// Server-only: files or updates an insurance claim for a mission. This is a
// table I created fresh this session (not part of the original v2 Mission
// Engine migration), so it follows the dashboard_shipments/companies
// convention instead — no RLS, writes only through this service-role
// endpoint, validated the same dispatcher-or-above way as every other
// write path this session.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const VALID_STATUSES = ["not_filed", "filed", "under_review", "approved", "denied", "paid"];

function centsFromDollars(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
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

  const {
    missionId, insurerName, policyNumber, claimNumber,
    adjusterName, adjusterPhone, adjusterEmail, status, estimatedPayout, notes,
  } = req.body || {};
  if (!missionId) {
    return res.status(400).json({ error: "Missing missionId" });
  }
  const claimStatus = VALID_STATUSES.includes(status) ? status : "not_filed";

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
      return res.status(403).json({ error: "Only dispatchers or admins can file an insurance claim" });
    }

    // 3. Confirm the mission belongs to the caller's org.
    const missionRes = await fetch(
      `${SUPABASE_URL}/rest/v1/missions?select=id,organization_id&id=eq.${missionId}`,
      { headers: serviceHeaders }
    );
    const [missionRow] = await missionRes.json();
    if (!missionRow) return res.status(404).json({ error: "Mission not found" });
    if (missionRow.organization_id !== staffRow.organization_id) {
      return res.status(403).json({ error: "This mission does not belong to your organization" });
    }

    // 4. Preserve the original claim_filed_at on repeat edits — this upsert
    //    handles both "file a new claim" and "update an existing one", and
    //    without this check, editing e.g. just the notes on an already-filed
    //    claim would silently bump its filed date to right now.
    const existingRes = await fetch(
      `${SUPABASE_URL}/rest/v1/insurance_claims?select=claim_filed_at&mission_id=eq.${missionId}`,
      { headers: serviceHeaders }
    );
    const [existingClaim] = await existingRes.json();
    const claimFiledAt = existingClaim?.claim_filed_at
      ?? (claimStatus === "not_filed" ? null : new Date().toISOString());

    // 5. Upsert on mission_id — one claim per mission, this endpoint
    //    handles both "file a new claim" and "update an existing one",
    //    same on_conflict technique used for shipments.legacy_shipment_id
    //    in api/submit-bol.js.
    const claimRes = await fetch(`${SUPABASE_URL}/rest/v1/insurance_claims?on_conflict=mission_id`, {
      method: "POST",
      headers: { ...serviceHeaders, Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        mission_id: missionId,
        insurer_name: insurerName || null,
        policy_number: policyNumber || null,
        claim_number: claimNumber || null,
        adjuster_name: adjusterName || null,
        adjuster_phone: adjusterPhone || null,
        adjuster_email: adjusterEmail || null,
        status: claimStatus,
        estimated_payout_cents: centsFromDollars(estimatedPayout),
        notes: notes || null,
        claim_filed_at: claimFiledAt,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!claimRes.ok) {
      const err = await claimRes.json().catch(() => ({}));
      return res.status(500).json({ error: `Failed to save insurance claim: ${err.message || claimRes.status}` });
    }
    const [claim] = await claimRes.json();

    return res.status(200).json({ claim });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
