-- Supporting storage for the `params` and `file-download` (firmware OTA)
-- Edge Functions. Kept as a separate migration from
-- 20261018000000_devices.sql so that file stays an exact, untouched copy of
-- the four core tables specified in the task brief.

alter table imei_devices add column if not exists params jsonb not null default '{}'::jsonb;

-- Private bucket for OTA firmware images, served by file-download. Nothing
-- populates this yet — Willfine hasn't supplied real firmware binaries or
-- the file-download request/response shape, so the function currently
-- returns a "not available" response until a file is uploaded here under
-- <model>/<version>(.bin).
insert into storage.buckets (id, name, public)
values ('device-firmware', 'device-firmware', false)
on conflict (id) do nothing;

-- The dashboard device card subscribes to `imei_devices`/`photos`/`commands` via
-- Supabase Realtime (postgres_changes) instead of polling — Realtime only
-- streams changes for tables added to this publication.
alter publication supabase_realtime add table imei_devices;
alter publication supabase_realtime add table photos;
alter publication supabase_realtime add table commands;
