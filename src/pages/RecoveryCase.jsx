import { useState } from "react";

const CASE_DATA = {
  "DG-1028": {
    caseId: "DG-RC-2026-001", device: "DG-1028", trailerId: "TRL-4482",
    cargoValue: "$840,000", location: "I-35 N near Laredo, TX",
    lat: "27.5061N", lon: "99.5075W", severity: "Critical",
    carrier: "Maersk Line", customer: "Owlet", analyst: "J. Torres",
    insurance: "AGCS-OWL-2024-884421",
    timeline: [
      { id: 1, time: "10:14 AM", icon: "🔒", text: "Lock tamper detected", type: "critical", auto: true },
      { id: 2, time: "10:14 AM", icon: "🚪", text: "Door sensor triggered", type: "critical", auto: true },
      { id: 3, time: "10:14 AM", icon: "📷", text: "Left camera recording started", type: "alert", auto: true },
      { id: 4, time: "10:14 AM", icon: "📷", text: "Center camera captured lockbar movement", type: "alert", auto: true },
      { id: 5, time: "10:14 AM", icon: "📷", text: "Right camera captured person near trailer", type: "critical", auto: true },
      { id: 6, time: "10:14 AM", icon: "📡", text: "GPS ping rate increased to every 5 seconds", type: "system", auto: true },
      { id: 7, time: "10:14 AM", icon: "🛡️", text: "Recovery mode activated", type: "system", auto: true },
      { id: 8, time: "10:15 AM", icon: "📞", text: "Operations notified", type: "system", auto: true },
    ],
  },
  "DG-1041": {
    caseId: "DG-RC-2026-002", device: "DG-1041", trailerId: "TRL-3391",
    cargoValue: "$1,200,000", location: "US-281 near Corpus Christi, TX",
    lat: "27.8006N", lon: "97.3964W", severity: "Critical",
    carrier: "Hapag-Lloyd", customer: "Owlet", analyst: "P. Chandran",
    insurance: "AGCS-OWL-2024-884421",
    timeline: [
      { id: 1, time: "10:09 AM", icon: "🚪", text: "Door opened outside geofence boundary", type: "critical", auto: true },
      { id: 2, time: "10:07 AM", icon: "📡", text: "Geofence exit detected", type: "alert", auto: true },
      { id: 3, time: "10:07 AM", icon: "📷", text: "Camera recording started automatically", type: "alert", auto: true },
      { id: 4, time: "09:48 AM", icon: "🔒", text: "Lock disengaged — event logged", type: "alert", auto: true },
      { id: 5, time: "09:30 AM", icon: "📡", text: "GPS ping — US-281 S, Mile 44", type: "system", auto: true },
    ],
  },
  "DG-0994": {
    caseId: "DG-RC-2026-003", device: "DG-0994", trailerId: "TRL-8820",
    cargoValue: "$560,000", location: "I-10 W near San Antonio, TX",
    lat: "29.4241N", lon: "98.4936W", severity: "Warning",
    carrier: "COSCO Shipping", customer: "Owlet", analyst: "J. Torres",
    insurance: "AGCS-OWL-2024-884421",
    timeline: [
      { id: 1, time: "09:52 AM", icon: "🔋", text: "Battery dropped below 18% threshold", type: "alert", auto: true },
      { id: 2, time: "08:30 AM", icon: "🔋", text: "Battery at 31% — monitoring initiated", type: "system", auto: true },
      { id: 3, time: "07:15 AM", icon: "📡", text: "GPS ping — I-10 W, Mile 556", type: "system", auto: true },
      { id: 4, time: "06:00 AM", icon: "🔒", text: "Lock confirmed secure — daily check", type: "system", auto: true },
    ],
  },
  "DG-1102": {
    caseId: "DG-RC-2026-004", device: "DG-1102", trailerId: "TRL-5567",
    cargoValue: "$320,000", location: "FM-2252 near Helotes, TX",
    lat: "29.5736N", lon: "98.6947W", severity: "Warning",
    carrier: "Evergreen Marine", customer: "Owlet", analyst: "M. Webb",
    insurance: "AGCS-OWL-2024-884421",
    timeline: [
      { id: 1, time: "09:38 AM", icon: "📡", text: "GPS signal degraded — switching to LTE fallback", type: "alert", auto: true },
      { id: 2, time: "09:35 AM", icon: "⚠️", text: "Signal strength dropped below threshold", type: "critical", auto: true },
      { id: 3, time: "09:20 AM", icon: "📡", text: "GPS ping — FM-2252, near Helotes", type: "system", auto: true },
      { id: 4, time: "08:55 AM", icon: "🔒", text: "Lock confirmed secure", type: "system", auto: true },
    ],
  },
};

