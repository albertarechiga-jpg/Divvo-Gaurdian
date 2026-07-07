# Divvo Guardian — Architecture v2.0

**Status:** Draft — production database foundation for the "Mission Engine"
**Context:** Builds on `REVIEW_PACKAGE.md` (the v1 architecture review of the current pilot dashboard). Where v1 proposed a `shipments`-centric schema, v2 introduces **Mission** as the platform's core entity per this phase's direction.
**Companion file:** `supabase_migration_001_mission_engine.sql` — the runnable migration implementing everything in this document.

---

## 1. Why Mission is the core entity

In the v1 schema (and in the current pilot app), `Shipment` tried to do two jobs at once: (1) the commercial/cargo record — what's being shipped, its value, origin/destination, customer — and (2) the physical, monitored journey — which driver, which truck, which trailer, which Guardian hardware, and every lock/GPS/camera/tamper event that happens along the way. Those are different lifecycles: a shipment (the commercial booking) can exist before a driver or trailer is even assigned, and in edge cases (a failed delivery attempt, a re-route with a different driver) the same shipment could be physically executed more than once.

**Mission** is the entity that represents *one physical, Guardian-monitored execution* of a shipment: a specific driver + tractor + trailer + guardian device, moving from pickup to delivery, generating the entire real-time event stream (locks, GPS, camera, sensors, tamper alerts) and the paperwork trail (digital BOL, signatures, chain-of-custody events, receiver verification) for that one physical run.

- **Shipment** = the "what and for whom" (cargo, value, customer, origin/destination as booked).
- **Mission** = the "who, what hardware, and what actually happened" (driver, tractor, trailer, guardian, live status, every event).

Nearly every operational/security table in this schema hangs off `mission_id`, not `shipment_id` — because Mission is what Guardian is actively guarding at any given moment. `shipment_id` is still carried on `missions` (and denormalized onto `digital_bols` for reporting convenience) so cargo/commercial reporting stays easy, but the live event stream is unambiguously Mission-scoped.

---

## 2. Entity relationship overview

```
organizations
 ├─ users ──────────────< user_roles
 ├─ carriers
 │   ├─ drivers (optionally linked to a users row for driver app/portal login)
 │   ├─ tractors
 │   └─ trailers
 ├─ guardians (mounted to a trailer, or unmounted/spare)
 ├─ shipments                              (commercial/cargo record)
 └─ missions ◄── shipment_id, driver_id, tractor_id, trailer_id, guardian_id, carrier_id
     │                                     (THE CORE ENTITY — one physical monitored run)
     ├─ digital_bols
     │   └─ bol_signatures ◄── driver_verifications / receiver_verifications
     ├─ chain_of_custody_events
     ├─ lock_events ◄── guardians
     ├─ gps_events ◄── guardians
     ├─ camera_events ◄── guardians
     ├─ sensor_events ◄── guardians
     ├─ tamper_alerts ◄── guardians
     │   └─ evidence_files
     └─ receiver_verifications

driver_verifications ◄── drivers            (added beyond the requested list — see §3)
audit_logs ◄── organizations, users
```

## 3. One deliberate addition: `driver_verifications`

The requested table list did not include `driver_verifications`, but the security requirement ("store only verification references, provider IDs, hashes, timestamps, consent records, and results") describes *events over time* (a driver may be re-verified, verification can expire, consent is recorded per event) — that can't be represented as a few columns bolted onto `drivers` without losing history. `receiver_verifications` was explicitly requested and needs the exact same shape for the same reason on the receiver side, so `driver_verifications` is added as its direct counterpart. Everything else follows the requested list exactly.

## 4. Security requirement — how it's enforced in this schema

