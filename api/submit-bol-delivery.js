// Server-only: completes a Digital BOL's delivery leg (v2 Mission Engine
// schema) — records a receiver_verifications row, a second bol_signatures
// row (signer_type: "receiver"), and advances digital_bols.status to
// "signed_delivery". Mirrors api/submit-bol.js's exact pattern: validate the
// caller is a real, currently-authenticated dispatcher-or-above, then use
// the service-role key for the actual writes.
//
// Same RLS reality as the pickup flow: receiver_verifications_insert_driver
// and the driver-scoped bol_signatures insert policy both assume the
// driver's own session captures the receiver's verification at the point of
// delivery (real-world correct — the driver hands their device to the
// receiver). This pilot has no driver login/portal, so a staff member
// facilitates it from the dashboard instead, and this endpoint is the one
// place allowed to write the result on the driver's behalf.
//
// Verification is simulated (provider: "simulated") — no real ID-
// verification vendor is configured. The receiver's signature image is
// never sent here or stored anywhere, only its SHA-256 hash (computed
// client-side, see src/lib/bol.js).
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const VALID_VERIFICATION_TYPES = ["signature", "government_id", "biometric_face", "qr_code"];

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

  const { bolId, receiverName, receiverPhone, verificationType, signatureHash, consentGiven } = req.body || {};
  if (!bolId || !receiverName || !signatureHash) {
    return res.status(400).json({ error: "Missing bolId, receiverName, or signatureHash" });
  }
  if (!consentGiven) {
    return res.status(400).json({ error: "Receiver consent is required before verification can be recorded" });
  }
  const vType = VALID_VERIFICATION_TYPES.includes(verificationType) ? verificationType : "signature";

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
      return res.status(403).json({ error: "Only dispatchers or admins can complete a delivery" });
    }
    const organizationId = staffRow.organization_id;

    // 3. Look up the BOL + its mission, confirm it belongs to the caller's
    //    org and is actually awaiting delivery.
    const bolRes = await fetch(
      `${SUPABASE_URL}/rest/v1/digital_bols?select=id,bol_number,status,mission_id,missions(organization_id,driver_id)&id=eq.${bolId}`,
      { headers: serviceHeaders }
    );
    const [bolRow] = await bolRes.json();
    if (!bolRow) {
      return res.status(404).json({ error: "BOL not found" });
    }
    if (bolRow.missions?.organization_id !== organizationId) {
      return res.status(403).json({ error: "This BOL does not belong to your organization" });
    }
    if (bolRow.status !== "signed_pickup") {
      return res.status(409).json({ error: `BOL is "${bolRow.status}", not ready for delivery completion` });
    }

    // 4. Record the (simulated) receiver verification.
    const verificationRes = await fetch(`${SUPABASE_URL}/rest/v1/receiver_verifications`, {
      method: "POST",
      headers: serviceHeaders,
      body: JSON.stringify({
        mission_id: bolRow.mission_id,
        receiver_name: receiverName,
        receiver_phone: receiverPhone || null,
        verification_type: vType,
        provider: "simulated",
        provider_reference_id: null,
        result: "passed",
        consent_given: true,
        verified_at: new Date().toISOString(),
      }),
    });
    if (!verificationRes.ok) {
      const err = await verificationRes.json().catch(() => ({}));
      return res.status(500).json({ error: `Failed to record receiver verification: ${err.message || verificationRes.status}` });
    }
    const [verification] = await verificationRes.json();

    // 5. The receiver's signature — only its hash.
    const signatureRes = await fetch(`${SUPABASE_URL}/rest/v1/bol_signatures`, {
      method: "POST",
      headers: serviceHeaders,
      body: JSON.stringify({
        bol_id: bolRow.id,
        signer_type: "receiver",
        receiver_verification_id: verification.id,
        signature_hash: signatureHash,
        ip_address: (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || null,
      }),
    });
    if (!signatureRes.ok) {
      const err = await signatureRes.json().catch(() => ({}));
      return res.status(500).json({ error: `Failed to record signature: ${err.message || signatureRes.status}` });
    }

    // 6. Advance the BOL to delivered.
    const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/digital_bols?id=eq.${bolRow.id}`, {
      method: "PATCH",
      headers: serviceHeaders,
      body: JSON.stringify({ status: "signed_delivery", updated_at: new Date().toISOString() }),
    });
    if (!updateRes.ok) {
      const err = await updateRes.json().catch(() => ({}));
      return res.status(500).json({ error: `Failed to update BOL status: ${err.message || updateRes.status}` });
    }

    // 7. Chain-of-custody entry for the delivery event. Not fatal if this
    //    fails — the delivery itself is already fully recorded.
    const coCRes = await fetch(`${SUPABASE_URL}/rest/v1/chain_of_custody_events`, {
      method: "POST",
      headers: serviceHeaders,
      body: JSON.stringify({
        mission_id: bolRow.mission_id,
        event_type: "delivery",
        actor_type: "receiver",
        description: `BOL ${bolRow.bol_number} signed at delivery by ${receiverName}`,
        occurred_at: new Date().toISOString(),
      }),
    });
    if (!coCRes.ok) {
      const err = await coCRes.json().catch(() => ({}));
      console.error("Failed to log delivery chain-of-custody event:", err.message || coCRes.status);
    }

    return res.status(200).json({ bolId: bolRow.id, status: "signed_delivery", verificationId: verification.id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
