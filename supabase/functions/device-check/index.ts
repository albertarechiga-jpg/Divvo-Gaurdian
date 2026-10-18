// device-check — SIM / device legitimacy check.
//
// PLACEHOLDER PATH/PAYLOAD. Willfine's API sheet lists this as one of 7
// HTTPS APIs keyed by IMEI; we know its purpose but not the real request
// path or JSON shape yet. Swap the request-parsing below for the real
// payload once Alberto supplies the sheet — the imei_devices-table lookup and
// response codes underneath are the real, final logic.
//
// Request (placeholder):  POST { imei: string }
// Response: { ok: true } on a known IMEI, or { ok: false, code: 1001,
// message: "IMEI not exist" } otherwise.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { logRequest } from "../_shared/logEvent.ts";
import { ERR_IMEI_NOT_EXIST } from "../_shared/security.ts";

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
  if (!imei) {
    return jsonResponse({ ok: false, code: 400, message: "imei is required" }, 400);
  }

  const admin = supabaseAdmin();

  const { data: device, error } = await admin
    .from("imei_devices")
    .select("imei")
    .eq("imei", imei)
    .maybeSingle();
  if (error) {
    console.error("device-check query failed:", error);
    return jsonResponse({ ok: false, code: 500, message: "internal error" }, 500);
  }

  await logRequest(admin, imei, "device_check", { found: !!device });

  if (!device) {
    return jsonResponse({ ok: false, ...ERR_IMEI_NOT_EXIST }, 200);
  }

  return jsonResponse({ ok: true }, 200);
});
