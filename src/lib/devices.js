import { SB_URL, authHeaders } from "./supabase.js";
import { supabase } from "./supabaseClient.js";

// IMEI-keyed device backend (supabase/migrations/..._devices.sql). Reads go
// through the authenticated-role REST policies on devices/events/photos/
// commands; all writes to devices/events/photos happen only inside the
// Edge Functions (supabase/functions/*) using the service role — the one
// exception is queuing a `take_photo` command, which the "commands" table's
// `commands_insert_take_photo_authenticated` policy allows directly from the
// dashboard (see the migration's comment on that policy).

export async function fetchDevices(accessToken) {
  const res = await fetch(`${SB_URL}/rest/v1/devices?select=*&order=imei.asc`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) throw new Error(`Failed to load devices (${res.status})`);
  return res.json();
}

export async function fetchLatestPhoto(accessToken, imei) {
  const res = await fetch(
    `${SB_URL}/rest/v1/photos?imei=eq.${encodeURIComponent(imei)}&select=*&order=created_at.desc&limit=1`,
    { headers: authHeaders(accessToken) },
  );
  if (!res.ok) throw new Error(`Failed to load latest photo (${res.status})`);
  const rows = await res.json();
  return rows[0] || null;
}

// Signed URL for a private device-photos object — never a public URL, and
// never cached longer than it has to be (expiresIn is in seconds).
export async function signPhotoUrl(accessToken, storagePath, expiresIn = 600) {
  const res = await fetch(`${SB_URL}/storage/v1/object/sign/device-photos/${storagePath}`, {
    method: "POST",
    headers: authHeaders(accessToken, { "Content-Type": "application/json" }),
    body: JSON.stringify({ expiresIn }),
  });
  if (!res.ok) throw new Error(`Failed to sign photo URL (${res.status})`);
  const { signedURL } = await res.json();
  return `${SB_URL}/storage/v1${signedURL}`;
}

export async function queueTakePhotoCommand(accessToken, imei) {
  const res = await fetch(`${SB_URL}/rest/v1/commands`, {
    method: "POST",
    headers: authHeaders(accessToken, { "Content-Type": "application/json", Prefer: "return=representation" }),
    body: JSON.stringify({ imei, command: "take_photo", args: {}, status: "pending" }),
  });
  if (!res.ok) throw new Error(`Failed to queue take_photo command (${res.status})`);
  const rows = await res.json();
  return rows[0];
}

export async function fetchCommand(accessToken, commandId) {
  const res = await fetch(`${SB_URL}/rest/v1/commands?id=eq.${commandId}&select=*`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) throw new Error(`Failed to load command (${res.status})`);
  const rows = await res.json();
  return rows[0] || null;
}

// Supabase Realtime subscription on the `devices` table — the dashboard
// device card uses this instead of polling so status/battery/GPS updates
// (written by the status Edge Function) show up live. Returns an unsubscribe
// function.
export function subscribeToDevices(onChange) {
  const channel = supabase
    .channel("devices-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "devices" }, (payload) => {
      onChange(payload);
    })
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export function subscribeToPhotos(imei, onInsert) {
  const channel = supabase
    .channel(`photos-realtime-${imei}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "photos", filter: `imei=eq.${imei}` },
      (payload) => onInsert(payload),
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export function subscribeToCommand(commandId, onUpdate) {
  const channel = supabase
    .channel(`command-realtime-${commandId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "commands", filter: `id=eq.${commandId}` },
      (payload) => onUpdate(payload),
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}
