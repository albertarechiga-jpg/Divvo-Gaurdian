// file-download — firmware OTA, serve a firmware file by version.
//
// PLACEHOLDER PATH/PAYLOAD. Swap for Willfine's real shape once Alberto
// supplies the sheet. For now:
//   GET ?imei=<imei>&version=<firmware version>
//
// Firmware binaries live in the private `device-firmware` bucket (added in
// 20261018000001_device_extras.sql) at `<model>/<version>.bin`. Nothing has
// been uploaded there yet, so until a real binary is staged this always
// returns "not available" rather than guessing a file layout.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { logRequest } from "../_shared/logEvent.ts";
import { authenticateDevice, extractDeviceToken } from "../_shared/security.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const url = new URL(req.url);
  const imei = url.searchParams.get("imei");
  const version = url.searchParams.get("version");
  if (!imei || !version) {
    return jsonResponse({ ok: false, code: 400, message: "imei and version are required" }, 400);
  }

  const admin = supabaseAdmin();
  const deviceToken = extractDeviceToken(req, null);
  const auth = await authenticateDevice(admin, imei, deviceToken);
  if (!auth.ok) {
    await logRequest(admin, imei, "file_download", { rejected: auth.error, version });
    return jsonResponse({ ok: false, ...auth.error }, 200);
  }

  const model = (auth.device.model as string | null) || "unknown-model";
  const storagePath = `${model}/${version}.bin`;

  const { data: signed, error } = await admin.storage
    .from("device-firmware")
    .createSignedUrl(storagePath, 300);

  await logRequest(admin, imei, "file_download", { version, storage_path: storagePath, found: !error });

  if (error || !signed) {
    return jsonResponse(
      { ok: false, code: 1004, message: `firmware ${version} not available for ${model} yet` },
      200,
    );
  }

  return jsonResponse({ ok: true, url: signed.signedUrl }, 200);
});
