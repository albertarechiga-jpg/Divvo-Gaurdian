import { RISK_STYLES, STATUS_STYLES, SEVERITY_STYLES, ALERT_STATUS_STYLES } from "../lib/utils.js";

export const Badge = ({ label, style }) => (
  <span
    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide ${style}`}
  >
    {label}
  </span>
);

export const RiskBadge = ({ level }) => (
  <Badge label={level} style={RISK_STYLES[level] || "bg-gray-100 text-gray-700"} />
);

export const StatusBadge = ({ status }) => (
  <Badge label={status} style={STATUS_STYLES[status] || "bg-gray-100 text-gray-700"} />
);

export const SeverityBadge = ({ s }) => (
  <Badge label={s} style={SEVERITY_STYLES[s] || "bg-gray-100 text-gray-700"} />
);

export const AlertStatusBadge = ({ status }) => (
  <Badge label={status} style={ALERT_STATUS_STYLES[status] || "bg-gray-100 text-gray-700"} />
);