const EVIDENCE_ITEMS = [
  { id: "gps",     label: "GPS route history",       done: true },
  { id: "lock",    label: "Lock status log",          done: true },
  { id: "camera",  label: "Camera snapshots",         done: true },
  { id: "tamper",  label: "Tamper sensor log",        done: true },
  { id: "health",  label: "Device health log",        done: false },
  { id: "custody", label: "Chain of custody notes",   done: false },
];

const TYPE_STYLES = {
  critical: { dot: "#ef4444", text: "#fca5a5", bg: "#450a0a22" },
  alert:    { dot: "#f59e0b", text: "#fcd34d", bg: "#45100222" },
  system:   { dot: "#3b82f6", text: "#93c5fd", bg: "#1e3a8a22" },
  action:   { dot: "#22c55e", text: "#86efac", bg: "#05140e22" },
};

const STATUS_STYLES = {
  "Active Recovery": { bg: "#450a0a", border: "#ef4444", text: "#fca5a5", dot: "#ef4444" },
  "Asset Located":   { bg: "#052e16", border: "#22c55e", text: "#86efac", dot: "#22c55e" },
  "Closed":          { bg: "#111827", border: "#374151", text: "#9ca3af", dot: "#6b7280" },
};

export default function RecoveryCase({ onBack, deviceId }) {
  const cd = CASE_DATA[deviceId] || CASE_DATA["DG-1028"];

  const [status, setStatus]         = useState("Active Recovery");
  const [timeline, setTimeline]     = useState(cd.timeline);
  const [evidence, setEvidence]     = useState(EVIDENCE_ITEMS);
  const [notes, setNotes]           = useState("");
  const [toast, setToast]           = useState(null);
  const [teamStatus, setTeamStatus] = useState("En Route");
  const [teamETA, setTeamETA]       = useState("18 minutes");

  const addEvent = (text, type = "action") => {
    const now = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setTimeline((prev) => [{ id: Date.now(), time: now, icon: "✅", text, type }, ...prev]);
  };

  const showToast = (msg, color = "#22c55e") => {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 3500);
  };

  const handleAction = (action) => {
    switch (action) {
      case "assign":
        setTeamStatus("Assigned");
        setTeamETA("12 minutes");
        addEvent("Recovery Team Lone Star assigned and dispatched");
        showToast("Team Lone Star assigned — ETA 12 minutes");
        break;
      case "ops":
        addEvent("Operations center notified — case escalated");
        showToast("Operations notified");
        break;
      case "carrier":
        addEvent("Carrier dispatch contacted — " + cd.carrier + " ops center");
        showToast("Carrier notified");
        break;
      case "le":
        addEvent("Law enforcement notified — local authorities alerted");
        showToast("Law enforcement notified");
        break;
      case "located":
        setStatus("Asset Located");
        addEvent("Asset marked as located — field team confirmed", "action");
        showToast("Status updated to Asset Located", "#22c55e");
        break;
      case "close":
        setStatus("Closed");
        addEvent("Case closed by operations", "system");
        showToast("Case closed", "#6b7280");
        break;
      case "export":
        addEvent("Evidence packet exported and logged");
        showToast("Evidence packet exported — " + cd.caseId + ".zip");
        break;
      default:
        break;
    }
  };

  const toggleEvidence = (id) => {
    setEvidence((prev) => prev.map((e) => e.id === id ? { ...e, done: !e.done } : e));
  };

  const doneCount = evidence.filter((e) => e.done).length;
  const st = STATUS_STYLES[status] || STATUS_STYLES["Active Recovery"];

  return (
    <div style={{ background: "#070d17", minHeight: "100vh", color: "#f9fafb", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <style>{`
        * { box-sizing: border-box; }
        textarea:focus, input:focus { outline: none; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0a0f1a; }
        ::-webkit-scrollbar-thumb { background: #1f2937; border-radius: 2px; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes slideIn { from{transform:translateY(-20px);opacity:0} to{transform:translateY(0);opacity:1} }
      `}</style>

      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 1000, background: toast.color === "#6b7280" ? "#111827" : "#052e16", border: "1px solid " + toast.color, borderRadius: 12, padding: "12px 18px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.6)", animation: "slideIn 0.2s ease", maxWidth: 360 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: toast.color, display: "inline-block", flexShrink: 0 }}/>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#f9fafb" }}>{toast.msg}</span>
        </div>
      )}

      {/* Header */}
      <div style={{ background: "#060d18", borderBottom: "1px solid #1f2937", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={onBack} style={{ background: "none", border: "1px solid #1f2937", color: "#6b7280", borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>← Back</button>
          <div style={{ width: 1, height: 20, background: "#1f2937" }}/>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 800, color: "#f9fafb" }}>{cd.caseId}</span>
              <span style={{ background: st.bg, border: "1px solid " + st.border, color: st.text, fontSize: 10, fontWeight: 700, padding: "2px 10px", borderRadius: 20, letterSpacing: "0.08em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: st.dot, display: "inline-block", animation: status === "Active Recovery" ? "pulse 1.5s infinite" : "none" }}/>
                {status}
              </span>
              <span style={{ background: cd.severity === "Critical" ? "#450a0a" : "#1a1200", color: cd.severity === "Critical" ? "#fca5a5" : "#fcd34d", fontSize: 10, fontWeight: 700, padding: "2px 10px", borderRadius: 20, letterSpacing: "0.08em", textTransform: "uppercase" }}>{cd.severity}</span>
            </div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>Device: {cd.device} · {cd.location} · Cargo Value: {cd.cargoValue}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {status === "Active Recovery" && (
            <>
              <button onClick={() => handleAction("located")} style={{ background: "#052e16", border: "1px solid #22c55e", color: "#86efac", borderRadius: 8, padding: "7px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Mark Asset Located</button>
              <button onClick={() => handleAction("close")} style={{ background: "#111827", border: "1px solid #374151", color: "#9ca3af", borderRadius: 8, padding: "7px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Close Case</button>
            </>
          )}
          {status === "Asset Located" && (
            <button onClick={() => handleAction("close")} style={{ background: "#111827", border: "1px solid #374151", color: "#9ca3af", borderRadius: 8, padding: "7px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Close Case</button>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "20px 24px", display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, maxWidth: 1400, margin: "0 auto" }}>

        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Case Info Strip */}
          <div style={{ background: "#0a0f1a", border: "1px solid #1f2937", borderRadius: 12, padding: "16px 20px", display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16 }}>
            {[
              { label: "Case ID",     value: cd.caseId },
              { label: "Device",      value: cd.device },
              { label: "Trailer ID",  value: cd.trailerId },
              { label: "Cargo Value", value: cd.cargoValue },
              { label: "Last GPS",    value: cd.lat + " " + cd.lon },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#f9fafb", fontFamily: "monospace" }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Evidence Timeline */}
          <div style={{ background: "#0a0f1a", border: "1px solid #1f2937", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #1f2937", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", animation: "pulse 1.5s infinite", display: "inline-block" }}/>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em" }}>Evidence Timeline</span>
              </div>
              <span style={{ fontSize: 10, color: "#4b5563", fontFamily: "monospace" }}>{timeline.length} events</span>
            </div>
            <div style={{ maxHeight: 340, overflowY: "auto", padding: "8px 0" }}>
              {timeline.map((event, i) => {
                const ts = TYPE_STYLES[event.type] || TYPE_STYLES.system;
                return (
                  <div key={event.id} style={{ display: "flex", gap: 12, padding: "8px 16px", background: i === 0 && !event.auto ? ts.bg : "transparent" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: ts.dot, marginTop: 4, flexShrink: 0 }}/>
                      {i < timeline.length - 1 && <div style={{ width: 1, flex: 1, background: "#1f2937", marginTop: 3, minHeight: 16 }}/>}
                    </div>
                    <div style={{ flex: 1, paddingBottom: 6 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 1 }}>
                        <span style={{ fontSize: 13 }}>{event.icon}</span>
                        <span style={{ fontSize: 12, color: ts.text, fontWeight: 600, flex: 1 }}>{event.text}</span>
                        <span style={{ fontSize: 10, color: "#4b5563", fontFamily: "monospace", whiteSpace: "nowrap" }}>{event.time}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recovery Actions */}
          <div style={{ background: "#0a0f1a", border: "1px solid #1f2937", borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Recovery Actions</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {[
                { label: "Assign Recovery Team",    action: "assign",  bg: "#1e3a8a", border: "#2563eb", color: "#93c5fd", icon: "🚐" },
                { label: "Notify Operations",        action: "ops",     bg: "#1a1200", border: "#f59e0b", color: "#fcd34d", icon: "📞" },
                { label: "Notify Carrier",           action: "carrier", bg: "#0a1a0a", border: "#22c55e", color: "#86efac", icon: "🚛" },
                { label: "Notify Law Enforcement",   action: "le",      bg: "#1a0505", border: "#ef4444", color: "#fca5a5", icon: "🚔" },
                { label: "Mark Asset Located",       action: "located", bg: "#052e16", border: "#22c55e", color: "#86efac", icon: "📍", disabled: status !== "Active Recovery" },
                { label: "Close Case",               action: "close",   bg: "#111827", border: "#374151", color: "#9ca3af", icon: "✓",  disabled: status === "Closed" },
              ].map(({ label, action, bg, border, color, icon, disabled }) => (
                <button
                  key={action}
                  onClick={() => !disabled && handleAction(action)}
                  style={{ background: disabled ? "#0d1117" : bg, border: "1px solid " + (disabled ? "#1f2937" : border), color: disabled ? "#374151" : color, borderRadius: 10, padding: "12px 10px", fontSize: 12, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}
                >
                  <span style={{ fontSize: 18 }}>{icon}</span>
                  <span style={{ textAlign: "center", lineHeight: 1.3 }}>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Case Notes */}
          <div style={{ background: "#0a0f1a", border: "1px solid #1f2937", borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Case Notes</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add recovery notes, carrier updates, law enforcement reference numbers, or field observations..."
              style={{ width: "100%", minHeight: 100, background: "#060d18", border: "1px solid #1f2937", borderRadius: 8, padding: "10px 12px", color: "#d1d5db", fontSize: 12, lineHeight: 1.6, resize: "vertical", fontFamily: "inherit" }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
              <button
                onClick={() => { if (notes.trim()) { addEvent("Case note added: " + notes.slice(0, 60) + (notes.length > 60 ? "..." : "")); showToast("Note saved"); } }}
                style={{ background: "#1f2937", border: "1px solid #374151", color: "#9ca3af", borderRadius: 8, padding: "6px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
              >
                Save Note
              </button>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Recovery Team Card */}
          <div style={{ background: "#0a0f1a", border: "1px solid #1f2937", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #1f2937", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em" }}>Recovery Team</span>
              <span style={{ background: teamStatus === "En Route" ? "#1e3a8a" : "#052e16", color: teamStatus === "En Route" ? "#93c5fd" : "#86efac", border: "1px solid " + (teamStatus === "En Route" ? "#2563eb" : "#22c55e"), fontSize: 10, fontWeight: 700, padding: "2px 10px", borderRadius: 20, textTransform: "uppercase" }}>{teamStatus}</span>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <div style={{ width: 42, height: 42, background: "#1e3a8a", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 18 }}>🚐</span>
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#f9fafb" }}>Team Lone Star</div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>Southwest Recovery Division</div>
                </div>
              </div>
              {[
                ["ETA",            teamETA],
                ["Distance",       "12.4 miles"],
                ["Assigned Agent", "Marcus R."],
                ["Contact",        "+1 (210) 555-0147"],
                ["Vehicle",        "Unit 4 — White RAM 2500"],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #111827" }}>
                  <span style={{ fontSize: 11, color: "#6b7280" }}>{k}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#d1d5db" }}>{v}</span>
                </div>
              ))}
              <button onClick={() => handleAction("assign")} style={{ width: "100%", marginTop: 12, background: "#1e3a8a", border: "1px solid #2563eb", color: "#93c5fd", borderRadius: 8, padding: "9px 0", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                Confirm Assignment
              </button>
            </div>
          </div>

          {/* Evidence Packet */}
          <div style={{ background: "#0a0f1a", border: "1px solid #1f2937", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #1f2937", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em" }}>Evidence Packet</span>
              <span style={{ fontSize: 11, color: "#6b7280" }}>{doneCount}/{evidence.length} ready</span>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ height: 4, background: "#1f2937", borderRadius: 4, marginBottom: 14, overflow: "hidden" }}>
                <div style={{ height: "100%", background: "#2563eb", borderRadius: 4, width: (doneCount / evidence.length * 100) + "%", transition: "width 0.3s" }}/>
              </div>
              {evidence.map((item) => (
                <div key={item.id} onClick={() => toggleEvidence(item.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, marginBottom: 4, cursor: "pointer", background: item.done ? "#052e1620" : "transparent" }}>
                  <div style={{ width: 18, height: 18, borderRadius: 4, border: "1px solid " + (item.done ? "#22c55e" : "#374151"), background: item.done ? "#22c55e" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 11, color: "white", fontWeight: 700 }}>
                    {item.done ? "✓" : ""}
                  </div>
                  <span style={{ fontSize: 12, color: item.done ? "#86efac" : "#9ca3af", fontWeight: item.done ? 600 : 400 }}>{item.label}</span>
                </div>
              ))}
              <button onClick={() => handleAction("export")} style={{ width: "100%", marginTop: 12, background: "#1a1200", border: "1px solid #f59e0b", color: "#fcd34d", borderRadius: 8, padding: "10px 0", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <span>📦</span> Export Evidence Packet
              </button>
            </div>
          </div>

          {/* Case Metadata */}
          <div style={{ background: "#0a0f1a", border: "1px solid #1f2937", borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Case Metadata</div>
            {[
              ["Created",          "Jun 19, 2026 · 10:14 AM"],
              ["Last Updated",     new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })],
              ["Assigned Analyst", cd.analyst],
              ["Customer",         cd.customer],
              ["Carrier",          cd.carrier],
              ["Insurance Ref",    cd.insurance],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #111827", fontSize: 11 }}>
                <span style={{ color: "#6b7280" }}>{k}</span>
                <span style={{ color: "#d1d5db", fontWeight: 600, textAlign: "right", maxWidth: "55%" }}>{v}</span>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
