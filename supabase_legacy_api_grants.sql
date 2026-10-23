-- MANUAL ONLY: supplemental grants for legacy/ad-hoc objects whose creation
-- SQL is not in this repository. Review the audit and deployed DDL first.
-- This fails closed if a required relation is missing, isn't a base table,
-- lacks RLS, or has no policies. It does NOT synthesize missing schemas or
-- grant access to gps_latest (view definition/security mode is unavailable).
-- Existing pilot GPS/alert policies and credential/evidence protections stay.
begin;
do $$
declare t text;
begin
  foreach t in array array['companies','dashboard_shipments','gps_pings',
    'webrtc_signals','saved_routes','audit_log','alert_settings','insurance_claims']
  loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t and c.relkind = 'r'
        and c.relrowsecurity
    ) or not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = t
    ) then
      raise exception 'Required table public.% is missing or lacks reviewed RLS/policies; restore and review its DDL first', t;
    end if;
  end loop;
end $$;
grant usage on schema public to anon, authenticated, service_role;
-- Current browser/phone request contracts (sbHeaders uses anon).
grant select on public.companies, public.dashboard_shipments to anon;
grant select, insert on public.webrtc_signals to anon;
grant select, insert, delete on public.saved_routes to anon;
grant insert on public.audit_log, public.gps_pings to anon;
-- Pilot-secured tables: never anon SELECT on GPS or alert settings.
grant select on public.gps_pings, public.insurance_claims to authenticated;
grant select, insert, update on public.alert_settings to authenticated;
-- Server authorization checks, company creation, shipment creation, claims.
grant select, insert on public.companies, public.dashboard_shipments,
  public.alert_settings to service_role;
grant select, insert, update on public.insurance_claims to service_role;
-- Legacy ids may be SERIAL. Grant only USAGE on sequences owned by columns
-- of these exact INSERT targets; never blanket sequence privileges/setval.
do $$
declare target record; col record; seq text;
begin
  for target in select * from (values
    ('webrtc_signals','anon'), ('saved_routes','anon'), ('audit_log','anon'),
    ('gps_pings','anon'), ('alert_settings','authenticated'),
    ('companies','service_role'), ('dashboard_shipments','service_role'),
    ('alert_settings','service_role'), ('insurance_claims','service_role')
  ) as targets(tablename, rolename)
  loop
    for col in select a.attname from pg_attribute a
      where a.attrelid = to_regclass(format('public.%I', target.tablename))
        and a.attnum > 0 and not a.attisdropped and a.attidentity = ''
    loop
      seq := pg_get_serial_sequence(format('public.%I', target.tablename), col.attname);
      if seq is not null then
        execute format('grant usage on sequence %s to %I', seq, target.rolename);
      end if;
    end loop;
  end loop;
end $$;
commit;
