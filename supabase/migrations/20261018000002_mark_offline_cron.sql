-- Schedules the `mark-offline` Edge Function (imei_devices whose last_seen is
-- stale get flipped to status='offline') to run every 5 minutes via
-- pg_cron + pg_net.
--
-- This reads the project URL and an invocation key from Supabase Vault
-- rather than hardcoding them here, since this file is committed to git.
-- One-time manual setup in the Supabase SQL editor before this cron job can
-- actually reach the function (mirrors how supabase_brand_settings.sql
-- already documents hand-run setup for this project):
--
--   select vault.create_secret('https://<project-ref>.functions.supabase.co', 'project_functions_url');
--   select vault.create_secret('<anon-or-service-role-key>', 'functions_invoke_key');
--
-- (mark-offline itself is deployed with verify_jwt = false — see
-- supabase/config.toml — so any key that is a valid JWT works here; the anon
-- key is enough and keeps the service role key out of the DB entirely.)

create extension if not exists pg_cron;
create extension if not exists pg_net;

select
  cron.schedule(
    'mark-imei-devices-offline',
    '*/5 * * * *',
    $$
    select
      net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_functions_url') || '/mark-offline',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'functions_invoke_key')
        )
      );
    $$
  )
where not exists (select 1 from cron.job where jobname = 'mark-imei-devices-offline');
