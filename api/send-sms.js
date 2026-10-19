const TWILIO_SID   = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const SMS_FROM     = process.env.TWILIO_SMS_FROM;

// ── Caller authorization (identical block in api/send-sms.js and api/send-email.js) ──
// These endpoints used to be open to anyone on the internet: no login check and
// caller-supplied recipients, so they could be used to send SMS/email to any
// address through our Twilio/Resend accounts. Now: the caller must hold a live
// Supabase session, belong to the company they are alerting for (or be
// platform-org staff), and recipients come from that company's alert_settings
// row on the server — never from the request body.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

// Best-effort per-user throttle. Serverless instances don't share memory, so
// this only blunts a runaway client loop; it is not a hard quota.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 60;
const recentCalls = new Map();
function rateLimited(userId) {
  const now = Date.now();
  const hits = (recentCalls.get(userId) || []).filter((t) => now - t < RATE_WINDOW_MS);
  hits.push(now);
  recentCalls.set(userId, hits);
  return hits.length > RATE_MAX;
}

// Resolves to { ok: true, settings } or { ok: false, status, error }.
async function authorizeAlertSend(req, companyId) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
    return { ok: false, status: 500, error: "Server not configured: missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or VITE_SUPABASE_ANON_KEY" };
  }
  const callerToken = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!callerToken) return { ok: false, status: 401, error: "Missing Authorization bearer token" };
  if (typeof companyId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(companyId)) {
    return { ok: false, status: 400, error: "Missing or invalid companyId" };
  }

  const serviceHeaders = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };
  const get = async (path) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: serviceHeaders });
    return r.ok ? r.json() : null;
  };

  // 1. The token must be a real, live Supabase session.
  const callerRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${callerToken}` },
  });
  if (!callerRes.ok) return { ok: false, status: 401, error: "Invalid or expired session" };
  const caller = await callerRes.json();
  if (rateLimited(caller.id)) return { ok: false, status: 429, error: "Too many alert requests — slow down" };

  // 2. They must be an active dashboard user, and the company must be theirs
  //    (or they are Freightlock platform staff). Service-role reads bypass RLS
  //    on purpose: this IS the authorization check.
  const userRows = await get(`users?select=status,organization_id,organizations(is_platform_org)&id=eq.${encodeURIComponent(caller.id)}&limit=1`);
  const user = userRows?.[0];
  if (!user || user.status === "suspended") return { ok: false, status: 403, error: "Not an active dashboard user" };

  const companyRows = await get(`companies?select=id,organization_id&id=eq.${encodeURIComponent(companyId)}&limit=1`);
  const company = companyRows?.[0];
  if (!company) return { ok: false, status: 404, error: "Unknown company" };
  if (!user.organizations?.is_platform_org && company.organization_id !== user.organization_id) {
    return { ok: false, status: 403, error: "Not allowed to send alerts for this company" };
  }

  // 3. Recipients come from the company's saved settings only.
  const settingsRows = await get(`alert_settings?select=phones,emails&company_id=eq.${encodeURIComponent(companyId)}&limit=1`);
  const settings = settingsRows?.[0];
  if (!settings) return { ok: false, status: 404, error: "No alert settings configured for this company" };
  return { ok: true, settings };
}

const PHONE_RE = /^\+?[0-9]{7,15}$/;
const MAX_SMS_CHARS = 600;

// Same-origin only: the dashboard calls this from its own domain, so no CORS
// headers are sent (they used to allow any website to call it).
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { companyId, message } = req.body || {};
  if (typeof message !== "string" || !message.trim()) return res.status(400).json({ error: "Missing message" });
  if (message.length > MAX_SMS_CHARS) return res.status(400).json({ error: `message must be at most ${MAX_SMS_CHARS} characters` });

  let auth;
  try { auth = await authorizeAlertSend(req, companyId); }
  catch (err) { return res.status(500).json({ error: err.message }); }
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const phones = (Array.isArray(auth.settings.phones) ? auth.settings.phones : [])
    .map((p) => String(p).trim().replace(/[\s()-]/g, ""))
    .filter((p) => PHONE_RE.test(p));
  if (!phones.length) return res.status(400).json({ error: "No SMS recipients configured for this company" });
  const results = [];

  for (const phone of phones) {
    try {
      const credentials = `${TWILIO_SID}:${TWILIO_TOKEN}`;
      const encoded = Buffer.from(credentials).toString("base64");

      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
        {
          method: "POST",
          headers: {
            "Authorization": `Basic ${encoded}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To:   phone,
            From: SMS_FROM,
            Body: message,
          }),
        }
      );

      const text = await response.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }

      results.push({
        phone,
        httpStatus: response.status,
        sid: data.sid,
        status: data.status,
        twilioError: data.message,
        twilioCode: data.code,
      });
    } catch (err) {
      results.push({ phone, error: err.message });
    }
  }

  return res.status(200).json({ results });
}
