import { fmtCurrency } from "./utils.js";

// ── Detection Rules ───────────────────────────────────────────────────────────

export const DEFAULT_THRESHOLDS = {
  route_deviation_miles: 0.5,
  unauthorized_stop_minutes: 20,
  low_battery_pct: 35,
  critical_risk_score: 80,
  imu_impact_g: 3.20,
  angular_tilt_deg: 12.0,
};

// Builds the rule set against a thresholds object (any field the caller
// omits falls back to DEFAULT_THRESHOLDS) — lets each company tune
// sensitivity via Settings > Detection Thresholds instead of these being
// fixed constants baked into the code.
export function buildDetectionRules(thresholds = {}) {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };

  return [
    {
      id: "route-deviation",
      label: "Route Deviation",
      check: (s) => s.routeDeviation && s.deviationMiles > t.route_deviation_miles,
      severity: (s) => (s.deviationMiles > 5 ? "High" : "Medium"),
      description: (s) =>
        `Vehicle deviated ${s.deviationMiles.toFixed(1)} miles from approved corridor near ${s.lastLocation}. Unscheduled exit lasted ${s.deviationMinutes} minutes.`,
      recommendedAction: () =>
        "Contact driver immediately for explanation. Verify with carrier dispatch. If no response within 15 minutes, escalate to incident.",
    },
    {
      id: "unauthorized-stop",
      label: "Unauthorized Stop",
      check: (s) => s.unauthorizedStop && s.stopDurationMinutes > t.unauthorized_stop_minutes,
      severity: (s) =>
        s.stopDurationMinutes > 120 ? "Critical" : s.stopDurationMinutes > 45 ? "High" : "Medium",
      description: (s) =>
        `Vehicle stopped at unauthorized location (${s.stopLocation}) for ${s.stopDurationMinutes} minutes. Location is outside approved rest stops.`,
      recommendedAction: (s) =>
        s.stopDurationMinutes > 120
          ? "IMMEDIATE: Dispatch recovery team. Prolonged unauthorized stop exceeds theft threshold. Contact law enforcement."
          : "Contact driver and carrier. Request explanation and ETA confirmation. Log for pattern review.",
    },
    {
      id: "door-opened",
      label: "Door Opened",
      check: (s) => s.doorStatus === "Opened" && !s.atDestination,
      severity: () => "Critical",
      description: (s) =>
        `Container door sensor triggered at ${s.lastLocation}. Vehicle is not at an authorized unloading point. Seal status: ${s.sealStatus}.`,
      recommendedAction: () =>
        "CRITICAL: Treat as active theft. Dispatch recovery team immediately. Do not alert driver. Contact local law enforcement and prepare evidence package.",
    },
    {
      id: "tracker-offline",
      label: "Tracker Offline",
      check: (s) => s.trackerOffline,
      severity: (s) => (s.trackerOfflineMinutes > 60 ? "High" : "Medium"),
      description: (s) =>
        `GPS tracker lost signal for ${s.trackerOfflineMinutes} minutes. Last known position: ${s.lastLocation}. Signal has not been restored.`,
      recommendedAction: () =>
        "Contact carrier for vehicle location via dispatch. Request driver check-in call. If offline >60 min, escalate to High and open investigation.",
    },
    {
      id: "low-battery",
      label: "Low Tracker Battery",
      check: (s) => s.trackerBattery < t.low_battery_pct,
      severity: (s) => (s.trackerBattery < 15 ? "High" : "Medium"),
      description: (s) =>
        `Tracker battery at ${s.trackerBattery}% on shipment ${s.id}. Risk of signal loss before destination arrival. ETA: ${new Date(s.eta).toLocaleDateString()}.`,
      recommendedAction: () =>
        "Notify carrier to inspect and charge tracker unit at next authorized stop. Schedule battery swap if below 20%.",
    },
    {
      id: "critical-risk-score",
      label: "Critical Risk Score",
      check: (s) => s.riskScore >= t.critical_risk_score,
      severity: (s) => (s.riskScore >= 90 ? "Critical" : "High"),
      description: (s) =>
        `Composite risk score of ${s.riskScore}/100 detected for ${s.id}. Score reflects route, stop patterns, cargo value (${fmtCurrency(s.cargoValue)}), and carrier history.`,
      recommendedAction: (s) =>
        s.riskScore >= 90
          ? "Escalate to senior analyst immediately. Consider proactive law enforcement notification. Increase check-in frequency to every 30 minutes."
          : "Flag for enhanced monitoring. Increase tracker ping rate. Require driver check-ins every hour.",
    },
    {
      id: "seal-tampering",
      label: "Seal Tampering",
      check: (s) => s.sealStatus === "Breached",
      severity: () => "Critical",
      description: (s) =>
        `Container seal ${s.containerNumber} reported as BREACHED. Tampering detected at ${s.lastLocation}. Physical cargo integrity cannot be confirmed.`,
      recommendedAction: () =>
        "CRITICAL: Seal breach is primary theft indicator. Stop shipment if possible. Dispatch field agent. Notify customer and carrier. Prepare law enforcement package.",
    },
    {
      id: "imu-physical-tamper",
      label: "Physical Tamper Detected",
      check: (s) =>
        (s.imu_impact_g_force ?? 0) >= t.imu_impact_g || (s.angular_tilt_deviation ?? 0) >= t.angular_tilt_deg,
      severity: () => "Critical",
      description: (s) => {
        const imuResult = evaluateIncomingThreatMetrics(
          { imu_impact_g_force: s.imu_impact_g_force ?? 0, angular_tilt_deviation: s.angular_tilt_deviation ?? 0 },
          t
        );
        const detail =
          (s.imu_impact_g_force ?? 0) >= t.imu_impact_g
            ? `IMU impact force ${s.imu_impact_g_force.toFixed(2)}G exceeds prying/cutting threshold (${t.imu_impact_g.toFixed(2)}G).`
            : `Angular tilt deviation ${s.angular_tilt_deviation.toFixed(1)}° exceeds tamper threshold (${t.angular_tilt_deg.toFixed(1)}°).`;
        return `${detail} System action: ${imuResult.system_action}. Container ${s.containerNumber} at ${s.lastLocation} may be experiencing forced entry.`;
      },
      recommendedAction: () =>
        "CRITICAL: Physical tamper signature detected via onboard IMU. Treat as active break-in attempt. Dispatch recovery team immediately. Do not alert driver. Activate remote alarm if supported by tracker hardware.",
    },
  ];
}

