import { SB_URL, authHeaders } from "./supabase.js";

export async function captureEvidence(accessToken, { missionId, imageDataUrl }) {
  const res = await fetch("/api/upload-evidence", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ missionId, imageDataUrl }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to capture evidence");
  return data;
}

// Caller's own session (not the anon key) — evidence_files_select RLS
// requires a real auth.uid(). Only lists cheap metadata; actual file URLs
// are resolved lazily per-item via getEvidenceUrl (signed, short-lived).
export async function fetchEvidenceFiles(accessToken, missionId) {
  const headers = authHeaders(accessToken);
  const res = await fetch(
    `${SB_URL}/rest/v1/evidence_files?select=id,file_type,created_at&mission_id=eq.${missionId}&order=created_at.desc`,
    { headers }
  );
  if (!res.ok) return [];
  return res.json();
}

export async function getEvidenceUrl(accessToken, evidenceFileId) {
  const res = await fetch("/api/get-evidence-url", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ evidenceFileId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to get evidence URL");
  return data.url;
}
