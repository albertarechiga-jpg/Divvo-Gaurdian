import { SB_URL, sbHeaders } from "./supabase.js";
import { BRAND_DEFAULTS } from "../config/brand.js";

// brand_settings is a v1-style table (no RLS, anon-key REST), one row per
// company_id — same shape/pattern as alert_settings in src/pages/Settings.jsx.
// See supabase_brand_settings.sql for the table definition; that file must be
// run against Supabase manually (this app has no migration runner).

export function normalizeBrand(row) {
  if (!row) return { ...BRAND_DEFAULTS };
  return {
    appName:      row.app_name || BRAND_DEFAULTS.appName,
    companyName:  row.company_name || BRAND_DEFAULTS.companyName,
    shortName:    row.short_name || BRAND_DEFAULTS.shortName,
    tagline:      row.tagline || BRAND_DEFAULTS.tagline,
    logoUrl:      row.logo_url || BRAND_DEFAULTS.logoUrl,
    primaryColor: row.primary_color || BRAND_DEFAULTS.primaryColor,
  };
}

export async function fetchBrandSettings(companyId) {
  try {
    const res = await fetch(SB_URL + `/rest/v1/brand_settings?select=*&company_id=eq.${companyId}&limit=1`, {
      headers: sbHeaders(),
    });
    const rows = await res.json();
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch {
    return null;
  }
}

// `brand` is the { appName, companyName, shortName, tagline, logoUrl,
// primaryColor } shape used everywhere else in the app (see normalizeBrand).
// existingId present -> PATCH the row, otherwise POST a new one — same
// create-or-update split as alert_settings' saveSettings/createSettings.
export async function saveBrandSettings(companyId, existingId, brand) {
  const payload = {
    company_id:    companyId,
    app_name:      brand.appName,
    company_name:  brand.companyName,
    short_name:    brand.shortName,
    tagline:       brand.tagline,
    logo_url:      brand.logoUrl,
    primary_color: brand.primaryColor,
    updated_at:    new Date().toISOString(),
  };

  if (existingId) {
    const res = await fetch(SB_URL + "/rest/v1/brand_settings?id=eq." + existingId, {
      method: "PATCH",
      headers: sbHeaders({ "Content-Type": "application/json", Prefer: "return=representation" }),
      body: JSON.stringify(payload),
    });
    const rows = await res.json();
    if (!res.ok) throw new Error((Array.isArray(rows) ? rows[0]?.message : rows.message) || "Failed to save brand settings");
    return Array.isArray(rows) ? rows[0] : rows;
  }

  const res = await fetch(SB_URL + "/rest/v1/brand_settings", {
    method: "POST",
    headers: sbHeaders({ "Content-Type": "application/json", Prefer: "return=representation" }),
    body: JSON.stringify(payload),
  });
  const rows = await res.json();
  if (!res.ok) throw new Error((Array.isArray(rows) ? rows[0]?.message : rows.message) || "Failed to create brand settings");
  return Array.isArray(rows) ? rows[0] : rows;
}
