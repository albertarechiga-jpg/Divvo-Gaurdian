// ── Formatters ────────────────────────────────────────────────────────────────

export const fmtCurrency = (v) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);

export const fmtCurrencyCompact = (v) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return fmtCurrency(v);
};

export const fmtDate = (iso) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

// ── Badge style maps ──────────────────────────────────────────────────────────

export const RISK_STYLES = {
  Low:      "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  Medium:   "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  High:     "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
  Critical: "bg-red-50 text-red-700 ring-1 ring-red-200",
};

export const STATUS_STYLES = {
  "On Schedule":    "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  "In Transit":     "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  "Delayed":        "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  "Critical Alert": "bg-red-50 text-red-700 ring-1 ring-red-200",
};

export const SEVERITY_STYLES = {
  Critical: "bg-red-600 text-white",
  High:     "bg-orange-500 text-white",
  Medium:   "bg-amber-400 text-amber-900",
  Low:      "bg-emerald-100 text-emerald-700",
};

export const ALERT_STATUS_STYLES = {
  Open:           "bg-red-50 text-red-700 ring-1 ring-red-200",
  "Under Review": "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  Resolved:       "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
};
