import { SB_URL, authHeaders } from "./supabase.js";

// insurance_claims has no RLS of its own (a table created fresh this
// session, not part of the original v2 migration — see
// api/upsert-insurance-claim.js), but reads still go through the caller's
// own session rather than the anon key, for consistency with every other
// mission-scoped read and to keep the door open to adding real RLS later
// without a client-side rewrite.
export async function fetchInsuranceClaim(accessToken, missionId) {
  const headers = authHeaders(accessToken);
  const res = await fetch(
    `${SB_URL}/rest/v1/insurance_claims?select=*&mission_id=eq.${missionId}&limit=1`,
    { headers }
  );
  if (!res.ok) return null;
  const [claim] = await res.json();
  return claim || null;
}

export async function upsertInsuranceClaim(accessToken, payload) {
  const res = await fetch("/api/upsert-insurance-claim", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to save insurance claim");
  return data.claim;
}
