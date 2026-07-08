import { useState, useEffect } from "react";
import { SB_URL, sbHeaders, authHeaders } from "../lib/supabase.js";

async function loadSettings(companyId) {
  const res = await fetch(SB_URL + `/rest/v1/alert_settings?select=*&company_id=eq.${companyId}&limit=1`, {
    headers: sbHeaders(),
  });
  const rows = await res.json();
  return rows?.[0] ?? null;
}

// ── Team (Architecture v2.0 auth) ────────────────────────────────────────────
async function loadTeam(accessToken) {
  try {
    const res = await fetch(
      SB_URL + "/rest/v1/users?select=id,full_name,email,status,user_roles(role)&order=created_at.asc",
      { headers: authHeaders(accessToken) }
    );
    const rows = await res.json();
    if (!Array.isArray(rows)) return [];
    return rows.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      email: r.email,
      status: r.status,
      role: r.user_roles?.[0]?.role || "—",
    }));
  } catch {
    return [];
  }
}

async function inviteTeamMember(accessToken, { fullName, email, role }) {
  const res = await fetch("/api/create-user", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ fullName, email, role }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to invite team member");
  return data;
}

const ROLE_OPTIONS = ["admin", "dispatcher", "analyst", "viewer"];

function TeamSection({ session }) {
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("dispatcher");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = () => {
    setLoading(true);
    loadTeam(session.access_token).then((rows) => {
      setTeam(rows);
      setLoading(false);
    });
  };

  useEffect(() => { refresh(); }, []);

  const handleInvite = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!fullName.trim() || !email.trim()) {
      setError("Name and email are required");
      return;
    }
    setInviting(true);
    try {
      await inviteTeamMember(session.access_token, { fullName: fullName.trim(), email: email.trim(), role });
      setFullName("");
      setEmail("");
      setRole("dispatcher");
      setNotice("Invite sent — they'll get an email to set their password.");
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setInviting(false);
    }
  };

  return (
    <Section title="Team">
      <div style={{ paddingTop: 8 }}>
        {loading ? (
          <p style={{ fontSize: 12, color: "#6b7280" }}>Loading team...</p>
        ) : (
          team.map((m) => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #111827" }}>
              <div>
                <div style={{ fontSize: 13, color: "#d1d5db", fontWeight: 500 }}>{m.fullName}</div>
                <div style={{ fontSize: 11, color: "#6b7280" }}>{m.email}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {m.status === "invited" && (
                  <span style={{ fontSize: 10, color: "#fcd34d", background: "#1a1200", border: "1px solid #f59e0b", borderRadius: 10, padding: "2px 8px" }}>Invited</span>
                )}
                <span style={{ fontSize: 11, color: "#9ca3af", textTransform: "capitalize" }}>{m.role}</span>
              </div>
            </div>
          ))
        )}
        {!loading && team.length === 0 && (
          <p style={{ fontSize: 12, color: "#6b7280", padding: "8px 0" }}>No team members yet.</p>
        )}

        <form onSubmit={handleInvite} style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #1f2937" }}>
          <p style={{ fontSize: 11, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Invite Team Member</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px auto", gap: 8 }}>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Full name"
              style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 8, padding: "8px 12px", color: "#f9fafb", fontSize: 12 }}
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 8, padding: "8px 12px", color: "#f9fafb", fontSize: 12 }}
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 8, padding: "8px 8px", color: "#f9fafb", fontSize: 12 }}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={inviting}
              style={{ background: "#1e3a8a", border: "1px solid #2563eb", color: "#93c5fd", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: inviting ? "not-allowed" : "pointer" }}
            >
              {inviting ? "Inviting..." : "+ Invite"}
            </button>
          </div>
          {error && <p style={{ color: "#fca5a5", fontSize: 11, marginTop: 8 }}>{error}</p>}
          {notice && <p style={{ color: "#86efac", fontSize: 11, marginTop: 8 }}>{notice}</p>}
        </form>
      </div>
    </Section>
  );
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

