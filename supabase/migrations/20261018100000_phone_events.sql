-- Phone-originated events captured from the dashboard: live-GPS route
-- deviations, phone GPS signal loss, and operator-captured photos from the
-- WebRTC camera feed (CameraView.jsx / UnifiedCommandCenter.jsx).
--
-- Unlike gps_pings/webrtc_signals, there is no device-side writer here — the
-- phone pages (gps.html/camera.html) never touch this table. Detection runs
-- entirely in the authenticated dashboard session, which both writes and
-- reads these rows to drive the Active Alerts panel. Follows the same RLS
-- posture as saved_routes/gps_pings (anon key, no auth required) since this
-- is still the pilot/demo tier, not gated behind the IMEI/service-role model.
create table phone_events (
  id bigint generated always as identity primary key,
  device_id text not null,
  event_type text not null check (event_type in ('photo', 'geofence_exit', 'no_signal')),
  photo_data_url text,
  lat double precision,
  lng double precision,
  note text,
  created_at timestamptz default now()
);

create index phone_events_device_created_idx on phone_events(device_id, created_at desc);

alter table phone_events enable row level security;

create policy phone_events_select_anon on phone_events for select
  to anon, authenticated
  using (true);

create policy phone_events_insert_anon on phone_events for insert
  to anon, authenticated
  with check (true);