// Back-compat: the rule set built from default thresholds, for any code that
// just wants the static list (e.g. rule ids/labels for display purposes).
export const DETECTION_RULES = buildDetectionRules();

// ── IMU / Physical Tamper Evaluation ─────────────────────────────────────────
// Evaluates raw accelerometer/gyroscope telemetry from tracker hardware.
// G-force >= threshold indicates heavy structural impact (prying, cutting).
// Angular tilt >= threshold indicates container being tilted or tipped.

export const evaluateIncomingThreatMetrics = (metrics, thresholds = DEFAULT_THRESHOLDS) => {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  if (metrics.imu_impact_g_force >= t.imu_impact_g || metrics.angular_tilt_deviation >= t.angular_tilt_deg) {
    return {
      system_action: "TRIGGER_ACTIVE_ALARM",
      threat_severity: "CRITICAL",
    };
  }
  return {
    system_action: "LOG_DIAGNOSTIC_HEARTBEAT",
    threat_severity: "LOW",
  };
};

// ── Counters (module-level, survive HMR in dev) ───────────────────────────────
let _alertSeq = 200;
let _incidentSeq = 60;

// ── Scan function ─────────────────────────────────────────────────────────────

export function runTheftDetectionScan(shipments, existingAlerts, thresholds = DEFAULT_THRESHOLDS) {
  const now = new Date().toISOString();
  const newAlerts = [];
  const rules = buildDetectionRules(thresholds);

  for (const ship of shipments) {
    for (const rule of rules) {
      if (!rule.check(ship)) continue;

      const alreadyExists = existingAlerts.some(
        (a) =>
          a.shipmentId === ship.id &&
          a.type === rule.label &&
          (a.status === "Open" || a.status === "Under Review") &&
          a.source === "scan"
      );
      if (alreadyExists) continue;

      newAlerts.push({
        id: `ALT-${String(_alertSeq++).padStart(3, "0")}`,
        shipmentId: ship.id,
        type: rule.label,
        severity: rule.severity(ship),
        timestamp: now,
        description: rule.description(ship),
        recommendedAction: rule.recommendedAction(ship),
        status: "Open",
        source: "scan",
        incidentId: null,
        ruleId: rule.id,
      });
    }
  }

  return newAlerts;
}

// ── Create incident from alert ────────────────────────────────────────────────

export function createIncidentForShipment(shipment, { title, description, priority, updates } = {}) {
  const id = `INC-2026-${String(_incidentSeq++).padStart(4, "0")}`;
  const now = new Date().toISOString();
  return {
    incident: {
      id,
      shipmentId: shipment?.id,
      title: title ?? `Manual Case — ${shipment?.id}`,
      stage: 2,
      stageLabel: "Case Created",
      priority: priority ?? shipment?.riskLevel ?? "Medium",
      createdAt: now,
      assignedTo: "Unassigned",
      cargoValue: shipment?.cargoValue ?? 0,
      description: description ?? `Manually opened recovery case for shipment ${shipment?.id}.`,
      updates: updates ?? [{ time: now, text: `Incident case created manually for shipment ${shipment?.id}` }],
    },
    incidentId: id,
  };
}

// Bridges a Command Center device (COMPANY_DEVICES entry — id, trailerId,
// type, severity, location, cargo string, etc.) into the same incident model
// used everywhere else, so device-triggered recovery cases share one data
// model with shipment-triggered ones instead of a separate mock page.
export function createIncidentForDevice(device) {
  const id = `INC-2026-${String(_incidentSeq++).padStart(4, "0")}`;
  const now = new Date().toISOString();
  const cargoValue = parseFloat(String(device.cargo ?? "").replace(/[^0-9.]/g, "")) || 0;
  return {
    incident: {
      id,
      shipmentId: null,
      deviceId: device.id,
      trailerId: device.trailerId,
      title: `${device.type} — ${device.id}`,
      stage: 2,
      stageLabel: "Case Created",
      priority: device.severity ?? "Medium",
      createdAt: now,
      assignedTo: "Unassigned",
      cargoValue,
      description: `Recovery case opened from Command Center for device ${device.id} (${device.type}) at ${device.location}.`,
      updates: [{ time: now, text: `Incident case created from Command Center device ${device.id}` }],
    },
    incidentId: id,
  };
}

export function createIncidentFromAlert(alert, shipment) {
  const now = new Date().toISOString();
  const result = createIncidentForShipment(shipment, {
    title: `${alert.type} — ${shipment?.id ?? alert.shipmentId}`,
    priority: alert.severity,
    description: `${alert.description}\n\nRecommended action: ${alert.recommendedAction}`,
    updates: [
      {
        time: alert.timestamp,
        text: `${alert.type} alert triggered (${alert.source === "scan" ? "Detection Engine" : "Manual"})`,
      },
      { time: now, text: `Incident case created from alert ${alert.id}` },
    ],
  });
  result.incident.shipmentId = shipment?.id ?? alert.shipmentId;
  return result;
}
