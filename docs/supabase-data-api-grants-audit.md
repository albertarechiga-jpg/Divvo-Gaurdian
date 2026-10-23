# Data API permission audit — 2026-10-23

Audited main at `4a39b7578d63295a8bac8795d94bd5c1dad7de2b`.

Supabase's October 20 notice and [official change announcement](https://github.com/orgs/supabase/discussions/45329) say new public tables require explicit ACLs on October 30. Existing tables keep their grants. This audit establishes a reproducible fresh-table permission failure, **not a production outage**. RLS policies do not grant table access; service_role's BYPASSRLS also does not bypass table ACLs.

## Implemented scope and application order

- New numbered `20261023000000_explicit_data_api_grants.sql` supplies the exact device/phone privileges below after their creation. Historical device migrations remain untouched. This works on resets/preview branches and is idempotent for already-created tables. It does not run the separate pilot migrations or weaken their policies.
- The Mission Engine creation SQL now ends with explicit grants. For an existing Mission Engine database, `supabase_mission_api_grants.sql` contains the identical block. It stays manual and outside the automatic runner because the runner does not create that schema. It fails if its required tables are absent.
- `supabase_legacy_api_grants.sql` is a **manual supplement requiring prior DDL/security review** for legacy tables. It fails atomically if any required table is absent, lacks RLS, or has no policies. That guard does not prove policy correctness. Review the actual definitions first; the repository lacks them. It adds only the operations in the matrix below, without modifying policies.
- Run existing pilot migrations in their documented order, including deploying the matching dashboard before the pilot security SQL. This PR does not authorize those deployments or production SQL. Device grants can precede or follow pilot security; tests cover replay after lockdown. Do not rerun historical creation scripts over an existing schema.
- Table grant changes are additive: existing excess privileges are not silently revoked. Least privilege describes the newly granted operations, not an assertion that an unknown deployed database has no excess ACLs. Review the read-only inventory before authorizing any rollout. No `GRANT ALL ON ALL TABLES`, default grants, RLS disable, additional permissive policies or auth-schema grants are introduced. The Mission supplement tightens one existing policy as described below; pilot policies remain unchanged.

## Required access: device, phone and pilot

S = SELECT; I = INSERT; U = UPDATE; D = DELETE. A dash means no new grant.

| Relation | anon | authenticated | service_role | Current caller / rationale |
|---|---|---|---|---|
| imei_devices | — | S | S,U | devices.js, security.ts, status, params, command heartbeat, mark-offline |
| events | — | S | S,I | dashboard RLS contract; security rate-limit reads and request logger |
| photos | — | S | S,I | devices.js/proofOfCapture.js; file-upload inserts and dedup reads |
| commands | — | S,I | S,U | dashboard queues pending take_photo with RETURNING; device polls/completes/expires/fails |
| phone_events | S,I | S,I | — | phoneEvents.js uses anon sbHeaders, existing policies list both roles |
| device_credentials | — | — | existing ALL unchanged | security.ts reads; proof migration already grants service access and denies clients |
| gps_pings | I | S | — | phone pages write; signed-in dashboard reads; existing pilot SQL already grants this |
| alert_settings | — | S,I,U | S,I | Settings/notifications; server recipient lookup and company creation |
| companies | S | — | S,I | public company selector, server checks/creation |
| dashboard_shipments | S | — | S,I | shipments.js and add-shipment API |
| webrtc_signals | S,I | — | — | dashboard and phone signaling both use anon |
| saved_routes | S,I,D | — | — | UnifiedCommandCenter route helpers use anon |
| audit_log | I | — | — | UnifiedCommandCenter best-effort audit POST uses anon |
| insurance_claims | — | S | S,I,U | insurance.js and upsert-insurance-claim API |
| gps_latest (view) | — | S required, **not granted here** | — | Devices.jsx; definition and security mode missing |

Legacy anonymous access in this matrix reflects the current application contracts; it is not a claim of tenant isolation. `phone_events` still has permissive anon read/write RLS. Narrowing that, signaling, routes and public company/shipment access requires coordinated application/security changes outside this compatibility patch. The pilot security SQL intentionally does not address those tables.

