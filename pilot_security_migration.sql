-- ============================================================================
-- pilot_security_migration.sql — lock down pilot data (PILOT-001)
-- ============================================================================
--
-- WHY
--   gps_pings (5k+ rows of real phone locations) is readable by anyone who has
--   the public anon key, which is embedded in public/gps.html and camera.html.
--   The device tables added in 20261018000000_devices.sql (imei_devices,
--   events, photos, commands) and the private `device-photos` bucket are
--   readable by ANY Supabase Auth user — and if "Allow new users to sign up" is
--   on in the Supabase project, anyone can mint such a user with just the anon
--   key. This migration moves every read behind "is a real, non-suspended
--   dashboard user" (a row in public.users).
--
-- !! RUN ORDER — READ THIS !!
--   1. Merge + deploy the dashboard change from the same PR FIRST. It makes the
--      live map read gps_pings with the signed-in user's token. Until that is
--      deployed, the dashboard still reads gps_pings with the anon key, and
--      running this file would blank the live map ("GPS feed unavailable").
--   2. Then run this whole file once in the Supabase SQL editor (the repo has
--      no migration runner — same as supabase_migration_001_mission_engine.sql).
--      It is idempotent: safe to re-run.
--   3. Run the verification queries at the bottom, then follow the checklist.
--
--   This file deliberately lives at the repo root, NOT in supabase/migrations/,
--   so `supabase db push` can never apply it before step 1.
--
-- WHAT IT DOES NOT CHANGE
--   * Phones keep working: public/gps.html and field-test.html still INSERT
--     pings with the anon key. Only SELECT/UPDATE/DELETE are removed from anon.
--   * webrtc_signals, alert_settings, companies, saved_routes, audit_log are
--     untouched (see "Known gaps" in the PR description).
-- ============================================================================


-- ── 0. Helper: "is this caller a real dashboard user?" ──────────────────────
-- Same pattern as current_org_id()/has_role() in the mission-engine migration:
-- SECURITY DEFINER so it can read public.users regardless of that table's own
-- RLS, search_path pinned. Suspended users lose access; 'invited' users keep
-- it (an invite can still be mid-acceptance when they first sign in).
create or replace function public.is_app_user()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.status <> 'suspended'
  );
$$;

revoke all on function public.is_app_user() from public, anon;
grant execute on function public.is_app_user() to authenticated;


-- ── 1. gps_pings ────────────────────────────────────────────────────────────
alter table public.gps_pings enable row level security;

-- Start from a known state: drop whatever policies exist today (we don't know
-- their names — this is a v1 table created ad hoc), then define exactly two.
do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'gps_pings'
  loop
    execute format('drop policy %I on public.gps_pings', p.policyname);
  end loop;
end $$;

-- Dashboard read: signed-in dashboard users only.
create policy gps_pings_select_app_users on public.gps_pings
  for select to authenticated
  using (public.is_app_user());

-- Phone write: the phone pages authenticate with the anon key only, so anon
-- must keep INSERT. The check rejects obviously malformed rows; it does NOT
-- authenticate the device (see "Known gaps": per-device tokens are the fix).
create policy gps_pings_insert_phones on public.gps_pings
  for insert to anon
  with check (
    device_id is not null
    and device_id ~ '^[A-Za-z0-9_-]{2,32}$'
    and lat between -90 and 90
    and lon between -180 and 180
  );

-- Table privileges as defence in depth (RLS alone already denies; this makes
-- a future "disable RLS" mistake less catastrophic).
revoke all on public.gps_pings from anon, authenticated;
grant insert on public.gps_pings to anon;
grant select on public.gps_pings to authenticated;

-- If `id` is serial/identity-backed, anon needs USAGE on the sequence to
-- INSERT. pg_get_serial_sequence() covers both serial and identity columns.
do $$
declare s text; col record;
begin
  for col in select a.attname from pg_attribute a
             where a.attrelid = 'public.gps_pings'::regclass
               and a.attnum > 0 and not a.attisdropped
  loop
    s := pg_get_serial_sequence('public.gps_pings', col.attname);
    if s is not null then
      execute format('grant usage on sequence %s to anon', s);
    end if;
  end loop;
end $$;

-- The dashboard polls "newest 50 by created_at" every 5s; keep it index-backed
-- as the table grows.
create index if not exists gps_pings_created_at_idx
  on public.gps_pings (created_at desc);
create index if not exists gps_pings_device_created_at_idx
  on public.gps_pings (device_id, created_at desc);


