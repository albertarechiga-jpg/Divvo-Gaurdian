import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

// Log every request to `events` during testing (per the task spec). Never
// throws into the caller's response path — a logging failure should not turn
// a successful device call into a 500.
export async function logRequest(
  admin: SupabaseClient,
  imei: string | null,
  type: string,
  payload: Record<string, unknown>,
) {
  try {
    await admin.from("events").insert({ imei, type, payload });
  } catch (err) {
    console.error(`logRequest failed (imei=${imei}, type=${type}):`, err);
  }
}
