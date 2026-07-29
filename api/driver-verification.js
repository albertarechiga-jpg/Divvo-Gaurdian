// Server-only: driver-verification actions, combined into one function to
// stay under Vercel Hobby's 12-Serverless-Functions-per-deployment cap.
// action "get-url" mirrors the old api/get-driver-verification-url.js
// (any staff role, signs the private selfie/ID photos for viewing).
// action "review" mirrors the old api/review-driver-verification.js — the
// single action that actually authorizes cargo release. api/submit-bol.js
// creates a BOL as "pending_verification" with two real captured photos and
// nothing else; this is where an admin (deliberately admin-only, not
// dispatcher-or-above like every other write this feature touches) looks at
// those photos and decides. Approve flips the BOL to "signed_pickup"; reject
// flips it to "verification_rejected". Both write a chain-of-custody event
// describing what was actually decided, not what was attempted — "pickup" is
// only ever logged here, once release is actually authorized, never at
// submission time.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const BUCKET = "driver-verification";
const EXPIRES_IN_SECONDS = 300;

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

  const { action, verificationId } = req.body || {};
  if (!verificationId) {
    return res.status(400).json({ error: "Missing verificationId" });
  }

  try {
    // Validate the caller's token is a real, live Supabase session.
    const callerRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${callerToken}` },
    });
    if (!callerRes.ok) {
      return res.status(401).json({ error: "Invalid or expired session" });
    }
    const caller = await callerRes.json();

    if (action === "review") {
      return await handleReview(req, res, caller);
    }
    return await handleGetUrl(req, res, caller);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function handleGetUrl(req, res, caller) {
  const { verificationId } = req.body || {};

  const serviceHeaders = {
    "Content-Type": "application/json",
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  };

  // Confirm the caller is staff (any role) in the org this verification's
  // driver belongs to.
  const callerRolesRes = await fetch(
    `${SUPABASE_URL}/rest/v1/user_roles?select=organization_id&user_id=eq.${caller.id}`,
    { headers: serviceHeaders }
  );
  const callerRoles = await callerRolesRes.json();
  const callerOrgIds = new Set((Array.isArray(callerRoles) ? callerRoles : []).map((r) => r.organization_id));
  if (callerOrgIds.size === 0) {
    return res.status(403).json({ error: "No role assigned" });
  }

  const verRes = await fetch(
    `${SUPABASE_URL}/rest/v1/driver_verifications?select=id,selfie_storage_path,id_photo_storage_path,drivers(carriers(organization_id))&id=eq.${verificationId}`,
    { headers: serviceHeaders }
  );
  const [verification] = await verRes.json();
  if (!verification) return res.status(404).json({ error: "Verification not found" });
  if (!callerOrgIds.has(verification.drivers?.carriers?.organization_id)) {
    return res.status(403).json({ error: "This verification does not belong to your organization" });
  }

  async function sign(path) {
    if (!path) return null;
    const signRes = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${path}`, {
      method: "POST",
      headers: serviceHeaders,
      body: JSON.stringify({ expiresIn: EXPIRES_IN_SECONDS }),
    });
    if (!signRes.ok) return null;
    const { signedURL } = await signRes.json();
    return `${SUPABASE_URL}/storage/v1${signedURL}`;
  }
  const [selfieUrl, idPhotoUrl] = await Promise.all([
    sign(verification.selfie_storage_path),
    sign(verification.id_photo_storage_path),
  ]);

  return res.status(200).json({ selfieUrl, idPhotoUrl });
}

