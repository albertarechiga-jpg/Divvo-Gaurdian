// Server-only: creates a new team member (Supabase Auth user + users + user_roles
// rows), but ONLY if the caller is a verified, currently-authenticated admin.
// Unlike api/add-company.js, this endpoint is privileged enough that it must
// check who is actually calling it — never trust a client-asserted "I'm an
// admin". The caller's access token is validated against Supabase Auth itself
// before anything else happens.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const VALID_ROLES = ["admin", "dispatcher", "analyst", "viewer"];

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

  const { email, fullName, role } = req.body || {};
  if (!email || !fullName || !role) {
    return res.status(400).json({ error: "Missing email, fullName, or role" });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(", ")}` });
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

    // 2. Confirm the caller actually holds the admin role (service-role read,
    //    bypasses RLS deliberately — this IS the authorization check).
    const callerRolesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_roles?select=role,organization_id&user_id=eq.${caller.id}`,
      { headers: serviceHeaders }
    );
    const callerRoles = await callerRolesRes.json();
    const adminRow = Array.isArray(callerRoles) ? callerRoles.find((r) => r.role === "admin") : null;
    if (!adminRow) {
      return res.status(403).json({ error: "Only admins can create team members" });
    }
    const organizationId = adminRow.organization_id;

    // 3. Invite the new user via Supabase's Admin API — creates the auth user
    //    and emails them a link to set their own password. No temp passwords
    //    are generated or handled by this app.
    const inviteRes = await fetch(`${SUPABASE_URL}/auth/v1/invite`, {
      method: "POST",
      headers: serviceHeaders,
      body: JSON.stringify({ email }),
    });
    const inviteData = await inviteRes.json();
    if (!inviteRes.ok) {
      return res.status(inviteRes.status).json({ error: inviteData.msg || inviteData.error_description || "Failed to invite user" });
    }
    const newUserId = inviteData.id;

    // 4. Create the matching app-level users + user_roles rows.
    const usersRes = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
      method: "POST",
      headers: serviceHeaders,
      body: JSON.stringify({
        id: newUserId,
        organization_id: organizationId,
        email,
        full_name: fullName,
        status: "invited",
      }),
    });
    if (!usersRes.ok) {
      const err = await usersRes.json().catch(() => ({}));
      return res.status(207).json({ warning: `Auth invite sent, but users row failed: ${err.message || "unknown error"}` });
    }

    const roleRes = await fetch(`${SUPABASE_URL}/rest/v1/user_roles`, {
      method: "POST",
      headers: serviceHeaders,
      body: JSON.stringify({
        user_id: newUserId,
        organization_id: organizationId,
        role,
        granted_by: caller.id,
      }),
    });
    if (!roleRes.ok) {
      const err = await roleRes.json().catch(() => ({}));
      return res.status(207).json({ warning: `User created, but role assignment failed: ${err.message || "unknown error"}` });
    }

    return res.status(201).json({ user: { id: newUserId, email, fullName, role } });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
