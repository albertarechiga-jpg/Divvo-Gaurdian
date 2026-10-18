// command — command interface.
//
// PLACEHOLDER PATH/PAYLOAD. Swap for Willfine's real shape once Alberto
// supplies the sheet. For now:  POST { imei: string }
//
// Returns the oldest pending `commands` row for the IMEI and marks it
// `sent`. Returns { ok: true, command: null } when the queue is empty so the
// device's poll loop has a well-defined "nothing to do" response.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { logRequest } from "../_shared/logEvent.ts";
import { authenticateDevice, extractDeviceToken } from "../_shared/security.ts";

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
    await logRequest(admin, imei, "command_poll", { found: false });
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
