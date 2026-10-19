// file-upload — photo upload (proof-of-capture).
//
// PLACEHOLDER PATH/PAYLOAD for the Willfine hardware (swap once Alberto
// supplies the sheet); the phone pages (public/camera.html) already use it as
// written here. multipart/form-data with fields:
//   imei         (required) device id — "DG-1028" for the pilot phone
//   photo        (required) binary file
//   source       "motion" | "on_demand" (default "motion")
//   captured_at  ISO timestamp, the device's claim of when it shot the photo
//   command_id   the take_photo `commands` row this answers (closes the loop)
//   lat, lon, accuracy_m   GPS fix taken at capture time (both lat+lon or none)
//   sha256       hex SHA-256 the device computed over the file bytes
//
// Auth: devices with a row in `device_credentials` MUST send their token
// (x-device-token header); see _shared/security.ts. Token-authenticated
// uploads are validated strictly (JPEG magic bytes, metadata ranges).
//
// Proof-of-capture: the server recomputes SHA-256 over the bytes it actually
// received. If the device sent a hash and it disagrees, the upload is rejected
// (corrupted/tampered in transit). The server-computed hash is what is stored;
// `hash_verified` records whether the device's own hash matched it. The
// receive time (`created_at`) is server-assigned and authoritative.
//
// Behavior: store in `device-photos`, insert a `photos` row, update
// `last_seen` (and `status = 'online'`, since a successful upload proves the
// device is alive right now).
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { logRequest } from "../_shared/logEvent.ts";
import { authenticateDevice, extractDeviceToken } from "../_shared/security.ts";
import { isValidDeviceId, looksLikeJpeg, MAX_PHOTO_BYTES, parseCaptureMeta, sha256Hex } from "../_shared/capture.ts";

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
  if (photo.size > MAX_PHOTO_BYTES) {
    return jsonResponse({ ok: false, code: 413, message: "photo too large" }, 413);
  }

  const admin = supabaseAdmin();
  const deviceToken = extractDeviceToken(req, null);
  const auth = await authenticateDevice(admin, imei, deviceToken);
  if (!auth.ok) {
    await logRequest(admin, imei, "file_upload", { rejected: auth.error });
    return jsonResponse({ ok: false, ...auth.error }, 200);
  }
  const strict = auth.via === "token";
  if (strict && !isValidDeviceId(imei)) {
    return jsonResponse({ ok: false, code: 400, message: "malformed device id" }, 400);
  }

  const parsed = parseCaptureMeta(form, Date.now(), strict);
  if (!parsed.ok) {
    await logRequest(admin, imei, "file_upload", { rejected: { code: 400, message: parsed.message } });
    return jsonResponse({ ok: false, code: 400, message: parsed.message }, 400);
  }
  const meta = parsed.meta;

  const bytes = new Uint8Array(await photo.arrayBuffer());
  if (bytes.length === 0) {
    return jsonResponse({ ok: false, code: 400, message: "photo is empty" }, 400);
  }
  if (strict && !looksLikeJpeg(bytes)) {
    return jsonResponse({ ok: false, code: 415, message: "photo must be a JPEG" }, 415);
  }

  const sha256 = await sha256Hex(bytes);
  if (meta.clientSha256 && meta.clientSha256 !== sha256) {
    await logRequest(admin, imei, "file_upload", {
      rejected: { code: 422, message: "sha256 mismatch" },
      client_sha256: meta.clientSha256,
      server_sha256: sha256,
    });
    return jsonResponse({ ok: false, code: 422, message: "sha256 does not match the uploaded bytes" }, 422);
  }
  const hashVerified = meta.clientSha256 !== null;

  // Only honour command_id if it is a still-open take_photo command for THIS
  // device — otherwise a device could close someone else's command.
  let commandId: number | null = null;
  if (meta.commandId !== null) {
    const { data: cmd, error: cmdError } = await admin
      .from("commands")
      .select("id,status")
      .eq("id", meta.commandId)
      .eq("imei", imei)
      .eq("command", "take_photo")
      .maybeSingle();
    if (cmdError) {
      console.error("file-upload command lookup failed:", cmdError);
      return jsonResponse({ ok: false, code: 500, message: "internal error" }, 500);
    }
    if (cmd) {
      commandId = cmd.id;
      // Idempotent retry: the phone re-sends after a timeout that actually
      // succeeded -> return the photo we already stored for this command.
      const { data: existing } = await admin
        .from("photos")
        .select("id,storage_path,sha256")
        .eq("imei", imei)
        .eq("command_id", commandId)
        .eq("sha256", sha256)
        .maybeSingle();
      if (existing) {
        return jsonResponse(
          { ok: true, photo_id: existing.id, storage_path: existing.storage_path, sha256, hash_verified: hashVerified, duplicate: true },
          200,
        );
      }
    }
  }

  const storagePath = `${imei}/${new Date().toISOString().replace(/[:.]/g, "-")}-${sha256.slice(0, 12)}.jpg`;
  const { error: uploadError } = await admin.storage
    .from("device-photos")
    .upload(storagePath, bytes, { contentType: strict ? "image/jpeg" : photo.type || "image/jpeg", upsert: false });
  if (uploadError) {
    console.error("file-upload storage upload failed:", uploadError);
    return jsonResponse({ ok: false, code: 500, message: "storage upload failed" }, 500);
  }

  const { data: inserted, error: insertError } = await admin
    .from("photos")
    .insert({
      imei,
      storage_path: storagePath,
      captured_at: meta.capturedAt,
      source: meta.source,
      lat: meta.lat,
      lon: meta.lon,
      accuracy_m: meta.accuracyM,
      sha256,
      hash_verified: hashVerified,
      size_bytes: bytes.length,
      mime_type: strict ? "image/jpeg" : photo.type || "image/jpeg",
      command_id: commandId,
    })
    .select("id")
    .single();
  if (insertError) {
    console.error("file-upload photos insert failed:", insertError);
    // Don't leave an orphan object that no photos row points to.
    await admin.storage.from("device-photos").remove([storagePath]);
    return jsonResponse({ ok: false, code: 500, message: "db insert failed" }, 500);
  }

  await admin.from("imei_devices").update({ last_seen: new Date().toISOString(), status: "online" }).eq("imei", imei);

  if (commandId !== null) {
    await admin
      .from("commands")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .eq("id", commandId)
      .eq("imei", imei)
      .in("status", ["pending", "sent"]);
  }

  await logRequest(admin, imei, "photo", {
    storage_path: storagePath,
    source: meta.source,
    sha256,
    hash_verified: hashVerified,
    command_id: commandId,
    has_gps: meta.lat !== null,
  });

  return jsonResponse(
    { ok: true, photo_id: inserted.id, storage_path: storagePath, sha256, hash_verified: hashVerified },
    200,
  );
});
