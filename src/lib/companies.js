const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
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
