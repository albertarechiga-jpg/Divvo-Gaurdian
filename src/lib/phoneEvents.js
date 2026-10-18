import { SB_URL, sbHeaders } from "./supabase.js";

// Phone-originated events (live GPS route deviations, signal loss, and
// dashboard-captured photos from the WebRTC camera feed) — see
// supabase/migrations/20261018100000_phone_events.sql for the table.

export async function logPhoneEvent({ deviceId, eventType, photoDataUrl, lat, lng, note }) {
  const res = await fetch(SB_URL + "/rest/v1/phone_events", {
    method: "POST",
    headers: sbHeaders({ "Content-Type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify({
      device_id: deviceId,
      event_type: eventType,
      photo_data_url: photoDataUrl ?? null,
      lat: lat ?? null,
      lng: lng ?? null,
      note: note ?? null,
    }),
  });
  if (!res.ok) throw new Error(`Failed to log phone event (HTTP ${res.status})`);
}

// Recent events for a set of device ids, newest first. Scoped to deviceIds
// so one company's command center never surfaces another company's phone
// activity (device ids are prefixed per company, e.g. DG-/MR-/CL-).
export async function fetchRecentPhoneEvents(deviceIds, { limit = 50 } = {}) {
  if (!deviceIds?.length) return [];
  const idsFilter = deviceIds.map((id) => `"${id}"`).join(",");
  const res = await fetch(
    SB_URL + `/rest/v1/phone_events?device_id=in.(${idsFilter})&order=created_at.desc&limit=${limit}`,
    { headers: sbHeaders() }
  );
  if (!res.ok) throw new Error(`Failed to fetch phone events (HTTP ${res.status})`);
  return res.json();
}
