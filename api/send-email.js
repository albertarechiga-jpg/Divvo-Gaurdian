const RESEND_KEY = "REDACTED_RESEND_API_KEY";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { to, subject, alertType, deviceId, location, severity, details } = req.body;
  if (!to || !subject) return res.status(400).json({ error: "Missing to or subject" });

  const emails = Array.isArray(to) ? to : [to];

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
        <div style="color:#f9fafb;font-size:16px;font-weight:800;">Divvo Guardian</div>
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
      Open Divvo Guardian Dashboard →
    </a>

    <div style="color:#4b5563;font-size:11px;text-align:center;">
      Divvo Guardian · Cargo Security Platform · divvo-guardian.vercel.app<br/>
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
        from: "Divvo Guardian <onboarding@resend.dev>",
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
