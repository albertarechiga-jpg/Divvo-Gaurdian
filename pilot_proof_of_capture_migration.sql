-- ============================================================================
-- PILOT-001 / PR 2 — proof-of-capture for the phone camera (DG-1028)
-- ============================================================================
-- Run BY HAND in the Supabase SQL editor. Idempotent (safe to re-run).
-- Lives at the repo root, NOT supabase/migrations/, so `supabase db push`
-- can't apply it before the matching code is reviewed.
--
-- Independent of pilot_security_migration.sql (PR 1): it creates/alters only
-- device_credentials, photos, commands.error and the DG-1028 device row, and
-- works whether or not PR 1's SQL has been applied.
--
-- RUN ORDER
--   1. Run this whole file. The LAST statement prints the DG-1028 device
--      token ONCE (only a SHA-256 hash is stored, so it can't be shown again;
--      rotate instead — snippet near the bottom). Copy it somewhere safe.
--   2. Deploy the Edge Functions this PR changes. Use the full set, because
--      every IMEI-keyed function calls authenticateDevice():
--        supabase functions deploy command file-upload status params device-check other file-download
--      (Deploying them BEFORE step 1 would make them 500: the new code reads
--      device_credentials.)
--   3. Open public/camera.html on the phone, paste the token on the arm screen.
--   4. Optional, once the new functions are live: blank the old plaintext
--      imei_devices.device_token column (readable by every dashboard user and
--      leaked through Realtime):
--        update public.imei_devices set device_token = null where device_token is not null;
--
-- WHAT CHANGES FOR DEVICES
--   * A device that has a row in device_credentials can ONLY authenticate with
--     its token. Knowing its IMEI / device id is no longer enough.
--   * Devices with no credentials row keep the old IMEI-allowlist + rate-limit
--     behaviour (nothing is provisioned for the Willfine T100 Pro here).
-- ============================================================================

-- ── 1. Per-device credentials (service role only) ───────────────────────────
-- Separate table, not a column on imei_devices: imei_devices is readable by
-- dashboard users and published to Supabase Realtime, and Realtime streams
-- whole rows regardless of column grants.
create table if not exists public.device_credentials (
  imei        text primary key references public.imei_devices(imei) on delete cascade,
  token_hash  text not null check (token_hash ~ '^[0-9a-f]{64}$'),  -- sha256 hex of the token
  created_at  timestamptz not null default now(),
  rotated_at  timestamptz
);
alter table public.device_credentials enable row level security;
-- RLS enabled + no policies = deny for anon/authenticated; the explicit revoke
-- makes that independent of Supabase's default table grants too.
revoke all on public.device_credentials from anon, authenticated;
grant all on public.device_credentials to service_role;

-- Carry over any token already provisioned the old way (as a hash).
insert into public.device_credentials (imei, token_hash)
select imei, encode(sha256(convert_to(device_token, 'UTF8')), 'hex')
from public.imei_devices
where device_token is not null and device_token <> ''
on conflict (imei) do nothing;

-- ── 2. Proof-of-capture columns on photos / failure reason on commands ──────
alter table public.photos
  add column if not exists lat            double precision,
  add column if not exists lon            double precision,
  add column if not exists accuracy_m     double precision,
  add column if not exists sha256         text,
  add column if not exists hash_verified  boolean,   -- true: the device's own hash matched the server's
  add column if not exists size_bytes     integer,
  add column if not exists mime_type      text,
  add column if not exists command_id     bigint references public.commands(id) on delete set null;

alter table public.commands add column if not exists error text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'photos_sha256_format') then
    alter table public.photos
      add constraint photos_sha256_format check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'photos_gps_range') then
    alter table public.photos
      add constraint photos_gps_range check (
        (lat is null and lon is null)
        or (lat is not null and lon is not null
            and lat between -90 and 90 and lon between -180 and 180));
  end if;
end $$;

create index if not exists photos_command_id_idx on public.photos (command_id) where command_id is not null;

-- ── 3. Evidence rows are append-only ────────────────────────────────────────
-- The Edge Functions only ever INSERT into photos. This trigger makes the
-- evidence columns immutable and blocks deletes for EVERY role including the
-- service role (RLS can't: the service role bypasses it). It is a speed bump
-- against accidents and a compromised function key, not against someone who
-- owns the database — a superuser can drop the trigger.
--
-- Deliberate cleanup (retention, a wrongly-registered photo) is still
-- possible, but must be an explicit act in the SQL editor:
--     begin;
--     set local app.allow_photo_change = 'on';
--     delete from public.photos where id = ...;
--     commit;
create or replace function public.photos_guard_evidence()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('app.allow_photo_change', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'photos rows are evidence and cannot be deleted (see pilot_proof_of_capture_migration.sql)';
  end if;
  if (new.imei, new.storage_path, new.captured_at, new.source, new.lat, new.lon, new.accuracy_m,
      new.sha256, new.hash_verified, new.size_bytes, new.mime_type, new.created_at)
     is distinct from
     (old.imei, old.storage_path, old.captured_at, old.source, old.lat, old.lon, old.accuracy_m,
      old.sha256, old.hash_verified, old.size_bytes, old.mime_type, old.created_at) then
    raise exception 'photos evidence columns are immutable (see pilot_proof_of_capture_migration.sql)';
  end if;
  return new;
end;
$$;

drop trigger if exists photos_guard_evidence on public.photos;
create trigger photos_guard_evidence
  before update or delete on public.photos
  for each row execute function public.photos_guard_evidence();

-- ── 4. The pilot phone as a device ──────────────────────────────────────────
-- camera.html's device id (PILOT-001, phone DG-1028) is used as the IMEI key.
insert into public.imei_devices (imei, model, firmware)
values ('DG-1028', 'Phone camera (PILOT-001)', 'camera.html')
on conflict (imei) do nothing;

-- ── Verification (run after, expect the commented result) ───────────────────
-- select tablename, policyname from pg_policies where tablename = 'device_credentials';  -- 0 rows
-- select has_table_privilege('anon', 'public.device_credentials', 'select');              -- false
-- select has_table_privilege('authenticated', 'public.device_credentials', 'select');     -- false
-- select imei, created_at from public.device_credentials;                                 -- no token_hash shown to the app

-- ── Rotating a token later (run, copy the new token into the phone) ─────────
-- with t as (select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') as token),
--      u as (update public.device_credentials
--              set token_hash = encode(sha256(convert_to((select token from t), 'UTF8')), 'hex'),
--                  rotated_at = now()
--            where imei = 'DG-1028' returning imei)
-- select u.imei, t.token as paste_this_into_the_phone from u, t;

-- ============================================================================
-- Creates the DG-1028 token and shows it a single time. Returns no rows if
-- DG-1028 already has one (use the rotation snippet above instead).
-- ============================================================================
with t as (
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') as token
),
ins as (
  insert into public.device_credentials (imei, token_hash)
  select 'DG-1028', encode(sha256(convert_to(token, 'UTF8')), 'hex') from t
  on conflict (imei) do nothing
  returning imei
)
select ins.imei, t.token as paste_this_into_the_phone
from ins, t;