**No table stores raw biometric images, face scans, or fingerprint templates.** `driver_verifications` and `receiver_verifications` store only:
- `provider` (text, e.g. `"persona"`, `"onfido"`, `"stripe_identity"`)
- `provider_reference_id` (the opaque session/result ID from that provider — the actual biometric artifact never leaves the provider's system)
- `result` (`passed` / `failed` / `pending` / `expired`)
- `confidence_score` (numeric, provider-supplied)
- `consent_given` + `consent_recorded_at`
- `verified_at` / `expires_at`

`bol_signatures.signature_hash` stores a SHA-256 hash of the signature artifact, never the artifact itself. If a visual signature or ID photo ever needs to be retained for compliance, it belongs in `evidence_files` as an encrypted object-storage reference (`storage_url` + `sha256_hash`) with its own retention policy — not inline in a verification row.

---

## 5. Tables

Full column-level detail is in the migration SQL (§8 references it directly); this section summarizes purpose, key relationships, and indexing/RLS notes per table.

| Table | Purpose | Key FKs | Notable indexes |
|---|---|---|---|
| `organizations` | Tenant root | — | `slug` unique |
| `users` | Internal platform users (dispatcher/admin/analyst/viewer); `id` matches `auth.users.id` | `organization_id` | `organization_id`, `email` unique |
| `user_roles` | Normalized role grants — a user can hold more than one role | `user_id`, `organization_id`, `granted_by` | `(user_id, role)` unique |
| `carriers` | Trucking companies | `organization_id` | `organization_id` |
| `drivers` | Individual drivers; `user_id` nullable for driver-app login | `carrier_id`, `user_id` | `carrier_id`, `user_id` |
| `driver_verifications` | Identity-proofing events for a driver (added — see §3) | `driver_id` | `driver_id`, `(driver_id, verified_at desc)` |
| `tractors` | Power units (trucks/cabs) | `organization_id`, `carrier_id` | `carrier_id`, `vin` |
| `trailers` | Cargo trailers | `organization_id`, `carrier_id` | `carrier_id` |
| `guardians` | Physical security hardware, optionally mounted to a trailer | `organization_id`, `trailer_id` | `trailer_id`, `device_serial` unique |
| `shipments` | Commercial/cargo booking record | `organization_id` | `organization_id`, `status` |
| `missions` | **Core entity** — one monitored physical run of a shipment | `organization_id`, `shipment_id`, `driver_id`, `tractor_id`, `trailer_id`, `guardian_id`, `carrier_id` | `organization_id`, `status`, `driver_id`, `guardian_id`, `shipment_id` |
| `digital_bols` | Bill of lading tied to a mission | `mission_id`, `shipment_id` | `mission_id`, `bol_number` unique |
| `bol_signatures` | Signing events on a BOL | `bol_id`, `driver_verification_id`, `receiver_verification_id` | `bol_id` |
| `chain_of_custody_events` | Append-only custody timeline for a mission | `mission_id`, `actor_user_id` | `(mission_id, occurred_at)` |
| `lock_events` | Lock/unlock/tamper audit trail | `mission_id`, `guardian_id` | `(guardian_id, occurred_at desc)`, `mission_id` |
| `gps_events` | Time-series location pings | `mission_id`, `guardian_id` | `(guardian_id, recorded_at desc)`, `mission_id` |
| `camera_events` | Snapshot/clip/motion events | `mission_id`, `guardian_id` | `(guardian_id, occurred_at desc)`, `mission_id` |
| `sensor_events` | IMU/battery/temp/humidity time series | `mission_id`, `guardian_id` | `(guardian_id, recorded_at desc)` |
| `tamper_alerts` | Detected threat events | `mission_id`, `guardian_id` | `(mission_id, status)`, `severity` |
| `evidence_files` | Photo/video/PDF/log artifacts | `mission_id`, `tamper_alert_id`, `camera_event_id`, `uploaded_by` | `mission_id`, `tamper_alert_id` |
| `receiver_verifications` | Delivery receiver identity check | `mission_id` | `mission_id` |
| `audit_logs` | System-wide audit trail (append-only) | `organization_id`, `actor_id` | `(organization_id, created_at desc)`, `entity_type, entity_id` |

---

## 6. Row-Level Security strategy

**Every table has RLS enabled with no default-permissive policy** (Postgres/Supabase default-deny once RLS is on) — access must be explicitly granted.

### 6.1 Helper functions (defined first in the migration, reused by every policy)

```sql
current_org_id()          -- organization_id of auth.uid(), via users table
has_role(text)            -- true if auth.uid() holds the given role in user_roles
is_admin() / is_dispatcher_or_above() / is_analyst_or_above()   -- convenience wrappers
current_driver_id()       -- drivers.id linked to auth.uid(), if the caller is a driver
```

All are `security definer`, `stable`, and owned by a locked-down role so they can safely read `users`/`user_roles`/`drivers` without those tables needing to grant broad `SELECT` to every authenticated user.

### 6.2 General pattern

- **Tenant isolation:** almost every policy's first condition is `organization_id = current_org_id()` (or, for tables without a direct `organization_id` column, joins up through `mission_id → missions.organization_id`).
- **Drivers see only their own missions:** a `driver` role's `SELECT` policy on `missions` is `driver_id = current_driver_id()`, not `organization_id = current_org_id()` — a driver should never enumerate every mission in the org, only the ones assigned to them.
- **Immutable/audit-style tables are insert-only for non-admins:** `chain_of_custody_events`, `lock_events`, `gps_events`, `camera_events`, `sensor_events`, `tamper_alerts`, `bol_signatures`, `driver_verifications`, `receiver_verifications`, `audit_logs` grant `INSERT` + `SELECT` to appropriate roles but **never `UPDATE`/`DELETE`** to any non-service-role caller — an event log that can be edited after the fact isn't a chain of custody. If a correction is ever needed, it should be a new compensating event, not a mutation of history.
- **Writes to the most sensitive tables go through service-role serverless functions**, mirroring the existing, already-correct `api/add-company.js` pattern from v1 — not directly from the authenticated client. This applies especially to `bol_signatures`, `driver_verifications`, `receiver_verifications`, and `tamper_alerts` (server validates the verification-provider webhook/session before writing, rather than trusting a client-submitted "verified: true").

### 6.3 Role permission matrix

| Table | admin | dispatcher | analyst | viewer | driver |
|---|---|---|---|---|---|
| organizations | R/U (own org) | R | R | R | R (own org, limited fields) |
| users | CRUD (own org) | R | R | — | — |
| user_roles | CRUD (own org) | R (own) | — | — | — |
| carriers | CRUD | CRU | R | R | — |
| drivers | CRUD | CRU | R | R | R (own record) |
| driver_verifications | R, insert via service-role only | R | R | — | R (own) |
| tractors / trailers | CRUD | CRU | R | R | R (assigned) |
| guardians | CRUD | CRU | R | R | R (assigned) |
| shipments | CRUD | CRUD | R | R | — |
| **missions** | CRUD | CRUD | R, U (status/notes) | R | R (own, U limited to acknowledging alerts) |
| digital_bols | CRUD | CRUD | R | R | R (own mission), C (create draft) |
| bol_signatures | R, insert via service-role only | R | R | — | Insert (own mission, via verified signing flow only) |
| chain_of_custody_events | R, insert via service-role or dispatcher action | C/R | R | R | Insert (own mission events only) |
| lock_events / gps_events / camera_events / sensor_events | R, insert via device/service-role only | R | R | R | R (own mission) |
| tamper_alerts | CRUD (status transitions) | R, U (status) | R, U (status) | R | R (own mission, view only) |
| evidence_files | CRUD | C/R | R | R | C (own mission), R (own) |
| receiver_verifications | R, insert via service-role only | R | R | — | Insert (own mission, via verified flow) |
| audit_logs | R (own org) | — | R | — | — |

`C`=Create, `R`=Read, `U`=Update, `D`=Delete. Blank = no access. "own"/"own mission"/"own org" always implies the tenant-isolation `organization_id` check still applies underneath.

---

## 7. Indexing strategy

- Every foreign key column is indexed explicitly — Postgres does **not** auto-index FKs, and every event table here is written far more than it's restructured, so join/filter performance on `mission_id`/`guardian_id` matters immediately.
- Time-series tables (`gps_events`, `sensor_events`, `lock_events`, `camera_events`) get a composite `(guardian_id, recorded_at/occurred_at desc)` index — the dominant query pattern is "latest N events for this device."
- `chain_of_custody_events` gets `(mission_id, occurred_at)` ascending — the dominant query pattern is "full timeline for this mission, oldest first."
- `tamper_alerts` gets `(mission_id, status)` for the "open alerts on this mission" dashboard query, plus a standalone `severity` index for cross-mission triage views.
- `missions` gets indexes on `organization_id`, `status`, `driver_id`, `guardian_id`, and `shipment_id` independently, since the dashboard needs to slice by all of these (per-company view, per-status board, per-driver history, per-device history, per-shipment lookup).

---

## 8. Migration file

See `supabase_migration_001_mission_engine.sql` in the same directory — it is a single, runnable-top-to-bottom migration: extensions → tables → indexes → helper functions → RLS enablement + policies. Run it in the Supabase SQL editor (or via the Supabase CLI's migration runner) against a fresh project or a v1 pilot project (it does not touch or reference any of the v1 pilot tables — `companies`, `alert_settings`, `saved_routes`, `gps_pings`, `webrtc_signals`, `audit_log` — so both schemas can coexist during a transition period if needed).

---

## 9. What's intentionally deferred to a later migration

- **Geofences** — not in this task's table list; v1's simple distance-from-route math can keep working against `missions`/`gps_events` until a real `geofences` (polygon) table is prioritized.
- **Multi-leg missions** (one shipment, several sequential missions with a handoff) — the schema supports it (many missions can reference one `shipment_id`), but handoff-specific fields/workflow aren't modeled yet.
- **Storage bucket policies for `evidence_files.storage_url`** — this migration defines the table and RLS on the *row*, not the underlying Supabase Storage bucket policy for the actual file bytes; that's a separate, storage-specific policy to write once the bucket is created.
