import { SB_URL, sbHeaders } from "./supabase.js";

function normalizeCompany(r) {
  return {
    id: r.id,
    name: r.name,
    program: r.program,
    region: r.region,
    mapCenter: [r.map_center_lng, r.map_center_lat],
    mapZoom: r.map_zoom,
  };
}

export async function fetchCompanies() {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/companies?select=*&order=created_at.asc`, {
      headers: sbHeaders(),
    });
    const rows = await res.json();
    if (!Array.isArray(rows)) return [];
    return rows.map(normalizeCompany);
  } catch {
    return [];
  }
}

// Writes go through api/add-company.js (service_role key, bypasses RLS) —
// the anon key used everywhere else in this file can only read companies.
export async function createCompany({ name, region, mapCenter, mapZoom, primaryEmail, primaryPhone }) {
  const res = await fetch("/api/add-company", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, region, mapCenter, mapZoom, primaryEmail, primaryPhone }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to create company");
  return normalizeCompany(data.company);
}
