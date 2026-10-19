import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export const ERR_IMEI_NOT_EXIST = { code: 1001, message: "IMEI not exist" };
export const ERR_RATE_LIMITED = { code: 1002, message: "rate limited" };
export const ERR_BAD_TOKEN = { code: 1003, message: "invalid device_token" };

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 60; // per IMEI per window, across all 7 endpoints

export type DeviceAuthResult =
  | { ok: true; device: Record<string, unknown>; via: "token" | "imei" }
  | { ok: false; error: { code: number; message: string } };

// Device tokens are stored only as a SHA-256 hash in `device_credentials`
// (service-role-only table, no policies — see pilot_proof_of_capture_migration.sql).
// The old plaintext `imei_devices.device_token` column was readable by every
// dashboard user and leaked through Realtime, so it is no longer consulted.
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Constant-time comparison of two equal-purpose hex strings.
export function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// An IMEI alone is guessable, so every endpoint keyed by IMEI runs through
// this before doing anything else:
//   - device WITH a row in `device_credentials` (phones in the pilot, future
//     Nihlus BG95 firmware): the caller MUST present `device_token` (header
//     `x-device-token` or body field) whose SHA-256 matches the stored hash.
//     There is no fallback to the IMEI-only path for these devices, so
//     knowing the IMEI is worthless. Token-authenticated calls skip the
//     rate limit — the token itself is the proof of legitimacy.
//   - device WITHOUT credentials (path A, Willfine HTTPS API): the IMEI must
//     already exist in `imei_devices` (the allowlist — imei_devices are
//     provisioned by us, never self-registered) and the IMEI is rate-limited
//     using recent rows in `events`. A token presented for such a device is
//     rejected rather than ignored.
export async function authenticateDevice(
  admin: SupabaseClient,
  imei: string,
  deviceToken: string | null,
): Promise<DeviceAuthResult> {
  const { data: device, error } = await admin
    .from("imei_devices")
    .select("*")
    .eq("imei", imei)
    .maybeSingle();

  if (error) throw error;
  if (!device) return { ok: false, error: ERR_IMEI_NOT_EXIST };

  // Fail closed: if this lookup errors (e.g. the migration hasn't been run),
  // throw -> 500 instead of silently treating a credentialed device as path A.
  const { data: credential, error: credError } = await admin
    .from("device_credentials")
    .select("token_hash")
    .eq("imei", imei)
    .maybeSingle();
  if (credError) throw credError;

  if (credential) {
    if (!deviceToken) return { ok: false, error: ERR_BAD_TOKEN };
    const presented = await hashToken(deviceToken);
    if (!timingSafeEqualStr(presented, String(credential.token_hash))) {
      return { ok: false, error: ERR_BAD_TOKEN };
    }
    return { ok: true, device, via: "token" };
  }

  if (deviceToken) return { ok: false, error: ERR_BAD_TOKEN };

  const withinLimit = await checkRateLimit(admin, imei);
  if (!withinLimit) return { ok: false, error: ERR_RATE_LIMITED };

  return { ok: true, device, via: "imei" };
}

// Table-backed sliding-window rate limit (an Edge Function isolate can be
// recycled between invocations, so in-memory counters aren't reliable) —
// counts this IMEI's own logged requests in the last window. Relies on the
// caller logging this request to `events` via logRequest() AFTER this check
// passes, so the current request doesn't count against itself.
async function checkRateLimit(admin: SupabaseClient, imei: string): Promise<boolean> {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count, error } = await admin
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("imei", imei)
    .gte("created_at", since);

  if (error) throw error;
  return (count ?? 0) < RATE_LIMIT_MAX_REQUESTS;
}

export function extractDeviceToken(req: Request, body: Record<string, unknown> | null): string | null {
  const header = req.headers.get("x-device-token");
  if (header) return header;
  const fromBody = body && typeof body["device_token"] === "string" ? (body["device_token"] as string) : null;
  return fromBody || null;
}
