export const INITIAL_INCIDENTS = [
  {
    id: "INC-2026-0041",
    shipmentId: "OWL-SAV-1003",
    title: "Suspected Cargo Theft — Savannah to Atlanta",
    stage: 4,
    stageLabel: "Recovery Team Assigned",
    priority: "Critical",
    createdAt: "2026-06-19T08:30:00",
    assignedTo: "Marcus Webb",
    cargoValue: 3_100_000,
    description:
      "Container door breached during unauthorized stop on I-16 W. Recovery team deployed. Law enforcement package being compiled.",
    updates: [
      { time: "2026-06-19T08:14:00", text: "Door opened alert triggered" },
      { time: "2026-06-19T08:30:00", text: "Incident case created by Divvo ops" },
      { time: "2026-06-19T09:00:00", text: "Divvo senior analyst review initiated" },
      { time: "2026-06-19T10:15:00", text: "Recovery team (Team Bravo) assigned" },
    ],
  },
  {
    id: "INC-2026-0038",
    shipmentId: "OWL-HOU-1001",
    title: "Route Deviation Investigation — Houston Corridor",
    stage: 3,
    stageLabel: "Divvo Review",
    priority: "High",
    createdAt: "2026-06-18T23:00:00",
    assignedTo: "Priya Chandran",
    cargoValue: 2_400_000,
    description:
      "Unplanned exit and extended stop pattern flagged for review. Driver has not responded to check-in calls.",
    updates: [
      { time: "2026-06-18T22:45:00", text: "Route deviation alert triggered" },
      { time: "2026-06-18T23:00:00", text: "Case created — escalated for review" },
      { time: "2026-06-19T07:30:00", text: "Divvo analyst assigned for review" },
    ],
  },
  {
    id: "INC-2026-0029",
    shipmentId: "OWL-LGB-1002",
    title: "Tracker Signal Loss — LGB Shipment",
    stage: 7,
    stageLabel: "Recovery Complete",
    priority: "Medium",
    createdAt: "2026-06-17T14:00:00",
    assignedTo: "Divvo Ops",
    cargoValue: 1_850_000,
    description:
      "47-minute tracker blackout. Shipment confirmed intact after signal restored. Carrier confirmed maintenance issue.",
    updates: [
      { time: "2026-06-17T14:00:00", text: "Tracker offline alert" },
      { time: "2026-06-17T14:50:00", text: "Signal restored — carrier contacted" },
      { time: "2026-06-17T16:00:00", text: "Carrier confirmed antenna maintenance" },
      { time: "2026-06-17T16:30:00", text: "Case resolved — no theft" },
    ],
  },
];

export const WORKFLOW_STAGES = [
  "Alert Received",
  "Case Created",
  "Divvo Review",
  "Recovery Team Assigned",
  "Law Enforcement Package Prepared",
  "Asset Located",
  "Recovery Complete",
];