Identity-backed device/phone ids generate on INSERT without separate sequence grants (verified by real role inserts/RETURNING). No sequence privileges are added for them. Legacy SERIAL ids need USAGE: the manual supplement discovers only sequences owned by columns of the exact INSERT targets and grants USAGE to those writers, not SELECT/UPDATE/setval. Existing pilot GPS and alert supplements already handle their sequences.

## Verification policy correction found during review

The original `driver_verifications_select` policy allowed `is_analyst_or_above()` without a tenant predicate. A two-tenant regression test reproduced an org A staff user reading org B verification data. The Mission supplement now atomically **tightens that existing policy before granting SELECT**: staff must also reach the driver through a carrier in their own organization; the original own-driver access remains. The fresh creation script contains the same correction. Tests cover admins, dispatchers, analysts, non-app users and own-driver access. No pilot policies are altered.

## Required access: Auth, team, BOL and evidence

All browser requests here use authenticated access tokens. Nested PostgREST embeds need SELECT on each referenced table; policy subqueries also run with caller privileges unless inside a SECURITY DEFINER helper.

| Relation | authenticated | service_role | Current callers |
|---|---|---|---|
| organizations | S | S | fetchCurrentUser embed, server platform/org checks |
| users | S, U(status), D | S,I | profile/team reads; approve/reject; create-user API invitation profile |
| user_roles | S | S,I | profile/team embeds, server role checks, create-user API |
| carriers, drivers | S | S,I | BOL nested detail/RLS dependencies; submit-bol creates or finds records |
| guardians | — | S,I | submit-bol find/create hardware record |
| shipments, missions, digital_bols | S | S,I,U | BOL reads, upsert shipment, create/link mission, pickup/delivery/review updates |
| driver_verifications | S | S,I,U | BOL embed/prior-pass lookup; submit/review verification |
| receiver_verifications, bol_signatures | S | S,I | nested BOL detail; pickup/delivery inserts |
| chain_of_custody_events | S,I | S,I | browser manual entry plus server BOL/review entries |
| lock_events | S | S,I | browser packet read; server event insert |
| evidence_files | S | S,I | evidence packet read; upload/get-evidence-url API |
| camera_events | — | S,I | upload-evidence uses INSERT RETURNING |
| tractors, trailers, gps_events, sensor_events, tamper_alerts, audit_logs | — | — | no current Data API calls requiring new privileges |

Users DELETE relies on existing FK cascade for user_roles (no extra user_roles DELETE grant). Status update is column-scoped; admin/tenant RLS still controls affected rows. SECURITY DEFINER helper function bodies/pinned search paths and existing function EXECUTE ACLs remain unchanged. No RPC calls were found. Existing `current_org_id`, `has_role`, `is_admin`, dispatcher/analyst checks and `current_driver_id` use the creation-time PUBLIC EXECUTE default; pilot `is_app_user`/`can_access_company_alerts` have explicit authenticated EXECUTE. A project that separately revokes default function EXECUTE must provision those policy-helper permissions separately; this table-grant change does not change that configuration.

Password sign-in, refresh, PKCE invite/recovery, password changes and signup use `/auth/v1` through supabase-js, not public-table INSERTs. They need no anon grants on users/user_roles or auth.users. Session-to-dashboard profile loading does require the three SELECT grants above. The current source includes self-service signup, although AGENTS.md still describes invite-only; its signup trigger migration is absent, so trigger behavior cannot be validated here. Do not change Auth settings or grant client INSERT to work around that missing DDL.

## Storage, Realtime and dependencies

