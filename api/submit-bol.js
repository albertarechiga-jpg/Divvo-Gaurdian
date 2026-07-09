// Server-only: creates a Digital BOL (v2 Mission Engine schema) for a
// shipment, bridging on-demand into the real shipments/carriers/drivers/
// missions tables (which the rest of the app has never written to — see
// CLAUDE.md). Mirrors api/create-user.js's pattern: validate the caller is a
// real, currently-authenticated dispatcher-or-above, then use the
// service-role key to perform the actual privileged writes.
//
// This is a *dispatcher-facilitated* flow, not a driver-portal one: the
// RLS policies on driver_verifications (no client-facing insert policy at
// all — service_role only, by design) and bol_signatures (insertable only
// by the driver's own auth session) assume a real driver login this pilot
// doesn't have. A staff member runs the whole verification+signature
// capture from inside the dashboard, and this endpoint is the one place
// that's allowed to write the result of that on the driver's behalf.
//
// The identity "verification" itself is simulated — no real biometric
// provider is configured. It is always recorded as provider: "simulated",
// never as if it came from a real vendor. The driver's signature image
// itself is NEVER sent here or stored anywhere — only its SHA-256 hash
// (computed client-side, see src/lib/bol.js), matching the schema's own
// comment that a retained signature artifact belongs in evidence_files
// with its own storage/retention policy, which this feature doesn't use.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

import crypto from "node:crypto";