-- ── 2. imei_devices / events / photos / commands ────────────────────────────
-- Replace the "any authenticated user" reads from 20261018000000_devices.sql
-- with "dashboard users only". Writes stay Edge-Function-only (service role),
-- except the one narrow dashboard INSERT: queueing a pending take_photo.
drop policy if exists devices_select_authenticated on public.imei_devices;
drop policy if exists events_select_authenticated  on public.events;
drop policy if exists photos_select_authenticated  on public.photos;
drop policy if exists commands_select_authenticated on public.commands;
drop policy if exists commands_insert_take_photo_authenticated on public.commands;

drop policy if exists devices_select_app_users  on public.imei_devices;
drop policy if exists events_select_app_users   on public.events;
drop policy if exists photos_select_app_users   on public.photos;
drop policy if exists commands_select_app_users on public.commands;
drop policy if exists commands_insert_take_photo_app_users on public.commands;

create policy devices_select_app_users  on public.imei_devices for select to authenticated using (public.is_app_user());
create policy events_select_app_users   on public.events      for select to authenticated using (public.is_app_user());
create policy photos_select_app_users   on public.photos      for select to authenticated using (public.is_app_user());
create policy commands_select_app_users on public.commands    for select to authenticated using (public.is_app_user());

create policy commands_insert_take_photo_app_users on public.commands
  for insert to authenticated
  with check (public.is_app_user() and command = 'take_photo' and status = 'pending');

-- Defence in depth on table privileges. service_role is unaffected.
revoke all on public.imei_devices, public.events, public.photos, public.commands from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.imei_devices, public.events, public.photos from authenticated;
revoke update, delete, truncate, references, trigger
  on public.commands from authenticated;
grant select on public.imei_devices, public.events, public.photos, public.commands to authenticated;
grant insert on public.commands to authenticated;


-- ── 3. device-photos Storage bucket ─────────────────────────────────────────
-- Photos are read through short-lived signed URLs minted with the dashboard
-- user's token; that call needs SELECT on storage.objects. Require a real
-- dashboard user instead of any authenticated session.
update storage.buckets set public = false where id = 'device-photos';

drop policy if exists device_photos_read_authenticated on storage.objects;
drop policy if exists device_photos_read_app_users     on storage.objects;

create policy device_photos_read_app_users on storage.objects
  for select to authenticated
  using (bucket_id = 'device-photos' and public.is_app_user());


-- ============================================================================
-- VERIFICATION — run these after the migration (SQL editor, as postgres)
-- ============================================================================
--
-- a) Exactly the policies we expect, nothing broader:
--
--   select tablename, policyname, roles, cmd, qual, with_check
--   from pg_policies
--   where (schemaname = 'public' and tablename in
--            ('gps_pings','imei_devices','events','photos','commands'))
--      or (schemaname = 'storage' and tablename = 'objects'
--          and (qual ilike '%device-photos%' or with_check ilike '%device-photos%'))
--   order by tablename, policyname;
--
--   Expect: no policy granting anon SELECT anywhere; no `using (true)`.
--   If a *different* storage.objects policy already exposes device-photos
--   (e.g. one created by hand in the dashboard), drop it — Postgres ORs policies.
--
-- b) The public key can no longer read pings (replace <ANON_KEY>/<REF>):
--
--   curl -s "https://<REF>.supabase.co/rest/v1/gps_pings?select=*&limit=1" \
--     -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>"
--   -> expect [] (RLS filters) or a permission-denied error, NOT row data.
--
-- c) The phone can still write (use a throwaway device_id, then delete the row):
--
--   curl -s -X POST "https://<REF>.supabase.co/rest/v1/gps_pings" \
--     -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>" \
--     -H "Content-Type: application/json" -H "Prefer: return=minimal" \
--     -d '{"lat":29.4,"lon":-98.5,"device_id":"ZZ-TEST","device_name":"ZZ-TEST"}' -i
--   -> expect HTTP 201.   Cleanup: delete from gps_pings where device_id='ZZ-TEST';
--
-- d) Dashboard: sign in, open the Command Center -> the live GPS badge should
--    show phone pings (not "GPS feed unavailable").
--
-- ============================================================================
-- MANUAL, NOT SQL: Supabase Dashboard -> Authentication -> Sign In / Providers
--   -> turn OFF "Allow new users to sign up". Invites (Settings > Team ->
--   api/create-user.js) use the Admin API and keep working.
-- ============================================================================
--
-- ROLLBACK (only if the live map breaks and you need to restore old behaviour
-- while debugging — this REOPENS public read access, do not leave it that way):
--
--   create policy gps_pings_select_rollback on public.gps_pings
--     for select to anon, authenticated using (true);
--   grant select on public.gps_pings to anon;
-- ============================================================================