async function handleReview(req, res, caller) {
  const { verificationId, decision, notes } = req.body || {};
  if (!["approve", "reject"].includes(decision)) {
    return res.status(400).json({ error: "decision must be 'approve' or 'reject'" });
  }
  if (decision === "reject" && !notes?.trim()) {
    return res.status(400).json({ error: "A reason is required to reject a verification" });
  }

  const serviceHeaders = {
    "Content-Type": "application/json",
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    Prefer: "return=representation",
  };

  // Confirm the caller is specifically an admin — authorizing cargo release
  // is a deliberately higher bar than dispatcher-or-above, which is what
  // every other write in this feature requires.
  const callerRolesRes = await fetch(
    `${SUPABASE_URL}/rest/v1/user_roles?select=role,organization_id&user_id=eq.${caller.id}`,
    { headers: serviceHeaders }
  );
  const callerRoles = await callerRolesRes.json();
  const adminRow = Array.isArray(callerRoles) ? callerRoles.find((r) => r.role === "admin") : null;
  if (!adminRow) {
    return res.status(403).json({ error: "Only admins can approve or reject a driver verification" });
  }

  // Load the verification and confirm it belongs to the caller's org, via
  // driver -> carrier -> organization.
  const verRes = await fetch(
    `${SUPABASE_URL}/rest/v1/driver_verifications?select=id,driver_id,result,drivers(carriers(organization_id))&id=eq.${verificationId}`,
    { headers: serviceHeaders }
  );
  const [verification] = await verRes.json();
  if (!verification) return res.status(404).json({ error: "Verification not found" });
  if (verification.drivers?.carriers?.organization_id !== adminRow.organization_id) {
    return res.status(403).json({ error: "This verification does not belong to your organization" });
  }
  if (verification.result !== "pending") {
    return res.status(409).json({ error: `This verification has already been decided (result: ${verification.result})` });
  }

  // Find the BOL this verification's signature is attached to.
  const sigRes = await fetch(
    `${SUPABASE_URL}/rest/v1/bol_signatures?select=bol_id,digital_bols(id,bol_number,mission_id,status)&driver_verification_id=eq.${verificationId}&signer_type=eq.driver&limit=1`,
    { headers: serviceHeaders }
  );
  const [sigRow] = await sigRes.json();
  const bolRow = sigRow?.digital_bols;
  if (!bolRow) return res.status(404).json({ error: "No BOL found for this verification" });
  if (bolRow.status !== "pending_verification") {
    return res.status(409).json({ error: `This BOL is not awaiting verification (status: ${bolRow.status})` });
  }

  const now = new Date().toISOString();
  const approved = decision === "approve";

  // Record the decision on the verification itself.
  const updateVerRes = await fetch(`${SUPABASE_URL}/rest/v1/driver_verifications?id=eq.${verificationId}`, {
    method: "PATCH",
    headers: serviceHeaders,
    body: JSON.stringify({
      result: approved ? "passed" : "failed",
      reviewed_by: caller.id,
      reviewed_at: now,
      review_notes: notes?.trim() || null,
      verified_at: approved ? now : null,
    }),
  });
  if (!updateVerRes.ok) {
    const err = await updateVerRes.json().catch(() => ({}));
    return res.status(500).json({ error: `Failed to record decision: ${err.message || updateVerRes.status}` });
  }

  // Flip the BOL's status to match.
  const updateBolRes = await fetch(`${SUPABASE_URL}/rest/v1/digital_bols?id=eq.${bolRow.id}`, {
    method: "PATCH",
    headers: serviceHeaders,
    body: JSON.stringify({
      status: approved ? "signed_pickup" : "verification_rejected",
      updated_at: now,
    }),
  });
  if (!updateBolRes.ok) {
    const err = await updateBolRes.json().catch(() => ({}));
    return res.status(500).json({ error: `Failed to update BOL status: ${err.message || updateBolRes.status}` });
  }

  // Chain-of-custody entry — "pickup" only ever gets logged here, at the
  // moment release is actually authorized, not at submission.
  const description = approved
    ? `Pickup verification approved by ${caller.email} — BOL ${bolRow.bol_number} authorized for release`
    : `Pickup verification REJECTED by ${caller.email} — ${notes.trim()}`;
  const coCRes = await fetch(`${SUPABASE_URL}/rest/v1/chain_of_custody_events`, {
    method: "POST",
    headers: serviceHeaders,
    body: JSON.stringify({
      mission_id: bolRow.mission_id,
      event_type: approved ? "pickup" : "incident_action",
      actor_type: "dispatcher",
      actor_user_id: caller.id,
      description,
      occurred_at: now,
    }),
  });
  if (!coCRes.ok) {
    const err = await coCRes.json().catch(() => ({}));
    console.error("Failed to log verification-decision chain-of-custody event:", err.message || coCRes.status);
  }

  return res.status(200).json({ result: approved ? "passed" : "failed", bolStatus: approved ? "signed_pickup" : "verification_rejected" });
}
