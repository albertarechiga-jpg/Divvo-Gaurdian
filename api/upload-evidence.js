// Server-only: captures a photo as mission evidence — uploads it to a
// private Supabase Storage bucket, then records both a camera_events row
// (device/service-role insert only, by schema design — no client-facing
// insert policy exists for it) and an evidence_files row (integrity hash +
// storage reference). Validates the caller like every other endpoint this
// session: dispatcher-or-above, real live session.
//
// Unlike the BOL biometric verification flow (which deliberately never
// transmits or stores the actual selfie/signature image, only hashes),
// camera evidence is meant to be retained — this IS the theft/tamper
// evidence a real investigation needs. The bucket is private; viewing goes
// through api/get-evidence-url.js's short-lived signed URLs, not a public
// path.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const BUCKET = "mission-evidence";

import crypto from "node:crypto";

async function ensureBucketExists(serviceHeaders) {
  const checkRes = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${BUCKET}`, { headers: serviceHeaders });
  if (checkRes.ok) return;
  await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...serviceHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
  });
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

  const { missionId, imageDataUrl } = req.body || {};
  if (!missionId || !imageDataUrl) {
    return res.status(400).json({ error: "Missing missionId or imageDataUrl" });
  }
  const match = /^data:(image\/\w+);base64,(.+)$/.exec(imageDataUrl);
  if (!match) {
    return res.status(400).json({ error: "imageDataUrl must be a base64 image data URL" });
  }
  const [, mimeType, base64Data] = match;
  const buffer = Buffer.from(base64Data, "base64");
  if (buffer.length > 4_000_000) {
    return res.status(413).json({ error: "Image too large (max ~4MB)" });
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

    const serviceAuthHeaders = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };
    const serviceHeaders = { ...serviceAuthHeaders, "Content-Type": "application/json", Prefer: "return=representation" };

    // 2. Confirm the caller holds dispatcher-or-above (service-role read,
    //    bypasses RLS deliberately — this IS the authorization check).
    const callerRolesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_roles?select=role,organization_id&user_id=eq.${caller.id}`,
      { headers: serviceHeaders }
    );
    const callerRoles = await callerRolesRes.json();
    const staffRow = Array.isArray(callerRoles) ? callerRoles.find((r) => r.role === "admin" || r.role === "dispatcher") : null;
    if (!staffRow) {
      return res.status(403).json({ error: "Only dispatchers or admins can capture evidence" });
    }

    // 3. Confirm the mission belongs to the caller's org.
    const missionRes = await fetch(
      `${SUPABASE_URL}/rest/v1/missions?select=id,organization_id,guardian_id&id=eq.${missionId}`,
      { headers: serviceHeaders }
    );
    const [missionRow] = await missionRes.json();
    if (!missionRow) return res.status(404).json({ error: "Mission not found" });
    if (missionRow.organization_id !== staffRow.organization_id) {
      return res.status(403).json({ error: "This mission does not belong to your organization" });
    }

    // 4. Upload the file.
    await ensureBucketExists(serviceAuthHeaders);
    const ext = mimeType.split("/")[1] || "jpg";
    const path = `${missionId}/${crypto.randomUUID()}.${ext}`;
    const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: "POST",
      headers: { ...serviceAuthHeaders, "Content-Type": mimeType },
      body: buffer,
    });
    if (!uploadRes.ok) {
      const err = await uploadRes.json().catch(() => ({}));
      return res.status(500).json({ error: `Failed to upload evidence file: ${err.message || uploadRes.status}` });
    }

    const sha256Hash = crypto.createHash("sha256").update(buffer).digest("hex");

    // 5. camera_events — the device/hardware-style event record.
    //    guardian_id is NOT NULL in the schema, so this is only attempted
    //    when the mission actually has a Guardian assigned (every mission
    //    created via api/submit-bol.js does, but older/edge-case ones might
    //    not) — falls back to just the evidence_files row below otherwise,
    //    rather than failing the whole capture over a missing hardware link.
    let cameraEvent = null;
    if (missionRow.guardian_id) {
      const cameraEventRes = await fetch(`${SUPABASE_URL}/rest/v1/camera_events`, {
        method: "POST",
        headers: serviceHeaders,
        body: JSON.stringify({
          mission_id: missionId,
          guardian_id: missionRow.guardian_id,
          event_type: "snapshot",
          media_url: path,
          triggered_by: "manual",
          occurred_at: new Date().toISOString(),
        }),
      });
      if (cameraEventRes.ok) {
        [cameraEvent] = await cameraEventRes.json();
      }
    }

    // 6. evidence_files — the durable, chain-of-custody evidence record.
    const evidenceRes = await fetch(`${SUPABASE_URL}/rest/v1/evidence_files`, {
      method: "POST",
      headers: serviceHeaders,
      body: JSON.stringify({
        mission_id: missionId,
        camera_event_id: cameraEvent?.id || null,
        file_type: "image",
        storage_url: path,
        sha256_hash: sha256Hash,
        uploaded_by: caller.id,
      }),
    });
    if (!evidenceRes.ok) {
      const err = await evidenceRes.json().catch(() => ({}));
      return res.status(500).json({ error: `Failed to record evidence file: ${err.message || evidenceRes.status}` });
    }
    const [evidenceFile] = await evidenceRes.json();

    return res.status(201).json({ evidenceFileId: evidenceFile.id, storageUrl: path });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
