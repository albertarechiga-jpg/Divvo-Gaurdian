import JSZip from "jszip";
import { SB_URL, authHeaders } from "./supabase.js";

// Proof-of-capture photos (supabase/functions/file-upload + public/camera.html).
// Reads use the signed-in user's session (RLS: dashboard users only). Nothing
// here writes to `photos` — rows are inserted by the Edge Function with the
// service role and are append-only (see pilot_proof_of_capture_migration.sql).

const MAX_EXPORT_PHOTOS = 500;

export async function fetchPhotos(accessToken, imei, { from, to, limit = 100 } = {}) {
  const params = new URLSearchParams();
  params.set("imei", `eq.${imei}`);
  params.set("select", "*");
  params.set("order", "created_at.desc");
  params.set("limit", String(limit));
  const and = [];
  if (from) and.push(`created_at.gte.${new Date(`${from}T00:00:00`).toISOString()}`);
  if (to) and.push(`created_at.lt.${new Date(new Date(`${to}T00:00:00`).getTime() + 86_400_000).toISOString()}`);
  if (and.length) params.set("and", `(${and.join(",")})`);
  const res = await fetch(`${SB_URL}/rest/v1/photos?${params.toString()}`, { headers: authHeaders(accessToken) });
  if (!res.ok) throw new Error(`Failed to load photos (${res.status})`);
  return res.json();
}

// Batch-sign private device-photos objects. Returns { [storage_path]: url }.
export async function signPhotoUrls(accessToken, paths, expiresIn = 900) {
  if (!paths.length) return {};
  const res = await fetch(`${SB_URL}/storage/v1/object/sign/device-photos`, {
    method: "POST",
    headers: authHeaders(accessToken, { "Content-Type": "application/json" }),
    body: JSON.stringify({ expiresIn, paths }),
  });
  if (!res.ok) throw new Error(`Failed to sign photo URLs (${res.status})`);
  const rows = await res.json();
  const out = {};
  for (const row of rows) {
    if (row.signedURL) out[row.path] = `${SB_URL}/storage/v1${row.signedURL}`;
  }
  return out;
}

export async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function mapsLink(photo) {
  if (photo.lat == null || photo.lon == null) return null;
  return `https://www.openstreetmap.org/?mlat=${photo.lat}&mlon=${photo.lon}#map=17/${photo.lat}/${photo.lon}`;
}

function stamp(iso) {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

function csvCell(v) {
  if (v == null) return "";
  let s = String(v);
  // Neutralise spreadsheet formula injection for text fields.
  if (/^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const README = `PROOF-OF-CAPTURE EVIDENCE PACKAGE
=================================

Contents
  photos/            the original JPEG files, exactly as stored
  manifest.csv       one row per photo (open in a spreadsheet)
  manifest.json      same data plus package details
  SHA256SUMS.txt     SHA-256 fingerprint of every photo

Verify the photos are unchanged
  Linux:   sha256sum -c SHA256SUMS.txt
  macOS:   shasum -a 256 -c SHA256SUMS.txt
  Windows: certutil -hashfile photos\\<file> SHA256   (compare to SHA256SUMS.txt)

The fingerprints in SHA256SUMS.txt are the ones the server recorded when each
photo was uploaded. A file that fails the check is not the file that was
uploaded. The manifest "integrity" column shows the same check, done by the
dashboard at export time ("match", "MISMATCH", "no_recorded_hash" or
"download_failed").

What the fields mean
  received_at_utc    when OUR SERVER received the upload. Server-assigned.
  captured_at_utc    when the PHONE says it took the photo (phone clock).
  lat / lon / accuracy_m   GPS fix the phone reported at capture time.
  hash_verified_at_upload  true = the phone computed its own SHA-256 and it
                     matched the one the server computed on arrival (no
                     corruption in transit).
  command_id         the dashboard "Capture" request this photo answers.

What this package does and does not prove
  - It shows the files are unchanged since upload and when the server got them.
  - captured_at and GPS come from the phone and are NOT independently verified.
  - It does not by itself prove who was holding the phone or that the scene is
    genuine. It is supporting evidence, not a certified chain of custody.
`;

// Builds a ZIP with the original photos, a manifest and SHA256SUMS. Each photo
// is downloaded and re-hashed in the browser so the manifest records whether
// the stored object still matches the hash recorded at upload.
export async function buildEvidencePackage({ accessToken, imei, photos, exportedBy, onProgress }) {
  if (photos.length > MAX_EXPORT_PHOTOS) throw new Error(`Export is limited to ${MAX_EXPORT_PHOTOS} photos`);
  const urls = await signPhotoUrls(accessToken, photos.map((p) => p.storage_path), 1800);
  const zip = new JSZip();
  let done = 0;

  const rows = await mapLimit(photos, 4, async (p) => {
    const file = `${imei}_${stamp(p.created_at)}_${(p.sha256 || String(p.id)).slice(0, 8)}.jpg`;
    let recomputed = null;
    let integrity = "download_failed";
    try {
      const res = await fetch(urls[p.storage_path]);
      if (!res.ok) throw new Error(String(res.status));
      const buf = await res.arrayBuffer();
      recomputed = await sha256Hex(buf);
      zip.file(`photos/${file}`, buf);
      integrity = !p.sha256 ? "no_recorded_hash" : recomputed === p.sha256 ? "match" : "MISMATCH";
    } catch {
      /* integrity stays download_failed */
    }
    onProgress?.(++done, photos.length);
    return {
      file: integrity === "download_failed" ? null : `photos/${file}`,
      photo_id: p.id,
      device_id: p.imei,
      source: p.source,
      received_at_utc: p.created_at,
      captured_at_utc: p.captured_at,
      lat: p.lat,
      lon: p.lon,
      accuracy_m: p.accuracy_m,
      map_link: mapsLink(p),
      sha256_recorded: p.sha256,
      sha256_recomputed_at_export: recomputed,
      integrity,
      hash_verified_at_upload: p.hash_verified,
      size_bytes: p.size_bytes,
      command_id: p.command_id,
    };
  });

  const cols = Object.keys(rows[0] || { file: 1 });
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\r\n") + "\r\n";
  const sums =
    rows
      .filter((r) => r.file)
      .map((r) => `${r.sha256_recorded || r.sha256_recomputed_at_export}  ${r.file}`)
      .join("\n") + "\n";

  zip.file("manifest.csv", csv);
  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        package: { generator: "Nihlus Vision dashboard", exported_at_utc: new Date().toISOString(), exported_by: exportedBy || null, device_id: imei, photo_count: rows.length },
        photos: rows,
      },
      null,
      2,
    ),
  );
  zip.file("SHA256SUMS.txt", sums);
  zip.file("README.txt", README);

  const problems = rows.filter((r) => r.integrity !== "match").length;
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  return { blob, filename: `evidence_${imei}_${stamp(new Date().toISOString())}.zip`, problems, count: rows.length };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
