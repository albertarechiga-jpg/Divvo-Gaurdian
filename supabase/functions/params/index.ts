// params — parameter get/set.
//
// PLACEHOLDER PATH/PAYLOAD. Swap for Willfine's real shape once Alberto
// supplies the sheet. For now:
//   GET  ?imei=<imei>                       -> { ok: true, params: {...} }
//   POST { imei, params: { ...partial } }   -> merges into devices.params,
//                                              returns the merged object
//
// `params` is stored as a jsonb column added in
// 20261018000001_device_extras.sql (the 4-table schema in the task brief
// has no column for this — Willfine's actual per-device settings shape is
// still unknown, so a flexible jsonb bag is the safest placeholder).
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { logRequest } from "../_shared/logEvent.ts";
import { authenticateDevice, extractDeviceToken } from "../_shared/security.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const admin = supabaseAdmin();

  if (req.method === "GET") {
    const imei = new URL(req.url).searchParams.get("imei");
    if (!imei) return jsonResponse({ ok: false, code: 400, message: "imei is required" }, 400);

    const deviceToken = extractDeviceToken(req, null);
    const auth = await authenticateDevice(admin, imei, deviceToken);
    if (!auth.ok) {
      await logRequest(admin, imei, "params_get", { rejected: auth.error });
      return jsonResponse({ ok: false, ...auth.error }, 200);
    }

    await logRequest(admin, imei, "params_get", {});
    return jsonResponse({ ok: true, params: auth.device.params ?? {} }, 200);
  }

  if (req.method === "POST") {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ ok: false, code: 400, message: "invalid JSON body" }, 400);
    }

    const imei = typeof body.imei === "string" ? body.imei : null;
    const incomingParams = body.params && typeof body.params === "object" ? (body.params as Record<string, unknown>) : null;
    if (!imei || !incomingParams) {
      return jsonResponse({ ok: false, code: 400, message: "imei and params are required" }, 400);
    }

    const deviceToken = extractDeviceToken(req, body);
    const auth = await authenticateDevice(admin, imei, deviceToken);
    if (!auth.ok) {
      await logRequest(admin, imei, "params_set", { rejected: auth.error });
      return jsonResponse({ ok: false, ...auth.error }, 200);
    }

    const merged = { ...(auth.device.params as Record<string, unknown> ?? {}), ...incomingParams };
    const { error } = await admin.from("devices").update({ params: merged }).eq("imei", imei);
    if (error) {
      console.error("params update failed:", error);
      return jsonResponse({ ok: false, code: 500, message: "db update failed" }, 500);
    }

    await logRequest(admin, imei, "params_set", { params: incomingParams });
    return jsonResponse({ ok: true, params: merged }, 200);
  }

  return jsonResponse({ ok: false, code: 405, message: "method not allowed" }, 405);
});
