-- ============================================================================
-- pilot_alert_settings_lockdown.sql — lock down alert_settings (PILOT-001)
-- ============================================================================
--
-- WHY
--   alert_settings holds phone numbers, emails and law-enforcement contacts,
--   and it is readable AND writable by anyone holding the public anon key
--   (embedded in public/gps.html and camera.html). Anyone could read the
--   contacts, or overwrite them to redirect every SMS/email alert.
--
-- AFTER THIS FILE
--   * anon: no access at all (no select / insert / update / delete).
--   * authenticated: may SELECT only the alert_settings row of a company that
--     belongs to their own organization. Freightlock platform-org staff
--     (organizations.is_platform_org) may access every company's row, because
--     the dashboard lets them switch companies.
--   * INSERT / UPDATE additionally require the admin or dispatcher role.
--     viewers and analysts can still READ (dispatchAlert needs the row for
--     every user) but can no longer change where alerts go.
--   * Nobody can DELETE through the API. service_role (api/add-company.js)
--     bypasses RLS and is unaffected.
--
-- !! RUN ORDER — READ THIS !!
--   1. Merge + deploy the dashboard change from the same PR FIRST. It makes
--      Settings and dispatchAlert() read/write alert_settings with the signed-in
--      user's token. Until it is deployed the live dashboard still uses the
--      anon key, and running this file would make Settings show "no settings"
--      and silently stop SMS/email alerts (dispatchAlert returns early when it
--      cannot read the row).
--   2. Then run this whole file once in the Supabase SQL editor. It is
--      idempotent: safe to re-run.
--   3. Run the verification queries at the bottom.
--
--   Lives at the repo root, NOT in supabase/migrations/, so `supabase db push`
--   can never apply it before step 1.
--
-- DOES NOT CHANGE
--   companies, saved_routes, webrtc_signals, audit_log (still open to the anon
--   key — separate follow-ups), and api/send-sms.js / api/send-email.js (still
--   unauthenticated — see the PR description).
-- ============================================================================


-- ── 0. Preconditions: fail loudly instead of half-applying ──────────────────
-- The tenant link (companies.organization_id) and the platform flag
-- (organizations.is_platform_org) were added by the signup migration, which is
-- not in this repo. Both are used by the app today (lib/auth.js, Login.jsx).
do $$
begin
  if to_regclass('public.alert_settings') is null then
    raise exception 'public.alert_settings does not exist';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='companies'
                   and column_name='organization_id') then
    raise exception 'companies.organization_id is missing — run the signup migration first';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='organizations'
                   and column_name='is_platform_org') then
    raise exception 'organizations.is_platform_org is missing — run the signup migration first';
  end if;
  if to_regprocedure('public.is_dispatcher_or_above()') is null then
    raise exception 'is_dispatcher_or_above() is missing — run supabase_migration_001_mission_engine.sql first';
  end if;
end $$;


-- ── 1. Helper: "may the caller touch this company's alert settings?" ────────
-- SECURITY DEFINER so it can read users/companies/organizations regardless of
-- those tables' own RLS (companies is not RLS-protected today, but will be),
-- search_path pinned. Suspended users get nothing; 'invited' users keep
-- access, same convention as the other helpers.
create or replace function public.can_access_company_alerts(p_company_id text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    join public.organizations uo on uo.id = u.organization_id
    join public.companies c      on c.id::text = p_company_id
    where u.id = auth.uid()
      and u.status <> 'suspended'
      and (c.organization_id = u.organization_id or uo.is_platform_org)
  );
$$;

revoke all on function public.can_access_company_alerts(text) from public, anon;
grant execute on function public.can_access_company_alerts(text) to authenticated;


-- ── 2. alert_settings ───────────────────────────────────────────────────────
alter table public.alert_settings enable row level security;

-- Start from a known state: drop whatever policies exist (v1 table created ad
-- hoc, names unknown), then define exactly three.
do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'alert_settings'
  loop
    execute format('drop policy %I on public.alert_settings', p.policyname);
  end loop;
end $$;

create policy alert_settings_select_own_company on public.alert_settings
  for select to authenticated
  using (public.can_access_company_alerts(company_id::text));

create policy alert_settings_insert_own_company on public.alert_settings
  for insert to authenticated
  with check (public.can_access_company_alerts(company_id::text)
              and public.is_dispatcher_or_above());

-- WITH CHECK also stops an UPDATE from re-pointing a row at another company.
create policy alert_settings_update_own_company on public.alert_settings
  for update to authenticated
  using (public.can_access_company_alerts(company_id::text)
         and public.is_dispatcher_or_above())
  with check (public.can_access_company_alerts(company_id::text)
              and public.is_dispatcher_or_above());

-- No DELETE policy: nothing in the app deletes a settings row.

-- Table privileges as defence in depth (RLS alone already denies; this makes a
-- future "disable RLS" mistake less catastrophic). service_role is unaffected.
revoke all on public.alert_settings from anon, authenticated;
grant select, insert, update on public.alert_settings to authenticated;

-- If `id` is serial/identity-backed, authenticated needs USAGE on the sequence
-- to INSERT (Settings.jsx createSettings). pg_get_serial_sequence() covers both
-- serial and identity columns.
do $$
declare s text; col record;
begin
  for col in select a.attname from pg_attribute a
             where a.attrelid = 'public.alert_settings'::regclass
               and a.attnum > 0 and not a.attisdropped
  loop
    s := pg_get_serial_sequence('public.alert_settings', col.attname);
    if s is not null then
      execute format('grant usage on sequence %s to authenticated', s);
    end if;
  end loop;
end $$;


-- ============================================================================
-- VERIFICATION — run these after the migration
-- ============================================================================
--
-- a) Exactly three policies, none for anon, no `using (true)`:
--
--   select policyname, roles, cmd, qual, with_check
--   from pg_policies
--   where schemaname = 'public' and tablename = 'alert_settings'
--   order by cmd;
--
-- b) The public key can no longer read contacts (replace <ANON_KEY>/<REF>):
--
--   curl -s "https://<REF>.supabase.co/rest/v1/alert_settings?select=*&limit=1" \
--     -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>"
--   -> expect a permission-denied error, NOT row data.
--
-- c) ...and can no longer write:
--
--   curl -s -X PATCH "https://<REF>.supabase.co/rest/v1/alert_settings?id=eq.0" \
--     -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>" \
--     -H "Content-Type: application/json" -d '{"phones":[]}' -i
--   -> expect HTTP 401/403 (permission denied), NOT 200/204.
--
-- d) Dashboard, signed in as an admin/dispatcher: Settings loads the row and
--    "Save" shows the success toast; reload and the change persists.
--
-- e) Dashboard, signed in as a viewer: Settings loads, but "Save" shows an
--    error toast (read-only), and the row is unchanged.
--
-- f) Alerts still fan out: trigger a test alert from Settings ("Send test") or
--    the Command Center; SMS/email should still arrive.
--
-- ============================================================================
-- ROLLBACK (only if Settings/alerts break and you must restore the old
-- behaviour while debugging — this REOPENS public read AND write access to the
-- contact table, do not leave it that way):
--
--   create policy alert_settings_rollback on public.alert_settings
--     for all to anon, authenticated using (true) with check (true);
--   grant select, insert, update on public.alert_settings to anon;
-- ============================================================================