function centsFromDollars(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

async function findOne(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
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

  const { shipmentId, shipment, bol, driver, signatureHash, consentGiven } = req.body || {};
  if (!shipmentId || !shipment || !bol || !driver || !signatureHash) {
    return res.status(400).json({ error: "Missing shipmentId, shipment, bol, driver, or signatureHash" });
  }
  if (!consentGiven) {
    return res.status(400).json({ error: "Driver consent is required before verification can be recorded" });
  }
  if (!driver.fullName || !driver.licenseNumber || !driver.licenseState) {
    return res.status(400).json({ error: "Driver full name, license number, and license state are required" });
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
      `${SUPABASE_URL}/rest/v1/user_roles?select=role,organization_id&user_id=eq.${caller.id}`,
      { headers: serviceHeaders }
    );
    const callerRoles = await callerRolesRes.json();
    const staffRow = Array.isArray(callerRoles) ? callerRoles.find((r) => r.role === "admin" || r.role === "dispatcher") : null;
    if (!staffRow) {
      return res.status(403).json({ error: "Only dispatchers or admins can create a Digital BOL" });
    }
    const organizationId = staffRow.organization_id;

    // 3. Find-or-create the v2 shipment (upsert on legacy_shipment_id so
    //    repeat BOLs for the same mock shipment don't duplicate the master
    //    record — a fresh mission/BOL is still created per submission,
    //    which is correct: each BOL represents one real pickup-to-delivery
    //    execution, and the same lane can legitimately run many times).
    const shipmentUpsertRes = await fetch(
      `${SUPABASE_URL}/rest/v1/shipments?on_conflict=legacy_shipment_id`,
      {
        method: "POST",
        headers: { ...serviceHeaders, Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({
          organization_id: organizationId,
          legacy_shipment_id: shipmentId,
          container_number: shipment.containerNumber ?? null,
          cargo_type: shipment.cargoType ?? null,
          cargo_value_cents: centsFromDollars(shipment.cargoValue),
          origin_address: shipment.originPort ?? null,
          destination_address: shipment.destination ?? null,
          status: "booked",
        }),
      }
    );
    if (!shipmentUpsertRes.ok) {
      const err = await shipmentUpsertRes.json().catch(() => ({}));
      return res.status(500).json({ error: `Failed to create shipment record: ${err.message || shipmentUpsertRes.status}` });
    }
    const [v2Shipment] = await shipmentUpsertRes.json();

    // 4. Find-or-create the carrier by name within this org.
    let carrier = await findOne(
      `${SUPABASE_URL}/rest/v1/carriers?select=id&organization_id=eq.${organizationId}&name=eq.${encodeURIComponent(shipment.carrier || "Unknown Carrier")}`,
      serviceHeaders
    );
    if (!carrier) {
      const carrierRes = await fetch(`${SUPABASE_URL}/rest/v1/carriers`, {
        method: "POST",
        headers: serviceHeaders,
        body: JSON.stringify({ organization_id: organizationId, name: shipment.carrier || "Unknown Carrier" }),
      });
      if (!carrierRes.ok) {
        const err = await carrierRes.json().catch(() => ({}));
        return res.status(500).json({ error: `Failed to create carrier record: ${err.message || carrierRes.status}` });
      }
      [carrier] = await carrierRes.json();
    }

    // 5. Find-or-create the driver by hashed license number within this
    //    carrier. The raw license number is hashed here, server-side, and
    //    never persisted anywhere in its raw form.
    const licenseHash = crypto.createHash("sha256").update(String(driver.licenseNumber).trim().toUpperCase()).digest("hex");
    let driverRow = await findOne(
      `${SUPABASE_URL}/rest/v1/drivers?select=id&carrier_id=eq.${carrier.id}&license_number_hash=eq.${licenseHash}`,
      serviceHeaders
    );
    if (!driverRow) {
      const driverRes = await fetch(`${SUPABASE_URL}/rest/v1/drivers`, {
        method: "POST",
        headers: serviceHeaders,
        body: JSON.stringify({
          carrier_id: carrier.id,
          full_name: driver.fullName,
          phone: driver.phone || null,
          email: driver.email || null,
          license_number_hash: licenseHash,
          license_state: driver.licenseState,
          status: "active",
        }),
      });
      if (!driverRes.ok) {
        const err = await driverRes.json().catch(() => ({}));
        return res.status(500).json({ error: `Failed to create driver record: ${err.message || driverRes.status}` });
      }
      [driverRow] = await driverRes.json();
    }

    // 6. New mission for this specific pickup-to-delivery execution.
    const missionRes = await fetch(`${SUPABASE_URL}/rest/v1/missions`, {
      method: "POST",
      headers: serviceHeaders,
      body: JSON.stringify({
        organization_id: organizationId,
        shipment_id: v2Shipment.id,
        carrier_id: carrier.id,
        driver_id: driverRow.id,
        status: "scheduled",
      }),
    });
    if (!missionRes.ok) {
      const err = await missionRes.json().catch(() => ({}));
      return res.status(500).json({ error: `Failed to create mission record: ${err.message || missionRes.status}` });
    }
    const [mission] = await missionRes.json();

    // 6b. Find-or-create the Guardian hardware unit for this mission's
    //     trailer, using a serial synthesized from the mock shipment id —
    //     one Guardian per monitored trailer, matching the real product
    //     model. Reused across repeat missions for the same shipment.
    const deviceSerial = `GRD-${shipmentId}`;
    let guardian = await findOne(
      `${SUPABASE_URL}/rest/v1/guardians?select=id&device_serial=eq.${encodeURIComponent(deviceSerial)}`,
      serviceHeaders
    );
    if (!guardian) {
      const guardianRes = await fetch(`${SUPABASE_URL}/rest/v1/guardians`, {
        method: "POST",
        headers: serviceHeaders,
        body: JSON.stringify({
          organization_id: organizationId,
          device_serial: deviceSerial,
          status: "active",
          last_heartbeat_at: new Date().toISOString(),
        }),
      });
      if (!guardianRes.ok) {
        const err = await guardianRes.json().catch(() => ({}));
        return res.status(500).json({ error: `Failed to create guardian record: ${err.message || guardianRes.status}` });
      }
      [guardian] = await guardianRes.json();
    }
    const missionGuardianRes = await fetch(`${SUPABASE_URL}/rest/v1/missions?id=eq.${mission.id}`, {
      method: "PATCH",
      headers: serviceHeaders,
      body: JSON.stringify({ guardian_id: guardian.id, updated_at: new Date().toISOString() }),
    });
    if (!missionGuardianRes.ok) {
      const err = await missionGuardianRes.json().catch(() => ({}));
      return res.status(500).json({ error: `Failed to assign guardian to mission: ${err.message || missionGuardianRes.status}` });
    }

    // 7. Record the (simulated) identity verification result. Never claims
    //    to be a real vendor — provider is always "simulated" here.
    const verificationRes = await fetch(`${SUPABASE_URL}/rest/v1/driver_verifications`, {
      method: "POST",
      headers: serviceHeaders,
      body: JSON.stringify({
        driver_id: driverRow.id,
        verification_type: "biometric_face",
        provider: "simulated",
        provider_reference_id: null,
        result: "passed",
        confidence_score: 0.97,
        consent_given: true,
        consent_recorded_at: new Date().toISOString(),
        verified_at: new Date().toISOString(),
      }),
    });
    if (!verificationRes.ok) {
      const err = await verificationRes.json().catch(() => ({}));
      return res.status(500).json({ error: `Failed to record verification: ${err.message || verificationRes.status}` });
    }
    const [verification] = await verificationRes.json();

    // 8. The Digital BOL itself.
    const bolNumber = `BOL-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const bolRes = await fetch(`${SUPABASE_URL}/rest/v1/digital_bols`, {
      method: "POST",
      headers: serviceHeaders,
      body: JSON.stringify({
        mission_id: mission.id,
        shipment_id: v2Shipment.id,
        bol_number: bolNumber,
        issued_at: new Date().toISOString(),
        pickup_location: bol.pickupLocation || null,
        delivery_location: bol.deliveryLocation || null,
        cargo_description: bol.cargoDescription || null,
        declared_value_cents: centsFromDollars(bol.declaredValue),
        status: "signed_pickup",
      }),
    });
    if (!bolRes.ok) {
      const err = await bolRes.json().catch(() => ({}));
      return res.status(500).json({ error: `Failed to create BOL: ${err.message || bolRes.status}` });
    }
    const [createdBol] = await bolRes.json();

    // 9. The signature — only its hash, never the image itself.
    const signatureRes = await fetch(`${SUPABASE_URL}/rest/v1/bol_signatures`, {
      method: "POST",
      headers: serviceHeaders,
      body: JSON.stringify({
        bol_id: createdBol.id,
        signer_type: "driver",
        driver_verification_id: verification.id,
        signature_hash: signatureHash,
        ip_address: (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || null,
      }),
    });
    if (!signatureRes.ok) {
      const err = await signatureRes.json().catch(() => ({}));
      return res.status(500).json({ error: `Failed to record signature: ${err.message || signatureRes.status}` });
    }

    // 10. Chain-of-custody entry for the pickup event. Not fatal if this
    //     fails — the BOL itself is already fully recorded — so this is
    //     logged but doesn't block the response.
    const coCRes = await fetch(`${SUPABASE_URL}/rest/v1/chain_of_custody_events`, {
      method: "POST",
      headers: serviceHeaders,
      body: JSON.stringify({
        mission_id: mission.id,
        event_type: "pickup",
        actor_type: "driver",
        actor_driver_id: driverRow.id,
        description: `BOL ${bolNumber} signed at pickup by ${driver.fullName}`,
        occurred_at: new Date().toISOString(),
      }),
    });
    if (!coCRes.ok) {
      const err = await coCRes.json().catch(() => ({}));
      console.error("Failed to log pickup chain-of-custody event:", err.message || coCRes.status);
    }

    return res.status(201).json({
      bolNumber,
      bolId: createdBol.id,
      missionId: mission.id,
      driverId: driverRow.id,
      verificationId: verification.id,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
