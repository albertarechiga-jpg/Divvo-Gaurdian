// Pure helpers for proof-of-capture uploads (no Deno / Supabase imports, so
// they can be unit-tested under plain Node).

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
// Device-claimed capture time is accepted this far into the past / future
// (relative to server receive time) from token-authenticated devices. The
// server's own receive time (photos.created_at) is always the authoritative
// timestamp; the claim is kept alongside it.
export const MAX_CAPTURE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_CAPTURE_FUTURE_MS = 10 * 60 * 1000;

const DEVICE_ID_RE = /^[A-Za-z0-9_-]{2,32}$/;
const HEX64_RE = /^[0-9a-f]{64}$/;

export function isValidDeviceId(id: unknown): id is string {
  return typeof id === "string" && DEVICE_ID_RE.test(id);
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function looksLikeJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export type CaptureMeta = {
  source: "motion" | "on_demand";
  capturedAt: string; // ISO
  lat: number | null;
  lon: number | null;
  accuracyM: number | null;
  clientSha256: string | null;
  commandId: number | null;
};

type FormLike = { get(name: string): unknown };

function numberField(raw: unknown): number | null | "bad" {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw !== "string") return "bad";
  const n = Number(raw);
  return Number.isFinite(n) ? n : "bad";
}

// strict = token-authenticated device (our own phone pages / Nihlus firmware):
// malformed metadata is rejected. Non-strict = legacy IMEI-only path A, which
// keeps its old lenient behaviour (bad/missing values fall back to defaults)
// so an unknown third-party client isn't broken by the new fields.
export function parseCaptureMeta(
  form: FormLike,
  nowMs: number,
  strict: boolean,
): { ok: true; meta: CaptureMeta } | { ok: false; message: string } {
  const source = form.get("source") === "on_demand" ? "on_demand" : "motion";

  const capturedRaw = form.get("captured_at");
  let capturedAt = new Date(nowMs).toISOString();
  if (typeof capturedRaw === "string" && capturedRaw) {
    const t = Date.parse(capturedRaw);
    if (Number.isNaN(t)) {
      if (strict) return { ok: false, message: "captured_at is not a valid timestamp" };
    } else if (strict && (t < nowMs - MAX_CAPTURE_AGE_MS || t > nowMs + MAX_CAPTURE_FUTURE_MS)) {
      return { ok: false, message: "captured_at is outside the accepted window" };
    } else {
      capturedAt = new Date(t).toISOString();
    }
  }

  const lat = numberField(form.get("lat"));
  const lon = numberField(form.get("lon"));
  const acc = numberField(form.get("accuracy_m"));
  let latV: number | null = null;
  let lonV: number | null = null;
  let accV: number | null = null;
  if (lat === "bad" || lon === "bad" || acc === "bad") {
    if (strict) return { ok: false, message: "lat/lon/accuracy_m must be numbers" };
  } else if ((lat === null) !== (lon === null)) {
    if (strict) return { ok: false, message: "lat and lon must be sent together" };
  } else if (lat !== null && lon !== null) {
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      if (strict) return { ok: false, message: "lat/lon out of range" };
    } else {
      latV = lat;
      lonV = lon;
      if (acc !== null && acc >= 0 && acc <= 100_000) accV = acc;
      else if (acc !== null && strict) return { ok: false, message: "accuracy_m out of range" };
    }
  }

  const clientHashRaw = form.get("sha256");
  let clientSha256: string | null = null;
  if (typeof clientHashRaw === "string" && clientHashRaw) {
    const h = clientHashRaw.toLowerCase();
    if (!HEX64_RE.test(h)) {
      if (strict) return { ok: false, message: "sha256 must be 64 hex characters" };
    } else {
      clientSha256 = h;
    }
  }

  const cmdRaw = form.get("command_id");
  let commandId: number | null = null;
  if (typeof cmdRaw === "string" && /^\d{1,15}$/.test(cmdRaw)) commandId = Number(cmdRaw);
  else if (typeof cmdRaw === "string" && cmdRaw && strict) return { ok: false, message: "command_id must be an integer" };

  return { ok: true, meta: { source, capturedAt, lat: latV, lon: lonV, accuracyM: accV, clientSha256, commandId } };
}
