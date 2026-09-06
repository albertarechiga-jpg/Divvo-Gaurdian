-- brand_settings: per-company override of src/config/brand.js's BRAND_DEFAULTS.
-- v1-style table (no RLS, matches alert_settings/companies/gps_pings — the
-- anon key reads/writes it directly via src/lib/brand.js, same as
-- src/pages/Settings.jsx does for alert_settings).
--
-- This app has no migration runner — run this by hand once in the Supabase
-- SQL editor for this project. Nothing in the app creates this table itself;
-- until it exists, fetchBrandSettings() just finds no row and every company
-- falls back to BRAND_DEFAULTS (Nihlus Vision), so the app is not blocked on
-- this being run — Settings > Branding's Save button starts working the
-- moment the table exists.

create table if not exists brand_settings (
  id             uuid primary key default gen_random_uuid(),
  company_id     text not null references companies(id) on delete cascade,
  app_name       text,
  company_name   text,
  short_name     text,
  tagline        text,
  logo_url       text,
  primary_color  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (company_id)
);
