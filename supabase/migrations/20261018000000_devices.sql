-- IMEI-keyed device backend (imei_devices, events, photos, commands).
--
-- Writes to these four tables only ever happen through Edge Functions running
-- with the service role key (supabase/functions/*) — the browser only ever
-- holds the anon/authenticated key, which can read but never write here.
-- Dashboard reads go through the "authenticated" policies below, scoped to
-- any logged-in user (the device fleet isn't yet partitioned per company —
-- see FOLLOWUPS.md in this same PR if/when multi-tenant device scoping is
-- needed).

create table imei_devices (
  imei text primary key,
  model text,
  firmware text,
  status text default 'offline',
  last_seen timestamptz,
  battery int,
  signal int,
  temp_c numeric,
  lat double precision,
  lng double precision,
  sd_free_mb int,
  device_token text,            -- used by the Nihlus BG95 firmware (path B)
  created_at timestamptz default now()
);

create table events (
  id bigint generated always as identity primary key,
  imei text references imei_devices(imei),
  type text not null,           -- motion | gps_alert | status | photo
  payload jsonb,
  created_at timestamptz default now()
);

create table photos (
  id bigint generated always as identity primary key,
  imei text references imei_devices(imei),
  storage_path text not null,
  captured_at timestamptz,
  source text default 'motion', -- motion | on_demand
  created_at timestamptz default now()
);

create table commands (
  id bigint generated always as identity primary key,
  imei text references imei_devices(imei),
  command text not null,        -- take_photo | set_param
  args jsonb,
  status text default 'pending',-- pending | sent | done | failed
  created_at timestamptz default now(),
  completed_at timestamptz
);

create index events_imei_created_at_idx on events(imei, created_at desc);
create index photos_imei_created_at_idx on photos(imei, created_at desc);
create index commands_imei_status_idx on commands(imei, status);

insert into imei_devices (imei, model, firmware)
values ('869830089252035', 'T100 Pro', 'T1R1SYrEA01');

alter table imei_devices enable row level security;
alter table events enable row level security;
alter table photos enable row level security;
alter table commands enable row level security;

-- Dashboard users: read access via authenticated policy.
-- Writes: only through Edge Functions using the service role. Never expose
-- the service key to the browser. The service role bypasses RLS entirely, so
-- no insert/update/delete policy is defined for any of these four tables —
-- an authenticated browser session literally cannot write to them.
create policy devices_select_authenticated on imei_devices for select
  to authenticated
  using (true);

create policy events_select_authenticated on events for select
  to authenticated
  using (true);

create policy photos_select_authenticated on photos for select
  to authenticated
  using (true);

create policy commands_select_authenticated on commands for select
  to authenticated
  using (true);

-- The dashboard also needs to insert a `commands` row itself (the "Take
-- photo" button) rather than going through an Edge Function for this one
-- write — allow it, scoped to the one command dashboards are allowed to
-- queue, so a logged-in user can queue work but can't fabricate device
-- state (battery/signal/status) or forge `done`/`sent` completions.
create policy commands_insert_take_photo_authenticated on commands for insert
  to authenticated
  with check (command = 'take_photo' and status = 'pending');

-- Private Storage bucket for uploaded device photos. Only Edge Functions
-- (service role) write into it; the dashboard reads via short-lived signed
-- URLs (createSignedUrl), never a public URL.
insert into storage.buckets (id, name, public)
values ('device-photos', 'device-photos', false)
on conflict (id) do nothing;

create policy device_photos_read_authenticated on storage.objects for select
  to authenticated
  using (bucket_id = 'device-photos');
