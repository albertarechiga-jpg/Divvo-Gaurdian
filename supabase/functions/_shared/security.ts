import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export const ERR_IMEI_NOT_EXIST = { code: 1001, message: "IMEI not exist" };
export const ERR_RATE_LIMITED = { code: 1002, message: "rate limited" };
export const ERR_BAD_TOKEN = { code: 1003, message: "invalid device_token" };

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 60; // per IMEI per window, across all 7 endpoints

export type DeviceAuthResult =
  | { ok: true; device: Record<string, unknown> }
  | { ok: false; error: { code: number; message: string } };

// An IMEI alone is guessable, so every endpoint keyed by IMEI runs through
// this before doing anything else:
//   - path A (Willfine HTTPS API): the IMEI must already exist in `imei_devices`
//     (the allowlist — imei_devices are provisioned by us, never self-registered)
//     and the IMEI is rate-limited using recent rows in `events`.
//   - path B (future Nihlus BG95 firmware): callers pass `device_token`
//     (header `x-device-token` or body field), which must match the device's
//     stored `imei_devices.device_token` exactly. Token-authenticated calls skip
//     the allowlist/rate-limit check — the token itself is the proof of
//     legitimacy.
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

  if (deviceToken) {
    if (!device.device_token || device.device_token !== deviceToken) {
      return { ok: false, error: ERR_BAD_TOKEN };
    }
    return { ok: true, device };
  }

  const withinLimit = await checkRateLimit(admin, imei);
  if (!withinLimit) return { ok: false, error: ERR_RATE_LIMITED };

  return { ok: true, device };
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
