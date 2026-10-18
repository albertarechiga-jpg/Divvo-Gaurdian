// status — status interface.
//
// PLACEHOLDER PATH/PAYLOAD. Swap for Willfine's real shape once Alberto
// supplies the sheet. For now:
//   POST { imei, battery, signal, temp_c, lat, lng, sd_free_mb }
// (all fields besides imei optional — only the ones present are applied)
//
// Updates battery, signal, temp, GPS, SD, `last_seen`, sets status=online,
// and inserts a `status` event with the raw payload received.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { logRequest } from "../_shared/logEvent.ts";
import { authenticateDevice, extractDeviceToken } from "../_shared/security.ts";

const NUMERIC_FIELDS = ["battery", "signal", "temp_c", "lat", "lng", "sd_free_mb"] as const;

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, code: 400, message: "invalid JSON body" }, 400);
  }

  const imei = typeof body.imei === "string" ? body.imei : null;
  if (!imei) return jsonResponse({ ok: false, code: 400, message: "imei is required" }, 400);

  const admin = supabaseAdmin();
  const deviceToken = extractDeviceToken(req, body);
  const auth = await authenticateDevice(admin, imei, deviceToken);
  if (!auth.ok) {
    await logRequest(admin, imei, "status", { rejected: auth.error });
    return jsonResponse({ ok: false, ...auth.error }, 200);
  }

  const update: Record<string, unknown> = { last_seen: new Date().toISOString(), status: "online" };
  for (const field of NUMERIC_FIELDS) {
    const value = body[field];
    if (typeof value === "number" && Number.isFinite(value)) update[field] = value;
  }

  const { error } = await admin.from("imei_devices").update(update).eq("imei", imei);
  if (error) {
    console.error("status update failed:", error);
    return jsonResponse({ ok: false, code: 500, message: "internal error" }, 500);
  }

  await logRequest(admin, imei, "status", update);

  return jsonResponse({ ok: true }, 200);
});
