// Server-only: generates short-lived signed URLs for a driver verification's
// two captured photos (selfie + ID). The bucket is private — this is the
// only way to view them. Mirrors api/get-evidence-url.js, scoped to the
// driver-verification bucket and org-checked via driver -> carrier ->
// organization instead of a mission chain.
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

  const { verificationId } = req.body || {};
  if (!verificationId) {
    return res.status(400).json({ error: "Missing verificationId" });
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
    };

    // 2. Confirm the caller is staff (any role) in the org this
    //    verification's driver belongs to.
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

    // 3. Sign both paths.
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
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
