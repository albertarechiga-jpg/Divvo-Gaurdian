const RESEND_KEY = process.env.RESEND_API_KEY;

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

const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Same-origin only: the dashboard calls this from its own domain, so no CORS
// headers are sent (they used to allow any website to call it).
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { companyId, subject: rawSubject, alertType: rawAlertType, deviceId: rawDeviceId, location: rawLocation, severity: rawSeverity, details: rawDetails } = req.body || {};
  if (typeof rawSubject !== "string" || !rawSubject.trim()) return res.status(400).json({ error: "Missing subject" });

  let auth;
  try { auth = await authorizeAlertSend(req, companyId); }
  catch (err) { return res.status(500).json({ error: err.message }); }
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const emails = (Array.isArray(auth.settings.emails) ? auth.settings.emails : [])
    .map((e) => String(e).trim())
    .filter((e) => EMAIL_RE.test(e));
  if (!emails.length) return res.status(400).json({ error: "No email recipients configured for this company" });

  // Everything interpolated into the HTML below is escaped: these fields are
  // caller-supplied and used to be dropped into the markup raw.
  const subject = rawSubject.slice(0, 200);
  const severity = ["Critical", "Warning"].includes(rawSeverity) ? rawSeverity : "Info";
  const alertType = esc(String(rawAlertType ?? "").slice(0, 200));
  const deviceId = esc(String(rawDeviceId ?? "").slice(0, 100));
  const location = esc(String(rawLocation ?? "").slice(0, 300));
  const details = Array.isArray(rawDetails)
    ? rawDetails.slice(0, 20).filter((d) => Array.isArray(d)).map(([k, v]) => [esc(String(k ?? "").slice(0, 100)), esc(String(v ?? "").slice(0, 300))])
    : null;

  const severityColor = severity === "Critical" ? "#ef4444" : severity === "Warning" ? "#f59e0b" : "#3b82f6";
  const severityBg    = severity === "Critical" ? "#450a0a" : severity === "Warning" ? "#1a1200" : "#1e3a8a";

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#070d17;font-family:ui-sans-serif,system-ui,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px;">

    <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px;">
      <div style="width:36px;height:36px;background:#2563eb;border-radius:10px;display:flex;align-items:center;justify-content:center;">
        <span style="color:white;font-size:18px;">🛡️</span>
      </div>
      <div>
        <div style="color:#f9fafb;font-size:16px;font-weight:800;">Freightlock Guardian</div>
        <div style="color:#6b7280;font-size:11px;">Cargo Security Platform</div>
      </div>
    </div>

    <div style="background:${severityBg};border:1px solid ${severityColor};border-radius:12px;padding:20px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <div style="width:8px;height:8px;border-radius:50%;background:${severityColor};"></div>
        <span style="color:${severityColor};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">${severity} Alert</span>
      </div>
      <div style="color:#f9fafb;font-size:18px;font-weight:800;margin-bottom:4px;">${alertType}</div>
      <div style="color:#9ca3af;font-size:13px;">Device: ${deviceId} · ${location}</div>
    </div>

    <div style="background:#0a0f1a;border:1px solid #1f2937;border-radius:12px;padding:16px;margin-bottom:16px;">
      <div style="color:#6b7280;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:12px;">Alert Details</div>
      ${details ? details.map(([k, v]) => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #111827;">
          <span style="color:#6b7280;font-size:12px;">${k}</span>
          <span style="color:#d1d5db;font-size:12px;font-weight:600;">${v}</span>
        </div>
      `).join("") : ""}
    </div>

    <a href="https://divvo-guardian.vercel.app" style="display:block;background:#2563eb;color:white;text-align:center;padding:14px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;margin-bottom:16px;">
      Open Freightlock Guardian Dashboard →
    </a>

    <div style="color:#4b5563;font-size:11px;text-align:center;">
      Freightlock Guardian · Cargo Security Platform · divvo-guardian.vercel.app<br/>
      You are receiving this because you are a registered alert contact for this account.
    </div>
  </div>
</body>
</html>`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Freightlock Guardian <onboarding@resend.dev>",
        to: emails,
        subject,
        html,
      }),
    });
    const data = await response.json();
    return res.status(200).json({ id: data.id, error: data.message });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
