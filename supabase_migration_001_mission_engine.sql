-- ============================================================================
-- Divvo Guardian — Architecture v2.0
-- Migration 001: Mission Engine foundation
--
-- Introduces Mission as the platform's core entity: one physical,
-- Guardian-monitored execution of a shipment (driver + tractor + trailer +
-- guardian device, pickup to delivery). See DIVVO_ARCHITECTURE_V2.md for the
-- full rationale, ERD, and role-permission matrix this migration implements.
--
-- Security note: no table in this migration stores raw biometric data.
-- driver_verifications / receiver_verifications store only provider names,
-- opaque provider_reference_id values, pass/fail results, confidence scores,
-- consent records, and timestamps. bol_signatures stores a signature_hash,
-- never the raw signature image.
--
-- Safe to run against a fresh Supabase project, or alongside the v1 pilot
-- tables (companies, alert_settings, saved_routes, gps_pings, webrtc_signals,
-- audit_log) — no naming collisions, no FKs into v1 tables.
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- 1. TENANCY & IDENTITY
-- ============================================================================

create table organizations (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  slug            text not null unique,
  region          text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- `id` intentionally matches auth.users.id (Supabase Auth) — this table is the
-- app-level profile row for an authenticated internal user (admin/dispatcher/
-- analyst/viewer). Drivers are a separate table (see §2) and only get a row
-- here if they also need dashboard/portal login, via drivers.user_id.
create table users (
  id              uuid primary key,
  organization_id uuid not null references organizations(id) on delete restrict,
  email           text not null unique,
  full_name       text,
  phone           text,
  status          text not null default 'active'
                    check (status in ('active', 'suspended', 'invited')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_users_organization_id on users(organization_id);

-- Normalized role grants. A user can hold more than one role; role checks use
-- has_role()/is_admin() etc. (defined in §6) rather than reading users
-- directly, so a user is never limited to exactly one role.
create table user_roles (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  role            text not null
                    check (role in ('admin', 'dispatcher', 'analyst', 'viewer')),
  granted_by      uuid references users(id),
  granted_at      timestamptz not null default now(),
  unique (user_id, role)
);
create index idx_user_roles_user_id on user_roles(user_id);
create index idx_user_roles_organization_id on user_roles(organization_id);

-- ============================================================================
-- 2. CARRIERS, DRIVERS, FLEET
-- ============================================================================

create table carriers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  mc_number       text,
  dot_number      text,
  dot_verified    boolean not null default false,
  dot_verified_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_carriers_organization_id on carriers(organization_id);

-- user_id is nullable: most drivers won't have dashboard login, only a
-- driver-app/portal identity created when they're first invited to verify.
create table drivers (
  id                   uuid primary key default gen_random_uuid(),
  carrier_id           uuid not null references carriers(id) on delete restrict,
  user_id              uuid references users(id) on delete set null,
  full_name            text not null,
  phone                text,
  email                text,
  license_number_hash  text,           -- hashed, never raw
  license_state        text,
  status               text not null default 'pending_verification'
                         check (status in ('active', 'suspended', 'pending_verification')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index idx_drivers_carrier_id on drivers(carrier_id);
create index idx_drivers_user_id on drivers(user_id);

-- Added beyond the requested table list — see DIVVO_ARCHITECTURE_V2.md §3.
-- Identity-proofing EVENTS for a driver (plural over time), never raw
-- biometric artifacts.
create table driver_verifications (
  id                     uuid primary key default gen_random_uuid(),
  driver_id              uuid not null references drivers(id) on delete cascade,
  verification_type      text not null
                           check (verification_type in
                             ('government_id', 'biometric_face', 'biometric_fingerprint', 'dot_mc_lookup')),
  provider               text,          -- e.g. "persona", "onfido", "stripe_identity", "fmcsa_safer"
  provider_reference_id  text,          -- opaque external session/result id — NOT the raw scan
  result                 text not null default 'pending'
                           check (result in ('passed', 'failed', 'pending', 'expired')),
  confidence_score       numeric,
  consent_given          boolean not null default false,
  consent_recorded_at    timestamptz,
  verified_at            timestamptz,
  expires_at             timestamptz,
  created_at             timestamptz not null default now()
);
create index idx_driver_verifications_driver_id on driver_verifications(driver_id);
create index idx_driver_verifications_driver_verified on driver_verifications(driver_id, verified_at desc);

create table tractors (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  carrier_id      uuid not null references carriers(id) on delete restrict,
  tractor_number  text not null,
  vin             text,
  license_plate   text,
  make            text,
  model           text,
  year            integer,
  status          text not null default 'active'
                    check (status in ('active', 'maintenance', 'retired')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_tractors_organization_id on tractors(organization_id);
create index idx_tractors_carrier_id on tractors(carrier_id);
create index idx_tractors_vin on tractors(vin);

create table trailers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  carrier_id      uuid references carriers(id) on delete set null,
  trailer_number  text not null,
  license_plate   text,
  vin             text,
  status          text not null default 'active'
                    check (status in ('active', 'maintenance', 'retired')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_trailers_organization_id on trailers(organization_id);
create index idx_trailers_carrier_id on trailers(carrier_id);

-- A guardian device may be unmounted/spare (trailer_id null) between missions.
create table guardians (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references organizations(id) on delete cascade,
  trailer_id           uuid references trailers(id) on delete set null,
  device_serial        text not null unique,          -- e.g. "DG-1028"
  firmware_version     text,
  battery_level        integer,
  lte_signal_strength  text,
  last_heartbeat_at    timestamptz,
  status               text not null default 'active'
                         check (status in ('active', 'offline', 'maintenance')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index idx_guardians_organization_id on guardians(organization_id);
create index idx_guardians_trailer_id on guardians(trailer_id);

-- ============================================================================
-- 3. SHIPMENTS (commercial/cargo record) & MISSIONS (the core entity)
-- ============================================================================

create table shipments (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references organizations(id) on delete cascade,
  container_number      text,
  cargo_type            text,
  cargo_value_cents     bigint,
  origin_address        text,
  destination_address   text,
  requested_pickup_at   timestamptz,
  requested_delivery_at timestamptz,
  status                text not null default 'pending'
                          check (status in ('pending', 'booked', 'completed', 'cancelled')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index idx_shipments_organization_id on shipments(organization_id);
create index idx_shipments_status on shipments(status);

-- ── MISSIONS — the core entity of Architecture v2.0 ─────────────────────────
-- One physical, Guardian-monitored execution of a shipment: a specific
-- driver + tractor + trailer + guardian, pickup to delivery. Nearly every
-- event/evidence table below hangs off mission_id, not shipment_id.
create table missions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  shipment_id     uuid not null references shipments(id) on delete restrict,
  carrier_id      uuid references carriers(id) on delete set null,
  driver_id       uuid references drivers(id) on delete set null,
  tractor_id      uuid references tractors(id) on delete set null,
  trailer_id      uuid references trailers(id) on delete set null,
  guardian_id     uuid references guardians(id) on delete set null,
  status          text not null default 'scheduled'
                    check (status in
                      ('scheduled', 'in_transit', 'delivered', 'aborted', 'critical_alert')),
  risk_score      integer,
  planned_route   jsonb,                  -- GeoJSON LineString/waypoints, optional
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_missions_organization_id on missions(organization_id);
create index idx_missions_status on missions(status);
create index idx_missions_driver_id on missions(driver_id);
create index idx_missions_guardian_id on missions(guardian_id);
create index idx_missions_shipment_id on missions(shipment_id);
create index idx_missions_trailer_id on missions(trailer_id);
create index idx_missions_tractor_id on missions(tractor_id);

-- ============================================================================
-- 4. RECEIVER VERIFICATION
-- (created before digital_bols/bol_signatures, which reference it)
-- ============================================================================

create table receiver_verifications (
  id                     uuid primary key default gen_random_uuid(),
  mission_id             uuid not null references missions(id) on delete cascade,
  receiver_name          text,
  receiver_phone         text,
  verification_type      text not null
                           check (verification_type in
                             ('signature', 'government_id', 'biometric_face', 'qr_code')),
  provider               text,
  provider_reference_id  text,
  result                 text not null default 'pending'
                           check (result in ('passed', 'failed', 'pending')),
  consent_given          boolean not null default false,
  verified_at            timestamptz,
  created_at             timestamptz not null default now()
);
create index idx_receiver_verifications_mission_id on receiver_verifications(mission_id);

-- ============================================================================
-- 5. DIGITAL BOL & SIGNING
-- ============================================================================

create table digital_bols (
  id                    uuid primary key default gen_random_uuid(),
  mission_id            uuid not null references missions(id) on delete cascade,
  shipment_id           uuid not null references shipments(id) on delete restrict,
  bol_number            text not null unique,
  issued_at             timestamptz,
  pickup_location       text,
  delivery_location     text,
  cargo_description     text,
  declared_value_cents  bigint,
  status                text not null default 'draft'
                          check (status in
                            ('draft', 'issued', 'signed_pickup', 'signed_delivery', 'void')),
  pdf_url               text,           -- Supabase Storage path or similar
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index idx_digital_bols_mission_id on digital_bols(mission_id);
create index idx_digital_bols_shipment_id on digital_bols(shipment_id);

-- Insert-only audit trail of who signed a BOL and how their identity was
-- verified at the moment of signing. signature_hash is a hash of the
-- signature artifact — the artifact itself, if retained, belongs in
-- evidence_files with its own storage/retention policy.
create table bol_signatures (
  id                          uuid primary key default gen_random_uuid(),
  bol_id                      uuid not null references digital_bols(id) on delete cascade,
  signer_type                 text not null
                                check (signer_type in ('driver', 'receiver', 'dispatcher')),
  driver_verification_id      uuid references driver_verifications(id),
  receiver_verification_id    uuid references receiver_verifications(id),
  signature_hash              text,
  signed_at                   timestamptz not null default now(),
  ip_address                  inet,
  device_info                 jsonb
);
create index idx_bol_signatures_bol_id on bol_signatures(bol_id);

-- ============================================================================
-- 6. CHAIN OF CUSTODY (append-only mission timeline)
-- ============================================================================

create table chain_of_custody_events (
  id              uuid primary key default gen_random_uuid(),
  mission_id      uuid not null references missions(id) on delete cascade,
  event_type      text not null
                    check (event_type in
                      ('pickup', 'checkpoint', 'handoff', 'delivery', 'incident_action')),
  actor_type      text not null
                    check (actor_type in ('driver', 'dispatcher', 'system', 'receiver')),
  actor_user_id   uuid references users(id),      -- set when actor_type in ('dispatcher','system')
  actor_driver_id uuid references drivers(id),    -- set when actor_type = 'driver'
  description     text,
  location_lat    numeric,
  location_lng    numeric,
  occurred_at     timestamptz not null,
  created_at      timestamptz not null default now()
);
create index idx_coc_events_mission_occurred on chain_of_custody_events(mission_id, occurred_at);

-- ============================================================================
-- 7. HARDWARE / TELEMETRY EVENT STREAMS
-- ============================================================================

create table lock_events (
  id            uuid primary key default gen_random_uuid(),
  mission_id    uuid references missions(id) on delete set null,
  guardian_id   uuid not null references guardians(id) on delete cascade,
  event_type    text not null
                  check (event_type in ('locked', 'unlocked', 'tamper_detected', 'forced_open')),
  triggered_by  text not null default 'unknown'
                  check (triggered_by in
                    ('driver_pin', 'driver_biometric', 'dispatcher_remote', 'automatic', 'unknown')),
  occurred_at   timestamptz not null,
  created_at    timestamptz not null default now()
);
create index idx_lock_events_guardian_occurred on lock_events(guardian_id, occurred_at desc);
create index idx_lock_events_mission_id on lock_events(mission_id);

create table gps_events (
  id            uuid primary key default gen_random_uuid(),
  mission_id    uuid references missions(id) on delete set null,
  guardian_id   uuid not null references guardians(id) on delete cascade,
  lat           numeric not null,
  lng           numeric not null,
  speed_mph     numeric,
  heading       numeric,
  recorded_at   timestamptz not null default now()
);
create index idx_gps_events_guardian_recorded on gps_events(guardian_id, recorded_at desc);
create index idx_gps_events_mission_id on gps_events(mission_id);

create table camera_events (
  id            uuid primary key default gen_random_uuid(),
  mission_id    uuid references missions(id) on delete set null,
  guardian_id   uuid not null references guardians(id) on delete cascade,
  event_type    text not null
                  check (event_type in ('snapshot', 'clip_start', 'clip_end', 'motion_detected')),
  media_url     text,          -- Supabase Storage / S3 reference
  triggered_by  text check (triggered_by in ('tamper_alert', 'manual', 'scheduled')),
  occurred_at   timestamptz not null default now()
);
create index idx_camera_events_guardian_occurred on camera_events(guardian_id, occurred_at desc);
create index idx_camera_events_mission_id on camera_events(mission_id);

create table sensor_events (
  id            uuid primary key default gen_random_uuid(),
  mission_id    uuid references missions(id) on delete set null,
  guardian_id   uuid not null references guardians(id) on delete cascade,
  sensor_type   text not null
                  check (sensor_type in ('imu_impact', 'angular_tilt', 'battery', 'temperature', 'humidity')),
  value         numeric not null,
  unit          text,
  recorded_at   timestamptz not null default now()
);
create index idx_sensor_events_guardian_recorded on sensor_events(guardian_id, recorded_at desc);
create index idx_sensor_events_mission_id on sensor_events(mission_id);

create table tamper_alerts (
  id                 uuid primary key default gen_random_uuid(),
  mission_id         uuid not null references missions(id) on delete cascade,
  guardian_id        uuid references guardians(id) on delete set null,
  rule_id            text,           -- matches detection-engine rule ids, e.g. "seal-tampering"
  severity           text not null check (severity in ('low', 'medium', 'high', 'critical')),
  description        text,
  recommended_action text,
  status             text not null default 'open'
                       check (status in ('open', 'under_review', 'resolved')),
  detected_at        timestamptz not null default now(),
  resolved_at        timestamptz
);
create index idx_tamper_alerts_mission_status on tamper_alerts(mission_id, status);
create index idx_tamper_alerts_severity on tamper_alerts(severity);

create table evidence_files (
  id               uuid primary key default gen_random_uuid(),
  mission_id       uuid references missions(id) on delete set null,
  tamper_alert_id  uuid references tamper_alerts(id) on delete set null,
  camera_event_id  uuid references camera_events(id) on delete set null,
  file_type        text not null check (file_type in ('image', 'video', 'pdf', 'log_export')),
  storage_url      text not null,
  sha256_hash      text,           -- integrity/chain-of-custody proof
  uploaded_by      uuid references users(id),
  created_at       timestamptz not null default now()
);
create index idx_evidence_files_mission_id on evidence_files(mission_id);
create index idx_evidence_files_tamper_alert_id on evidence_files(tamper_alert_id);

-- ============================================================================
-- 8. AUDIT LOG (system-wide, append-only)
-- ============================================================================

create table audit_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete set null,
  actor_id        uuid references users(id),
  action          text not null,
  entity_type     text,
  entity_id       uuid,
  details         jsonb,
  ai_summary      text,
  created_at      timestamptz not null default now()
);
create index idx_audit_logs_org_created on audit_logs(organization_id, created_at desc);
create index idx_audit_logs_entity on audit_logs(entity_type, entity_id);

-- ============================================================================
-- 9. HELPER FUNCTIONS (used by RLS policies below)
-- ============================================================================

create or replace function current_org_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select organization_id from users where id = auth.uid();
$$;

create or replace function has_role(check_role text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from user_roles where user_id = auth.uid() and role = check_role
  );
$$;

create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select has_role('admin'); $$;

create or replace function is_dispatcher_or_above()
returns boolean language sql stable security definer set search_path = public
as $$ select has_role('admin') or has_role('dispatcher'); $$;

create or replace function is_analyst_or_above()
returns boolean language sql stable security definer set search_path = public
as $$ select has_role('admin') or has_role('dispatcher') or has_role('analyst'); $$;

create or replace function current_driver_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select id from drivers where user_id = auth.uid();
$$;

-- ============================================================================
-- 10. ROW LEVEL SECURITY
-- ============================================================================
-- Enabled on every table with no default-permissive grant — access must be
-- explicitly created below. Insert-only / append-only tables intentionally
-- have no UPDATE or DELETE policy for any non-service-role caller: the
-- service_role key (used exclusively from Vercel serverless functions,
-- mirroring api/add-company.js from v1) bypasses RLS entirely and is the only
-- path allowed to correct or purge audit-style data.

alter table organizations enable row level security;
alter table users enable row level security;
alter table user_roles enable row level security;
alter table carriers enable row level security;
alter table drivers enable row level security;
alter table driver_verifications enable row level security;
alter table tractors enable row level security;
alter table trailers enable row level security;
alter table guardians enable row level security;
alter table shipments enable row level security;
alter table missions enable row level security;
alter table digital_bols enable row level security;
alter table bol_signatures enable row level security;
alter table receiver_verifications enable row level security;
alter table chain_of_custody_events enable row level security;
alter table lock_events enable row level security;
alter table gps_events enable row level security;
alter table camera_events enable row level security;
alter table sensor_events enable row level security;
alter table tamper_alerts enable row level security;
alter table evidence_files enable row level security;
alter table audit_logs enable row level security;

-- ── organizations ────────────────────────────────────────────────────────
create policy org_select on organizations for select
  using (id = current_org_id());
create policy org_update_admin on organizations for update
  using (id = current_org_id() and is_admin());

-- ── users ────────────────────────────────────────────────────────────────
create policy users_select on users for select
  using (organization_id = current_org_id());
create policy users_cud_admin on users for all
  using (organization_id = current_org_id() and is_admin())
  with check (organization_id = current_org_id() and is_admin());

-- ── user_roles ───────────────────────────────────────────────────────────
create policy user_roles_select on user_roles for select
  using (organization_id = current_org_id());
create policy user_roles_cud_admin on user_roles for all
  using (organization_id = current_org_id() and is_admin())
  with check (organization_id = current_org_id() and is_admin());

-- ── carriers ─────────────────────────────────────────────────────────────
create policy carriers_select on carriers for select
  using (organization_id = current_org_id());
create policy carriers_write_dispatcher on carriers for insert
  with check (organization_id = current_org_id() and is_dispatcher_or_above());
create policy carriers_update_dispatcher on carriers for update
  using (organization_id = current_org_id() and is_dispatcher_or_above());
create policy carriers_delete_admin on carriers for delete
  using (organization_id = current_org_id() and is_admin());

-- ── drivers ──────────────────────────────────────────────────────────────
create policy drivers_select_staff on drivers for select
  using (
    carrier_id in (select id from carriers where organization_id = current_org_id())
    or user_id = auth.uid()
  );
create policy drivers_write_dispatcher on drivers for insert
  with check (
    is_dispatcher_or_above()
    and carrier_id in (select id from carriers where organization_id = current_org_id())
  );
create policy drivers_update_dispatcher on drivers for update
  using (
    is_dispatcher_or_above()
    and carrier_id in (select id from carriers where organization_id = current_org_id())
  );
create policy drivers_delete_admin on drivers for delete
  using (
    is_admin()
    and carrier_id in (select id from carriers where organization_id = current_org_id())
  );

-- ── driver_verifications (insert via service_role only from the client's
--    perspective — no client-facing insert policy is defined, so only the
--    service_role key, which bypasses RLS, can write these rows) ──────────
create policy driver_verifications_select on driver_verifications for select
  using (
    is_analyst_or_above()
    or driver_id = current_driver_id()
  );

-- ── tractors ─────────────────────────────────────────────────────────────
create policy tractors_select on tractors for select
  using (organization_id = current_org_id());
create policy tractors_write_dispatcher on tractors for insert
  with check (organization_id = current_org_id() and is_dispatcher_or_above());
create policy tractors_update_dispatcher on tractors for update
  using (organization_id = current_org_id() and is_dispatcher_or_above());
create policy tractors_delete_admin on tractors for delete
  using (organization_id = current_org_id() and is_admin());

-- ── trailers ─────────────────────────────────────────────────────────────
create policy trailers_select on trailers for select
  using (organization_id = current_org_id());
create policy trailers_write_dispatcher on trailers for insert
  with check (organization_id = current_org_id() and is_dispatcher_or_above());
create policy trailers_update_dispatcher on trailers for update
  using (organization_id = current_org_id() and is_dispatcher_or_above());
create policy trailers_delete_admin on trailers for delete
  using (organization_id = current_org_id() and is_admin());

-- ── guardians ────────────────────────────────────────────────────────────
create policy guardians_select on guardians for select
  using (organization_id = current_org_id());
create policy guardians_write_dispatcher on guardians for insert
  with check (organization_id = current_org_id() and is_dispatcher_or_above());
create policy guardians_update_dispatcher on guardians for update
  using (organization_id = current_org_id() and is_dispatcher_or_above());
create policy guardians_delete_admin on guardians for delete
  using (organization_id = current_org_id() and is_admin());

-- ── shipments ────────────────────────────────────────────────────────────
create policy shipments_select on shipments for select
  using (organization_id = current_org_id());
create policy shipments_cud_dispatcher on shipments for all
  using (organization_id = current_org_id() and is_dispatcher_or_above())
  with check (organization_id = current_org_id() and is_dispatcher_or_above());

-- ── missions (core entity — staff see all in their org, drivers see only
--    their own assigned missions) ───────────────────────────────────────
create policy missions_select_staff on missions for select
  using (organization_id = current_org_id());
create policy missions_select_driver on missions for select
  using (driver_id = current_driver_id());
create policy missions_cud_dispatcher on missions for all
  using (organization_id = current_org_id() and is_dispatcher_or_above())
  with check (organization_id = current_org_id() and is_dispatcher_or_above());
create policy missions_update_analyst on missions for update
  using (organization_id = current_org_id() and is_analyst_or_above())
  with check (organization_id = current_org_id() and is_analyst_or_above());

-- ── digital_bols ─────────────────────────────────────────────────────────
create policy bols_select_staff on digital_bols for select
  using (mission_id in (select id from missions where organization_id = current_org_id()));
create policy bols_select_driver on digital_bols for select
  using (mission_id in (select id from missions where driver_id = current_driver_id()));
create policy bols_cud_dispatcher on digital_bols for all
  using (mission_id in (
    select id from missions where organization_id = current_org_id() and is_dispatcher_or_above()
  ))
  with check (mission_id in (
    select id from missions where organization_id = current_org_id() and is_dispatcher_or_above()
  ));
create policy bols_insert_driver on digital_bols for insert
  with check (mission_id in (select id from missions where driver_id = current_driver_id()));

-- ── bol_signatures (insert-only; no update/delete for any client role) ────
create policy bol_signatures_select_staff on bol_signatures for select
  using (bol_id in (
    select id from digital_bols
    where mission_id in (select id from missions where organization_id = current_org_id())
  ));
create policy bol_signatures_select_driver on bol_signatures for select
  using (bol_id in (
    select id from digital_bols
    where mission_id in (select id from missions where driver_id = current_driver_id())
  ));
create policy bol_signatures_insert_driver on bol_signatures for insert
  with check (bol_id in (
    select id from digital_bols
    where mission_id in (select id from missions where driver_id = current_driver_id())
  ));

-- ── receiver_verifications (insert via verified delivery flow / service_role;
--    client insert policy scoped to the assigned driver completing delivery) ─
create policy receiver_verifications_select on receiver_verifications for select
  using (
    mission_id in (select id from missions where organization_id = current_org_id())
    or mission_id in (select id from missions where driver_id = current_driver_id())
  );
create policy receiver_verifications_insert_driver on receiver_verifications for insert
  with check (mission_id in (select id from missions where driver_id = current_driver_id()));

-- ── chain_of_custody_events (append-only) ──────────────────────────────────
create policy coc_select on chain_of_custody_events for select
  using (
    mission_id in (select id from missions where organization_id = current_org_id())
    or mission_id in (select id from missions where driver_id = current_driver_id())
  );
create policy coc_insert_staff on chain_of_custody_events for insert
  with check (
    mission_id in (select id from missions where organization_id = current_org_id())
    and is_dispatcher_or_above()
  );
create policy coc_insert_driver on chain_of_custody_events for insert
  with check (mission_id in (select id from missions where driver_id = current_driver_id()));

-- ── lock_events / gps_events / camera_events / sensor_events
--    (device/service-role insert only; staff + assigned driver can read) ───
create policy lock_events_select on lock_events for select
  using (
    mission_id in (select id from missions where organization_id = current_org_id())
    or mission_id in (select id from missions where driver_id = current_driver_id())
  );

create policy gps_events_select on gps_events for select
  using (
    mission_id in (select id from missions where organization_id = current_org_id())
    or mission_id in (select id from missions where driver_id = current_driver_id())
  );

create policy camera_events_select on camera_events for select
  using (
    mission_id in (select id from missions where organization_id = current_org_id())
    or mission_id in (select id from missions where driver_id = current_driver_id())
  );

create policy sensor_events_select on sensor_events for select
  using (
    mission_id in (select id from missions where organization_id = current_org_id())
    or mission_id in (select id from missions where driver_id = current_driver_id())
  );

-- ── tamper_alerts (staff can update status; drivers read-only on their own) ─
create policy tamper_alerts_select on tamper_alerts for select
  using (
    mission_id in (select id from missions where organization_id = current_org_id())
    or mission_id in (select id from missions where driver_id = current_driver_id())
  );
create policy tamper_alerts_update_analyst on tamper_alerts for update
  using (
    mission_id in (select id from missions where organization_id = current_org_id())
    and is_analyst_or_above()
  )
  with check (
    mission_id in (select id from missions where organization_id = current_org_id())
    and is_analyst_or_above()
  );
create policy tamper_alerts_cud_admin on tamper_alerts for all
  using (
    mission_id in (select id from missions where organization_id = current_org_id())
    and is_admin()
  )
  with check (
    mission_id in (select id from missions where organization_id = current_org_id())
    and is_admin()
  );

-- ── evidence_files ──────────────────────────────────────────────────────────
create policy evidence_files_select on evidence_files for select
  using (
    mission_id in (select id from missions where organization_id = current_org_id())
    or mission_id in (select id from missions where driver_id = current_driver_id())
  );
create policy evidence_files_insert_staff on evidence_files for insert
  with check (
    mission_id in (select id from missions where organization_id = current_org_id())
    and is_dispatcher_or_above()
  );
create policy evidence_files_insert_driver on evidence_files for insert
  with check (mission_id in (select id from missions where driver_id = current_driver_id()));
create policy evidence_files_delete_admin on evidence_files for delete
  using (
    mission_id in (select id from missions where organization_id = current_org_id())
    and is_admin()
  );

-- ── audit_logs (read-only for admin/analyst; write is service_role only) ───
create policy audit_logs_select on audit_logs for select
  using (organization_id = current_org_id() and is_analyst_or_above());

-- ============================================================================
-- End of migration 001
-- ============================================================================
