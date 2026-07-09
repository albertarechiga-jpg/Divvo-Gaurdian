// Server-only: generates a short-lived signed URL to view a piece of
// mission evidence. The storage bucket is private, so this is the only way
// to actually view a file — no public path, no storage-level RLS policy
// (keeping the security boundary at endpoints that can be tested directly,
// same reasoning as every other privileged write this session).
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const BUCKET = "mission-evidence";
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

  const { evidenceFileId } = req.body || {};
  if (!evidenceFileId) {
    return res.status(400).json({ error: "Missing evidenceFileId" });
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

    // 2. Confirm the caller is staff (any role) in the org this evidence
    //    file's mission belongs to.
    const callerRolesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_roles?select=organization_id&user_id=eq.${caller.id}`,
      { headers: serviceHeaders }
    );
    const callerRoles = await callerRolesRes.json();
    const callerOrgIds = new Set((Array.isArray(callerRoles) ? callerRoles : []).map((r) => r.organization_id));
    if (callerOrgIds.size === 0) {
      return res.status(403).json({ error: "No role assigned" });
    }

    const evidenceRes = await fetch(
      `${SUPABASE_URL}/rest/v1/evidence_files?select=id,storage_url,missions(organization_id)&id=eq.${evidenceFileId}`,
      { headers: serviceHeaders }
    );
    const [evidenceRow] = await evidenceRes.json();
    if (!evidenceRow) return res.status(404).json({ error: "Evidence file not found" });
    if (!callerOrgIds.has(evidenceRow.missions?.organization_id)) {
      return res.status(403).json({ error: "This evidence file does not belong to your organization" });
    }

    // 3. Sign it.
    const signRes = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${evidenceRow.storage_url}`, {
      method: "POST",
      headers: serviceHeaders,
      body: JSON.stringify({ expiresIn: EXPIRES_IN_SECONDS }),
    });
    if (!signRes.ok) {
      const err = await signRes.json().catch(() => ({}));
      return res.status(500).json({ error: `Failed to sign evidence URL: ${err.message || signRes.status}` });
    }
    const { signedURL } = await signRes.json();

    return res.status(200).json({ url: `${SUPABASE_URL}/storage/v1${signedURL}` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
