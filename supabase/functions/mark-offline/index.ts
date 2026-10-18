// mark-offline — scheduled housekeeping, not part of Willfine's 7-API sheet.
//
// Flips any device whose last_seen is older than OFFLINE_THRESHOLD_MINUTES
// to status='offline'. Invoked on a schedule by pg_cron (see
// 20261018000002_mark_offline_cron.sql) rather than by a device or the
// dashboard, so this function is deployed with verify_jwt = false
// (supabase/config.toml) — the only thing it can do is flip stale devices
// offline, which is harmless to call repeatedly or even from the public
// internet (idempotent, no data read/write beyond `status`).
import { jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

const OFFLINE_THRESHOLD_MINUTES = 10;

Deno.serve(async () => {
  const admin = supabaseAdmin();
  const cutoff = new Date(Date.now() - OFFLINE_THRESHOLD_MINUTES * 60_000).toISOString();

  const { data, error } = await admin
    .from("devices")
    .update({ status: "offline" })
    .neq("status", "offline")
    .or(`last_seen.lt.${cutoff},last_seen.is.null`)
    .select("imei");

  if (error) {
    console.error("mark-offline update failed:", error);
    return jsonResponse({ ok: false, code: 500, message: "internal error" }, 500);
  }

  return jsonResponse({ ok: true, marked_offline: (data ?? []).map((d) => d.imei) }, 200);
});
