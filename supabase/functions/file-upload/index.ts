// file-upload — photo upload.
//
// PLACEHOLDER PATH/PAYLOAD. Swap for Willfine's real multipart/binary shape
// once Alberto supplies the sheet. For now: multipart/form-data with fields
// `imei` (required), `source` ("motion" | "on_demand", default "motion"),
// `captured_at` (ISO timestamp, optional, defaults to now), `command_id`
// (optional — when set, marks that `commands` row `done` once the photo is
// stored, closing the take_photo round trip), and a binary file field
// `photo`.
//
// Behavior: store in `device-photos`, insert a `photos` row, update
// `last_seen` (and `status = 'online'`, since a successful upload proves the
// device is alive right now).
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { logRequest } from "../_shared/logEvent.ts";
import { authenticateDevice, extractDeviceToken } from "../_shared/security.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonResponse({ ok: false, code: 400, message: "expected multipart/form-data" }, 400);
  }

  const imei = form.get("imei");
  const photo = form.get("photo");
  if (typeof imei !== "string" || !imei) {
    return jsonResponse({ ok: false, code: 400, message: "imei is required" }, 400);
  }
  if (!(photo instanceof File)) {
    return jsonResponse({ ok: false, code: 400, message: "photo file is required" }, 400);
  }

  const admin = supabaseAdmin();
  const deviceToken = extractDeviceToken(req, null);
  const auth = await authenticateDevice(admin, imei, deviceToken);
  if (!auth.ok) {
    await logRequest(admin, imei, "file_upload", { rejected: auth.error });
    return jsonResponse({ ok: false, ...auth.error }, 200);
  }

  const source = form.get("source") === "on_demand" ? "on_demand" : "motion";
  const capturedAtRaw = form.get("captured_at");
  const capturedAt = typeof capturedAtRaw === "string" && capturedAtRaw ? capturedAtRaw : new Date().toISOString();
  const commandId = form.get("command_id");

  const ext = (photo.name.split(".").pop() || "jpg").toLowerCase();
  const storagePath = `${imei}/${Date.now()}.${ext}`;

  const bytes = new Uint8Array(await photo.arrayBuffer());
  const { error: uploadError } = await admin.storage
    .from("device-photos")
    .upload(storagePath, bytes, { contentType: photo.type || "image/jpeg", upsert: false });
  if (uploadError) {
    console.error("file-upload storage upload failed:", uploadError);
    return jsonResponse({ ok: false, code: 500, message: "storage upload failed" }, 500);
  }

  const { error: insertError } = await admin.from("photos").insert({
    imei,
    storage_path: storagePath,
    captured_at: capturedAt,
    source,
  });
  if (insertError) {
    console.error("file-upload photos insert failed:", insertError);
    return jsonResponse({ ok: false, code: 500, message: "db insert failed" }, 500);
  }

  await admin.from("devices").update({ last_seen: new Date().toISOString(), status: "online" }).eq("imei", imei);

  if (typeof commandId === "string" && commandId) {
    await admin
      .from("commands")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .eq("id", Number(commandId))
      .eq("imei", imei);
  }

  await logRequest(admin, imei, "photo", { storage_path: storagePath, source });

  return jsonResponse({ ok: true, storage_path: storagePath }, 200);
});
