-- Explicit Data API opt-in for the tables created by the numbered migrations.
-- Applies to fresh resets/branches AND existing databases. Additive and
-- idempotent: no policies, pilot restrictions or existing grants are replaced.
-- No ALL TABLES / ALTER DEFAULT PRIVILEGES: future tables require review.
begin;

grant usage on schema public to anon, authenticated, service_role;

-- Dashboard reads and the one RLS-constrained pending take_photo INSERT.
grant select on public.imei_devices, public.events, public.photos, public.commands
  to authenticated;
grant insert on public.commands to authenticated;

-- Edge Functions use PostgREST too. BYPASSRLS does not bypass table ACLs.
grant select, update on public.imei_devices to service_role;
grant select, insert on public.events, public.photos to service_role;
grant select, update on public.commands to service_role;

-- phoneEvents.js uses sbHeaders() (anon), even inside the signed-in UI.
-- Preserve the existing phone_events RLS contract for both listed roles.
grant select, insert on public.phone_events to anon, authenticated;

-- All generated ids here are GENERATED ALWAYS AS IDENTITY, not serial:
-- inserts use the identity generator without direct sequence privileges.
-- No sequence SELECT/UPDATE (setval) or blanket sequence grants are needed.
commit;
