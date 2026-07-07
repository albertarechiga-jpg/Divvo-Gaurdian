import { SB_URL, sbHeaders } from "./supabase.js";

// ── Fetch alert settings from Supabase ────────────────────────────────────────
export async function fetchAlertSettings(companyId = "owlet") {
  try {
    const res = await fetch(
      SB_URL + `/rest/v1/alert_settings?select=*&company_id=eq.${companyId}&limit=1`,
      { headers: sbHeaders() }
    );
    const rows = await res.json();
    return rows?.[0] ?? null;
  } catch { return null; }
}

// ── Browser push notification ─────────────────────────────────────────────────
export async function sendBrowserNotification(title, body, severity) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }
  if (Notification.permission === "granted") {
    const icon = severity === "Critical" ? "🚨" : severity === "Warning" ? "⚠️" : "📡";
    new Notification(`${icon} Divvo Guardian — ${title}`, {
      body,
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      tag: "divvo-alert",
      requireInteraction: severity === "Critical",
    });
  }
}

// ── Send SMS via Vercel function ──────────────────────────────────────────────
export async function sendSMS(phones, message) {
  try {
    await fetch("/api/send-sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: phones, message }),
    });
  } catch (e) { console.error("SMS failed:", e); }
}

// ── Send email via Vercel function ────────────────────────────────────────────
export async function sendEmail({ to, subject, alertType, deviceId, location, severity, details }) {
  try {
    await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, alertType, deviceId, location, severity, details }),
    });
  } catch (e) { console.error("Email failed:", e); }
}

// ── Main alert dispatcher ─────────────────────────────────────────────────────
export async function dispatchAlert({ alertType, deviceId, location, severity, details = [], companyId = "owlet" }) {
  const settings = await fetchAlertSettings(companyId);
  if (!settings) return;

  const isCritical = severity === "Critical";
  const isWarning  = severity === "Warning";

  const subject = `[${severity}] Divvo Guardian — ${alertType} · ${deviceId}`;
  const smsBody = `🚨 DIVVO GUARDIAN ${severity.toUpperCase()} ALERT\n${alertType}\nDevice: ${deviceId}\nLocation: ${location}\nView: divvo-guardian.vercel.app`;

  // Browser notification — always if enabled. Wrapped so a permission-prompt
  // failure (e.g. Chrome refusing requestPermission() outside a synchronous
  // user gesture, which this no longer is by the time fetchAlertSettings
  // resolves) can't throw and abort the SMS/email sends below it.
  if (settings.browser_all) {
    try {
      await sendBrowserNotification(alertType, `${deviceId} · ${location}`, severity);
    } catch (e) { console.error("Browser notification failed:", e); }
  }

  // SMS — Critical always, Warning only if enabled
  const shouldSMS = (isCritical && settings.sms_critical) || (isWarning && settings.sms_warning);
  if (shouldSMS && settings.phones?.length) {
    await sendSMS(settings.phones, smsBody);
  }

  // Email — Critical and Warning based on settings
  const shouldEmail = (isCritical && settings.email_critical) || (isWarning && settings.email_warning);
  if (shouldEmail && settings.emails?.length) {
    await sendEmail({
      to: settings.emails,
      subject,
      alertType,
      deviceId,
      location,
      severity,
      details: [
        ["Alert Type",  alertType],
        ["Device ID",   deviceId],
        ["Location",    location],
        ["Severity",    severity],
        ["Time",        new Date().toLocaleString("en-US")],
        ...details,
      ],
    });
  }
}
