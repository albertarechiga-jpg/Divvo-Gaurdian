-- Manual supplement for an ALREADY CREATED Mission Engine schema.
-- Review/apply separately; deliberately outside supabase/migrations because
-- that runner does not create the Mission Engine or the legacy pilot schema.
-- For a fresh schema, the same grants are at the end of migration 001.
-- Requires all 22 Mission Engine tables and their original RLS policies.
-- Tightens the existing verification SELECT policy before granting access.
-- No auth.* permissions, default privileges or pilot ACLs change.
begin;
-- The original analyst policy lacked a tenant condition. New table grants
-- must not enable cross-tenant verification disclosure. Preserve own-driver
-- access and require staff to belong to the carrier's organization.
alter policy driver_verifications_select on public.driver_verifications
  using (
    (public.is_analyst_or_above() and driver_id in (
      select d.id from public.drivers d
      join public.carriers c on c.id = d.carrier_id
      where c.organization_id = public.current_org_id()
    ))
    or driver_id = public.current_driver_id()
  );
grant usage on schema public to authenticated, service_role;

-- fetchCurrentUser/loadTeam embed organizations + user_roles; BOL detail
-- embeds verification/signature/mission/carrier/driver rows. RLS subqueries
-- also need SELECT on the referenced relations under the caller's role.
grant select on public.organizations, public.users, public.user_roles,
  public.carriers, public.drivers, public.shipments, public.missions,
  public.digital_bols, public.bol_signatures, public.driver_verifications,
  public.receiver_verifications, public.chain_of_custody_events,
  public.lock_events, public.evidence_files to authenticated;
-- Settings approves/rejects users; RLS still requires an org admin.
grant update (status) on public.users to authenticated;
grant delete on public.users to authenticated;
-- Manual custody entries use return=representation and dispatcher RLS.
grant insert on public.chain_of_custody_events to authenticated;

-- Vercel authorization checks and PostgREST nested reads.
grant select on public.organizations, public.users, public.user_roles,
  public.carriers, public.drivers, public.guardians, public.shipments,
  public.missions, public.digital_bols, public.bol_signatures,
  public.driver_verifications, public.receiver_verifications,
  public.chain_of_custody_events, public.lock_events, public.evidence_files,
  public.camera_events to service_role;
grant insert on public.users, public.user_roles, public.carriers,
  public.drivers, public.guardians, public.shipments, public.missions,
  public.digital_bols, public.driver_verifications, public.receiver_verifications,
  public.bol_signatures, public.chain_of_custody_events, public.lock_events,
  public.camera_events, public.evidence_files to service_role;
grant update on public.shipments, public.missions, public.digital_bols,
  public.driver_verifications to service_role;
-- UUID defaults use core gen_random_uuid(); no sequence grants required.
commit;
