// Server-only: uses the Supabase service_role key, which bypasses Row Level
// Security entirely. This must never be exposed to the client — the browser
// only ever talks to this endpoint, never to Supabase directly for writes here.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Server not configured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
  }

  const { name, region, mapCenter, mapZoom, primaryEmail, primaryPhone } = req.body;
  if (!name || !Array.isArray(mapCenter) || mapCenter.length !== 2) {
    return res.status(400).json({ error: "Missing name or mapCenter [lng, lat]" });
  }

  const id = slugify(name);
  if (!id) return res.status(400).json({ error: "Could not derive a valid id from name" });

  const headers = {
    "Content-Type": "application/json",
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    Prefer: "return=representation",
  };

  try {
    // Reject duplicates up front for a clean error instead of a 409 from Postgres
    const existing = await fetch(`${SUPABASE_URL}/rest/v1/companies?select=id&id=eq.${id}`, { headers });
    const existingRows = await existing.json();
    if (existingRows?.length) {
      return res.status(409).json({ error: `A company with id "${id}" already exists` });
    }

    const companyRes = await fetch(`${SUPABASE_URL}/rest/v1/companies`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        id,
        name,
        program: "Pilot Program",
        region: region || null,
        map_center_lng: mapCenter[0],
        map_center_lat: mapCenter[1],
        map_zoom: mapZoom || 5.8,
      }),
    });
    if (!companyRes.ok) {
      const err = await companyRes.json().catch(() => ({}));
      return res.status(companyRes.status).json({ error: err.message || "Failed to create company" });
    }
    const [company] = await companyRes.json();

    const settingsRes = await fetch(`${SUPABASE_URL}/rest/v1/alert_settings`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        company_id: id,
        client_name: name,
        emails: primaryEmail ? [primaryEmail] : [],
        phones: primaryPhone ? [primaryPhone] : [],
        sms_critical: true,
        sms_warning: false,
        email_critical: true,
        email_warning: true,
        browser_all: true,
      }),
    });
    if (!settingsRes.ok) {
      const err = await settingsRes.json().catch(() => ({}));
      // Company row already exists at this point; surface the settings failure
      // but don't roll back — an operator can add settings manually if needed.
      return res.status(207).json({ company, warning: `Company created, but alert settings failed: ${err.message || "unknown error"}` });
    }

    return res.status(201).json({ company });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
