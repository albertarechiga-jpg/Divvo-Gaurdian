// command — command interface.
//
// PLACEHOLDER PATH/PAYLOAD. Swap for Willfine's real shape once Alberto
// supplies the sheet. For now:  POST { imei: string }
//
// Returns the oldest pending `commands` row for the IMEI and marks it
// `sent`. Returns { ok: true, command: null } when the queue is empty so the
// device's poll loop has a well-defined "nothing to do" response.
//
// Also accepts a failure report so a dashboard "Capture" never hangs:
//   POST { imei, report: { command_id, reason } }  -> marks that command `failed`.
//
// `take_photo` commands expire after TAKE_PHOTO_TTL_MS: a phone that comes
// back online hours later must NOT suddenly fire a photo someone queued
// earlier.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { logRequest } from "../_shared/logEvent.ts";
import { authenticateDevice, extractDeviceToken } from "../_shared/security.ts";

const TAKE_PHOTO_TTL_MS = 2 * 60 * 1000;
const HEARTBEAT_MIN_INTERVAL_MS = 30_000;

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
    await logRequest(admin, imei, "command_poll", { rejected: auth.error });
    return jsonResponse({ ok: false, ...auth.error }, 200);
  }

  // Failure report from the device.
  const report = body.report as Record<string, unknown> | undefined;
  if (report && typeof report === "object") {
    const id = Number(report.command_id);
    if (!Number.isInteger(id) || id <= 0) {
      return jsonResponse({ ok: false, code: 400, message: "report.command_id is required" }, 400);
    }
    const reason = typeof report.reason === "string" ? report.reason.slice(0, 200) : "device reported failure";
    await admin
      .from("commands")
      .update({ status: "failed", error: reason, completed_at: new Date().toISOString() })
      .eq("id", id)
      .eq("imei", imei)
      .in("status", ["pending", "sent"]);
    await logRequest(admin, imei, "command_report", { command_id: id, reason });
    return jsonResponse({ ok: true }, 200);
  }

  // Expire stale take_photo commands before handing anything out.
  await admin
    .from("commands")
    .update({ status: "failed", error: "expired", completed_at: new Date().toISOString() })
    .eq("imei", imei)
    .eq("command", "take_photo")
    .in("status", ["pending", "sent"])
    .lt("created_at", new Date(Date.now() - TAKE_PHOTO_TTL_MS).toISOString());

  // A token-authenticated phone polls every few seconds: use the poll itself
  // as the heartbeat (throttled) and don't write an `events` row per empty poll.
  if (auth.via === "token") {
    const lastSeen = auth.device.last_seen ? Date.parse(String(auth.device.last_seen)) : 0;
    if (Date.now() - lastSeen > HEARTBEAT_MIN_INTERVAL_MS || auth.device.status !== "online") {
      await admin.from("imei_devices").update({ last_seen: new Date().toISOString(), status: "online" }).eq("imei", imei);
    }
  }

  const { data: pending, error } = await admin
    .from("commands")
    .select("*")
    .eq("imei", imei)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("command poll query failed:", error);
    return jsonResponse({ ok: false, code: 500, message: "internal error" }, 500);
  }

  if (!pending) {
    if (auth.via !== "token") await logRequest(admin, imei, "command_poll", { found: false });
    return jsonResponse({ ok: true, command: null }, 200);
  }

  const { error: updateError } = await admin
    .from("commands")
    .update({ status: "sent" })
    .eq("id", pending.id)
    .eq("status", "pending"); // guards against a concurrent poller racing the same row
  if (updateError) {
    console.error("command mark-sent failed:", updateError);
    return jsonResponse({ ok: false, code: 500, message: "internal error" }, 500);
  }

  await logRequest(admin, imei, "command_poll", { found: true, command_id: pending.id, command: pending.command });

  return jsonResponse(
    { ok: true, command: { id: pending.id, command: pending.command, args: pending.args } },
    200,
  );
});
