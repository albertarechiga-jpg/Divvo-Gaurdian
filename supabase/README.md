# IMEI-keyed device backend

Supabase backend for camera devices identified by IMEI. Seed device: IMEI
`869830089252035` (T100 Pro, firmware `T1R1SYrEA01`). Same tables/functions
are meant to later serve the Nihlus BG95 board via the `device_token` path.

## Layout

- `migrations/20261018000000_devices.sql` — the four core tables
  (`devices`, `events`, `photos`, `commands`), seed row, RLS, and the
  `device-photos` private Storage bucket. This file is an exact, untouched
  copy of the schema in the task brief.
- `migrations/20261018000001_device_extras.sql` — supporting infra the brief
  doesn't give an exact schema for: a `devices.params` jsonb column (for the
  `params` function), a `device-firmware` bucket (for `file-download`), and
  adding the four tables to the `supabase_realtime` publication (for the
  dashboard's Realtime subscription).
- `migrations/20261018000002_mark_offline_cron.sql` — schedules the
  `mark-offline` function via `pg_cron`/`pg_net`, reading the function URL
  and an invoke key from Supabase Vault (see below) rather than hardcoding
  either in a file that's committed to git.
- `functions/device-check`, `file-upload`, `params`, `file-download`,
  `command`, `status`, `other` — the 7 Willfine-shaped HTTPS APIs, one
  function each.
- `functions/mark-offline` — scheduled housekeeping, not part of Willfine's
  sheet; flips devices offline once `last_seen` is stale.
- `functions/_shared` — CORS, the service-role client, the IMEI
  allowlist/rate-limit/device_token auth helper, and the events-table
  request logger shared by all 7+1 functions.

## Willfine's API sheet — placeholders, not final

**We know these 7 APIs' purposes, not their real HTTPS paths or JSON
payload shapes yet.** Every function above implements the *behavior* the
task brief specifies (see the table in the top-of-file comment in each
`index.ts`) against a placeholder request/response shape. Once Alberto
supplies the real sheet, update each function's request parsing — the
devices-table/events-table logic underneath doesn't need to change.

**Do not touch or decode `sfStatisticsParm.bin`** if it turns up anywhere
in Willfine's materials — out of scope for this work, per the task brief.

## Security

- **The service role key never reaches the browser.** The dashboard only
  ever holds the anon/authenticated key (same as the rest of this app's
  Supabase usage — see the root `CLAUDE.md`). All writes to
  `devices`/`events`/`photos` happen inside these Edge Functions using
  `SUPABASE_SERVICE_ROLE_KEY`, set as a function secret
  (`supabase secrets set`), never as a `VITE_`-prefixed env var.
- **Path A (Willfine HTTPS API):** an IMEI alone is guessable, so every
  IMEI-keyed function allowlists against the `devices` table (unknown IMEI →
  error 1001) and rate-limits using a sliding window over that IMEI's own
  rows in `events` (`_shared/security.ts`).
- **Path B (future Nihlus BG95 firmware):** callers pass `device_token`
  (header `x-device-token` or a body field), checked against
  `devices.device_token`. A valid token skips the allowlist/rate-limit path
  entirely — the token is the proof of legitimacy.
- **`mark-offline`** is deployed with `verify_jwt = false` (see
  `config.toml`) since it's invoked by `pg_cron`, not a user session or a
  device. It's safe to expose: it can only flip stale devices to `offline`.
- **Logging:** every request to every one of the 7 functions is logged to
  `events` during testing (`_shared/logEvent.ts`), including rejected ones.

## One-time manual setup (Supabase SQL editor / dashboard)

This app has no migration runner (see the root `supabase_brand_settings.sql`
for the existing precedent) — run the three migration files above by hand,
in order, in the Supabase SQL editor for this project.

Before `20261018000002_mark_offline_cron.sql`'s cron job can actually reach
the `mark-offline` function, create two Vault secrets once:

```sql
select vault.create_secret('https://<project-ref>.functions.supabase.co', 'project_functions_url');
select vault.create_secret('<anon-key>', 'functions_invoke_key');
```

Then set the Edge Functions' service-role secret (never commit this value):

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service-role-key> --project-ref <project-ref>
```

Deploy the functions:

```bash
supabase functions deploy device-check file-upload params file-download command status other mark-offline --project-ref <project-ref>
```

## Testing

`scripts/mock-camera.sh` simulates the T100 Pro end to end against a real
project (see that file's header for the required env vars) and prints the
take-photo tap-to-done time. The dashboard's **Devices** page should update
live while it runs.
