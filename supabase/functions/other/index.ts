// other — catch-all for whatever remains on Willfine's 7-API sheet once
// Alberto supplies it and it doesn't map cleanly onto the six functions
// above. For now, this just logs every request to `events` under type
// "other" so nothing from testing is silently dropped.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { logRequest } from "../_shared/logEvent.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const admin = supabaseAdmin();

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // Non-JSON or empty body is fine here — we log whatever we got.
  }

  const imei = typeof body.imei === "string" ? body.imei : null;
  const url = new URL(req.url);

  await logRequest(admin, imei, "other", {
    method: req.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    body,
  });

  return jsonResponse({ ok: true }, 200);
});