export default function SettingsPage({ companyInfo, session, currentUser }) {
  const company = companyInfo.id;
  const [settings, setSettings]   = useState(null);
  const [settingsId, setSettingsId] = useState(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [toast, setToast]         = useState(null);
  const [newEmail, setNewEmail]   = useState("");
  const [newPhone, setNewPhone]   = useState("");
  const [newLE, setNewLE] = useState({ match: "", agency: "", email: "", phone: "" });
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
          critical_response_minutes: s.critical_response_minutes ?? 5,
          warning_response_minutes:  s.warning_response_minutes ?? 15,
          le_contacts: Array.isArray(s.le_contacts) ? s.le_contacts : [],
          route_deviation_miles:     s.route_deviation_miles ?? 0.5,
          unauthorized_stop_minutes: s.unauthorized_stop_minutes ?? 20,
          low_battery_pct:           s.low_battery_pct ?? 35,
          critical_risk_score:       s.critical_risk_score ?? 80,
          imu_impact_g:              s.imu_impact_g ?? 3.2,
          angular_tilt_deg:          s.angular_tilt_deg ?? 12.0,
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

  const addLEContact = () => {
    if (!newLE.match.trim() || !newLE.agency.trim() || !newLE.email.trim()) return;
    setSettings((s) => ({ ...s, le_contacts: [...(s.le_contacts || []), { ...newLE, match: newLE.match.trim(), agency: newLE.agency.trim(), email: newLE.email.trim(), phone: newLE.phone.trim() }] }));
    setNewLE({ match: "", agency: "", email: "", phone: "" });
  };

  const removeLEContact = (i) => {
    setSettings((s) => ({ ...s, le_contacts: s.le_contacts.filter((_, idx) => idx !== i) }));
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

        <Section title="Law Enforcement Contacts">
          <div style={{ paddingTop: 8 }}>
            <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
              When "Notify Law Enforcement" is used on a case, the truck's last GPS fix is matched against the city/county/state below (case-insensitive). A match auto-fills that agency's email; no match falls back to a blank recipient for manual lookup.
            </p>
            {(settings.le_contacts || []).map((c, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid #111827" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "#d1d5db", fontWeight: 600 }}>{c.agency} <span style={{ color: "#6b7280", fontWeight: 400 }}>— matches "{c.match}"</span></div>
                  <div style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace" }}>{c.email}{c.phone ? `  ·  ${c.phone}` : ""}</div>
                </div>
                <button onClick={() => removeLEContact(i)} style={{ background: "#450a0a", border: "1px solid #ef4444", color: "#fca5a5", borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>Remove</button>
              </div>
            ))}
            {(settings.le_contacts || []).length === 0 && (
              <p style={{ fontSize: 12, color: "#6b7280", padding: "6px 0" }}>No jurisdictions configured yet — every case will fall back to a blank recipient.</p>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 8, marginTop: 10 }}>
              <input
                value={newLE.match}
                onChange={(e) => setNewLE((s) => ({ ...s, match: e.target.value }))}
                placeholder="City or county (e.g. Laredo)"
                style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 8, padding: "8px 10px", color: "#f9fafb", fontSize: 12 }}
              />
              <input
                value={newLE.agency}
                onChange={(e) => setNewLE((s) => ({ ...s, agency: e.target.value }))}
                placeholder="Agency name"
                style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 8, padding: "8px 10px", color: "#f9fafb", fontSize: 12 }}
              />
              <input
                value={newLE.email}
                onChange={(e) => setNewLE((s) => ({ ...s, email: e.target.value }))}
                placeholder="Agency email"
                style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 8, padding: "8px 10px", color: "#f9fafb", fontSize: 12 }}
              />
              <input
                value={newLE.phone}
                onChange={(e) => setNewLE((s) => ({ ...s, phone: e.target.value }))}
                placeholder="Phone (optional)"
                style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 8, padding: "8px 10px", color: "#f9fafb", fontSize: 12 }}
              />
              <button onClick={addLEContact} style={{ background: "#1e3a8a", border: "1px solid #2563eb", color: "#93c5fd", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>+ Add</button>
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

        <Section title="Escalation Response Window">
          <div style={{ paddingTop: 8 }}>
            <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
              How long an operator has to acknowledge an alert in the Command Center before it auto-escalates (SMS/email sent automatically as unacknowledged).
            </p>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #111827" }}>
              <div>
                <div style={{ fontSize: 13, color: "#d1d5db", fontWeight: 500 }}>Critical Alerts</div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>Lock tamper, door breach, active theft</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={settings.critical_response_minutes}
                  onChange={(e) => setSettings((s) => ({ ...s, critical_response_minutes: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                  style={{ width: 56, background: "#111827", border: "1px solid #1f2937", borderRadius: 8, padding: "6px 8px", color: "#f9fafb", fontSize: 13, textAlign: "center" }}
                />
                <span style={{ fontSize: 12, color: "#6b7280" }}>min</span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0" }}>
              <div>
                <div style={{ fontSize: 13, color: "#d1d5db", fontWeight: 500 }}>Warning Alerts</div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>Low battery, GPS degraded, geofence breach</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={settings.warning_response_minutes}
                  onChange={(e) => setSettings((s) => ({ ...s, warning_response_minutes: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                  style={{ width: 56, background: "#111827", border: "1px solid #1f2937", borderRadius: 8, padding: "6px 8px", color: "#f9fafb", fontSize: 13, textAlign: "center" }}
                />
                <span style={{ fontSize: 12, color: "#6b7280" }}>min</span>
              </div>
            </div>
          </div>
        </Section>

        {/* Detection thresholds */}
        <Section title="Detection Thresholds">
          <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 6, paddingTop: 8 }}>
            These drive the Dashboard's "Run Scan" detection engine — a shipment only generates an alert when it crosses the threshold below.
          </p>
          {[
            { key: "route_deviation_miles", label: "Route Deviation Threshold", suffix: "miles", step: 0.1, min: 0.1 },
            { key: "unauthorized_stop_minutes", label: "Unauthorized Stop Duration", suffix: "min", step: 1, min: 1 },
            { key: "low_battery_pct", label: "Low Battery Threshold", suffix: "%", step: 1, min: 1, max: 100 },
            { key: "critical_risk_score", label: "Critical Risk Score", suffix: "/ 100", step: 1, min: 1, max: 100 },
            { key: "imu_impact_g", label: "IMU Impact Threshold", suffix: "G", step: 0.05, min: 0.1 },
            { key: "angular_tilt_deg", label: "Angular Tilt Threshold", suffix: "°", step: 0.5, min: 0.5 },
          ].map(({ key, label, suffix, step, min, max }) => (
            <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #111827" }}>
              <span style={{ fontSize: 13, color: "#9ca3af" }}>{label}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="number"
                  step={step}
                  min={min}
                  max={max}
                  value={settings[key]}
                  onChange={(e) => setSettings((s) => ({ ...s, [key]: Math.max(min ?? 0, parseFloat(e.target.value) || 0) }))}
                  style={{ width: 72, background: "#111827", border: "1px solid #1f2937", borderRadius: 8, padding: "6px 8px", color: "#f9fafb", fontSize: 13, textAlign: "center" }}
                />
                <span style={{ fontSize: 12, color: "#6b7280", minWidth: 40 }}>{suffix}</span>
              </div>
            </div>
          ))}
          <p style={{ fontSize: 11, color: "#4b5563", marginTop: 10 }}>
            Tracker Offline and Speed Alert aren't evaluated as numeric thresholds by the detection engine yet, so there's no control for them here.
          </p>
        </Section>

        {currentUser?.role === "admin" && session && <TeamSection session={session} />}

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
