import { useState, useEffect } from "react";
import { SB_URL, sbHeaders } from "../lib/supabase.js";

async function loadSettings(companyId) {
  const res = await fetch(SB_URL + `/rest/v1/alert_settings?select=*&company_id=eq.${companyId}&limit=1`, {
    headers: sbHeaders(),
  });
  const rows = await res.json();
  return rows?.[0] ?? null;
}

async function saveSettings(id, data) {
  await fetch(SB_URL + "/rest/v1/alert_settings?id=eq." + id, {
    method: "PATCH",
    headers: sbHeaders({ "Content-Type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify({ ...data, updated_at: new Date().toISOString() }),
  });
}

const Toggle = ({ checked, onChange, label, sub }) => (
  <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #111827", cursor: "pointer" }}>
    <div>
      <div style={{ fontSize: 13, color: "#d1d5db", fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{sub}</div>}
    </div>
    <div
      onClick={onChange}
      style={{ width: 44, height: 24, borderRadius: 12, background: checked ? "#2563eb" : "#374151", position: "relative", transition: "background 0.2s", flexShrink: 0, cursor: "pointer" }}
    >
      <div style={{ width: 18, height: 18, borderRadius: "50%", background: "white", position: "absolute", top: 3, left: checked ? 23 : 3, transition: "left 0.2s" }}/>
    </div>
  </label>
);

const Section = ({ title, children }) => (
  <div style={{ background: "#0a0f1a", border: "1px solid #1f2937", borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
    <div style={{ padding: "12px 20px", borderBottom: "1px solid #1f2937", background: "#060d18" }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.1em" }}>{title}</p>
    </div>
    <div style={{ padding: "4px 20px 12px" }}>{children}</div>
  </div>
);

export default function SettingsPage({ companyInfo }) {
  const company = companyInfo.id;
  const [settings, setSettings]   = useState(null);
  const [settingsId, setSettingsId] = useState(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [toast, setToast]         = useState(null);
  const [newEmail, setNewEmail]   = useState("");
  const [newPhone, setNewPhone]   = useState("");
  const [testLoading, setTestLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setSettings(null);
    loadSettings(company).then((s) => {
      if (s) {
        setSettingsId(s.id);
        setSettings({
          client_name:    s.client_name || companyInfo.name,
          emails:         Array.isArray(s.emails) ? s.emails : [],
          phones:         Array.isArray(s.phones) ? s.phones : [],
          sms_critical:   s.sms_critical ?? true,
          sms_warning:    s.sms_warning ?? false,
          email_critical: s.email_critical ?? true,
          email_warning:  s.email_warning ?? true,
          browser_all:    s.browser_all ?? true,
        });
      } else {
        setSettingsId(null);
      }
      setLoading(false);
    });
  }, [company]);

  const showToast = (msg, color = "#22c55e") => {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSave = async () => {
    if (!settingsId) return;
    setSaving(true);
    await saveSettings(settingsId, settings);
    setSaving(false);
    showToast("Settings saved successfully");
  };

  const addEmail = () => {
    if (!newEmail || !newEmail.includes("@")) return;
    setSettings((s) => ({ ...s, emails: [...(s.emails || []), newEmail.trim()] }));
    setNewEmail("");
  };

  const removeEmail = (i) => {
    setSettings((s) => ({ ...s, emails: s.emails.filter((_, idx) => idx !== i) }));
  };

  const addPhone = () => {
    if (!newPhone || newPhone.length < 10) return;
    const formatted = newPhone.startsWith("+") ? newPhone : "+" + newPhone.replace(/\D/g, "");
    setSettings((s) => ({ ...s, phones: [...(s.phones || []), formatted] }));
    setNewPhone("");
  };

  const removePhone = (i) => {
    setSettings((s) => ({ ...s, phones: s.phones.filter((_, idx) => idx !== i) }));
  };

  const sendTestAlert = async () => {
    setTestLoading(true);
    try {
      // Browser notification
      if (settings.browser_all) {
        if (Notification.permission === "default") await Notification.requestPermission();
        if (Notification.permission === "granted") {
          new Notification("🚨 Divvo Guardian — Test Alert", {
            body: "This is a test notification from Divvo Guardian. All systems operational.",
          });
        }
      }
      // Test SMS (non-blocking — errors don't stop email)
      if (settings.sms_critical && settings.phones?.length) {
        try {
          await fetch("/api/send-sms", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: settings.phones,
              message: "DIVVO GUARDIAN ALERT: This is a test notification from Divvo Guardian. All systems operational. divvo-guardian.vercel.app",
            }),
          });
        } catch (e) { console.warn("SMS failed:", e); }
      }
      // Test email
      if (settings.email_critical && settings.emails?.length) {
        try {
          const emailRes = await fetch("/api/send-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: settings.emails,
              subject: "[TEST] Divvo Guardian — Alert Notification Test",
              alertType: "Test Notification",
              deviceId: "TEST-001",
              location: "System Test",
              severity: "Critical",
              details: [
                ["Alert Type", "Test Notification"],
                ["Device ID", "TEST-001"],
                ["Status", "All systems operational"],
                ["Time", new Date().toLocaleString("en-US")],
              ],
            }),
          });
          const emailData = await emailRes.json();
          if (emailData.error) {
            showToast("Email error: " + emailData.error, "#ef4444");
            setTestLoading(false);
            return;
          }
          showToast("Test alert sent — check your WhatsApp and email");
        } catch (e) {
          showToast("Email failed: " + e.message, "#ef4444");
        }
      } else {
        showToast("Test alert sent");
      }
    } catch (e) {
      showToast("Test failed: " + e.message, "#ef4444");
    }
    setTestLoading(false);
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#6b7280" }}>
      Loading settings...
    </div>
  );

  if (!settings) return (
    <div style={{ padding: 32, color: "#ef4444" }}>Failed to load settings.</div>
  );

  return (
    <div style={{ background: "#070d17", minHeight: "100vh", color: "#f9fafb", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <style>{`* { box-sizing: border-box; } input:focus { outline: none; }`}</style>

      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 1000, background: toast.color === "#ef4444" ? "#450a0a" : "#052e16", border: "1px solid " + toast.color, borderRadius: 12, padding: "12px 18px", color: "#f9fafb", fontSize: 13, fontWeight: 700, boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ background: "#060d18", borderBottom: "1px solid #1f2937", padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "#f9fafb", margin: 0 }}>Settings</h1>
          <p style={{ fontSize: 12, color: "#6b7280", margin: "4px 0 0" }}>Alert configuration, contact management, and system preferences</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={sendTestAlert}
            disabled={testLoading}
            style={{ background: "#1a1200", border: "1px solid #f59e0b", color: "#fcd34d", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: testLoading ? "not-allowed" : "pointer" }}
          >
            {testLoading ? "Sending..." : "🔔 Send Test Alert"}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ background: saving ? "#1e3a8a80" : "#2563eb", border: "none", color: "white", borderRadius: 8, padding: "8px 20px", fontSize: 12, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>

      <div style={{ padding: "24px 32px", maxWidth: 900, margin: "0 auto" }}>

        {/* Account */}
        <Section title="Account">
          <div style={{ paddingTop: 10 }}>
            <label style={{ fontSize: 11, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>Client Name</label>
            <input
              value={settings.client_name}
              onChange={(e) => setSettings((s) => ({ ...s, client_name: e.target.value }))}
              style={{ width: "100%", background: "#111827", border: "1px solid #1f2937", borderRadius: 8, padding: "8px 12px", color: "#f9fafb", fontSize: 13 }}
            />
          </div>
        </Section>

        {/* Alert Contacts */}
        <Section title="Alert Contacts — Email">
          <div style={{ paddingTop: 8 }}>
            <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>These email addresses will receive alert notifications based on the rules below.</p>
            {(settings.emails || []).map((email, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #111827" }}>
                <span style={{ flex: 1, fontSize: 13, color: "#d1d5db", fontFamily: "monospace" }}>{email}</span>
                <button onClick={() => removeEmail(i)} style={{ background: "#450a0a", border: "1px solid #ef4444", color: "#fca5a5", borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Remove</button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addEmail()}
                placeholder="Add email address..."
                style={{ flex: 1, background: "#111827", border: "1px solid #1f2937", borderRadius: 8, padding: "8px 12px", color: "#f9fafb", fontSize: 12 }}
              />
              <button onClick={addEmail} style={{ background: "#1e3a8a", border: "1px solid #2563eb", color: "#93c5fd", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ Add</button>
            </div>
          </div>
        </Section>

        <Section title="Alert Contacts — SMS / Phone">
          <div style={{ paddingTop: 8 }}>
            <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>These phone numbers will receive SMS alerts. Include country code (e.g. +12105564917).</p>
            {(settings.phones || []).map((phone, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #111827" }}>
                <span style={{ flex: 1, fontSize: 13, color: "#d1d5db", fontFamily: "monospace" }}>{phone}</span>
                <button onClick={() => removePhone(i)} style={{ background: "#450a0a", border: "1px solid #ef4444", color: "#fca5a5", borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Remove</button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addPhone()}
                placeholder="+1 (210) 555-0000"
                style={{ flex: 1, background: "#111827", border: "1px solid #1f2937", borderRadius: 8, padding: "8px 12px", color: "#f9fafb", fontSize: 12 }}
              />
              <button onClick={addPhone} style={{ background: "#1e3a8a", border: "1px solid #2563eb", color: "#93c5fd", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ Add</button>
            </div>
          </div>
        </Section>

        {/* Notification Rules */}
        <Section title="SMS Alert Rules">
          <Toggle
            checked={settings.sms_critical}
            onChange={() => setSettings((s) => ({ ...s, sms_critical: !s.sms_critical }))}
            label="SMS on Critical Alerts"
            sub="Lock tamper, door breach, forced entry, active theft — immediate SMS"
          />
          <Toggle
            checked={settings.sms_warning}
            onChange={() => setSettings((s) => ({ ...s, sms_warning: !s.sms_warning }))}
            label="SMS on Warning Alerts"
            sub="Low battery, GPS degraded, speed threshold, geofence breach"
          />
        </Section>

        <Section title="Email Alert Rules">
          <Toggle
            checked={settings.email_critical}
            onChange={() => setSettings((s) => ({ ...s, email_critical: !s.email_critical }))}
            label="Email on Critical Alerts"
            sub="Full alert detail with evidence link and dashboard button"
          />
          <Toggle
            checked={settings.email_warning}
            onChange={() => setSettings((s) => ({ ...s, email_warning: !s.email_warning }))}
            label="Email on Warning Alerts"
            sub="Warning summary with recommended action"
          />
        </Section>

        <Section title="Browser Notifications">
          <Toggle
            checked={settings.browser_all}
            onChange={() => setSettings((s) => ({ ...s, browser_all: !s.browser_all }))}
            label="Browser Push Notifications"
            sub="Native OS notification when dashboard is open — fires for all alert types"
          />
          <div style={{ paddingTop: 10 }}>
            <button
              onClick={async () => {
                const perm = await Notification.requestPermission();
                showToast(perm === "granted" ? "Browser notifications enabled" : "Permission denied — check browser settings", perm === "granted" ? "#22c55e" : "#ef4444");
              }}
              style={{ background: "#111827", border: "1px solid #374151", color: "#9ca3af", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >
              Request Browser Permission
            </button>
          </div>
        </Section>

        {/* Detection thresholds */}
        <Section title="Detection Thresholds">
          {[
            ["Route Deviation Threshold", "0.5 miles"],
            ["Unauthorized Stop Duration", "20 minutes"],
            ["Low Battery Threshold", "35%"],
            ["Critical Risk Score", "80 / 100"],
            ["Tracker Offline Threshold", "30 minutes"],
            ["Speed Alert Threshold", "25 mph"],
            ["IMU Impact Threshold", "3.20G force"],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #111827" }}>
              <span style={{ fontSize: 13, color: "#9ca3af" }}>{k}</span>
              <span style={{ fontSize: 13, color: "#d1d5db", fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </Section>

        <div style={{ paddingBottom: 40, display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ background: saving ? "#1e3a8a80" : "#2563eb", border: "none", color: "white", borderRadius: 10, padding: "12px 32px", fontSize: 14, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}
          >
            {saving ? "Saving..." : "Save All Settings"}
          </button>
        </div>

      </div>
    </div>
  );
}