- `device-photos` remains private. Dashboard signed URLs require storage.objects SELECT plus the existing pilot app-user bucket policy; uploads/removal use the Storage service with service_role. No storage ACLs/policies are broadened. Evidence immutability trigger and service-only device_credentials remain intact.
- Device-firmware download signs a private object with service_role. BOL evidence and verification APIs use private Storage buckets through service credentials. CameraView also uploads to `pilot-clips` using authenticated tokens; that bucket's creation/policies are not versioned here. Do not blanket grant storage.objects.
- Realtime publication membership from device_extras is unchanged. Device/photo/command subscriptions need authenticated SELECT and matching RLS; the SQL harness does not run a Realtime server.
- Browser lockfile uses supabase-js 2.110.0; Edge Functions import `jsr:@supabase/supabase-js@2`. Both use Data API table ACLs. No SDK/runtime upgrades are needed for explicit SQL grants. No lockfile runtime package versions changed. `npm audit` reports 10 pre-existing toolchain advisories (5 high, 5 moderate: Vite/esbuild, Tailwind/PostCSS and their transitive packages); the new PGlite package has no reported advisory. Toolchain upgrades are outside this SQL patch. Added only pinned dev dependency PGlite 0.3.14 for credential-free PostgreSQL testing.
- No test/lint command previously existed. Added `npm run test:db-grants`; the normal Vite build remains the application compilation check.

## Verification and limits

`npm run test:db-grants` passes 24 PostgreSQL privilege/RLS checks in a disposable in-memory PGlite database, with no automatic table grants. The baseline run (`GRANTS_BASELINE=1 node tests/data-api-grants.mjs`) fails with SQLSTATE 42501 at the first expected dashboard SELECT. Tests execute repository table creation SQL, device extras, phone SQL, full Mission Engine SQL (omitting only its unavailable pgcrypto extension declaration), pilot proof-of-capture and pilot security SQL. Core gen_random_uuid works without pgcrypto. Local generated credential results are not logged.

Coverage includes identity INSERT RETURNING, device service operations, denied arbitrary commands/completions/client writes, anon read denial, active/suspended/non-app pilot users, validated GPS writes, credential isolation, evidence-trigger rejection even when test-only service mutation rights are added, policy snapshots before/after grant replay, supplement idempotency, nested query table/policy dependencies, tenant profile filtering, independent existing/fresh Mission setups, two-tenant verification filtering and own-driver access, column-scoped team updates, service BOL ACL matrix, no future-table default exposure, and legacy missing-schema failure/serial-sequence behavior. Legacy tables use explicitly labeled minimal test-only fixtures; those fixtures do not validate unknown deployed policies.

`npm run build` passes. Vite reports existing CJS/module-type warnings and a bundle-size warning. No application UI code changed. Native PostgreSQL/Docker/Supabase CLI were unavailable; native package installation could not run in this container. PGlite executes PostgreSQL ACL/RLS semantics but is **not a complete Supabase stack**. pg_cron/pg_net/Vault scheduling, actual HTTP PostgREST embeds, Storage, Auth email flows and Realtime streaming were not exercised. No project URL or credentials were used; no production database, schema or deployment was contacted or changed.

## Required before a full reset/rollout can be approved

1. Retrieve/review original DDL for companies, alert_settings, gps_pings, webrtc_signals, saved_routes, audit_log, dashboard_shipments, insurance_claims and gps_latest. `supabase/audit-data-api-permissions.sql` is a read-only inventory to run in an authorized development clone, not a production mutation script.
2. Restore missing signup/profile trigger and schema updates: organizations.is_platform_org, companies.organization_id, shipments.legacy_shipment_id, verification review/photo columns, phone_events.video_path, pilot-clips bucket and any other live-only alterations. Current source references these, but repository creation SQL does not reproduce them.
3. Review gps_latest as a potential view/RLS boundary. Confirm its owner, definition, ACLs and security_invoker option before granting authenticated SELECT; a definer view can expose rows despite base-table RLS.
4. In a disposable Supabase project with those schemas restored, run full resets and the documented manual supplements/pilot order. Exercise Auth login/invite/recovery/signup, profile embeds, phone writes, device upload/command cycle, private photo signing, BOL/evidence endpoints and Realtime. Verify exposed schemas in Data API settings.
5. Obtain explicit authorization before any production SQL or deployment. This PR is review-only; merge alone does not execute manual root scripts. Do not rerun old creation migrations or use broad default grants as a shortcut.
