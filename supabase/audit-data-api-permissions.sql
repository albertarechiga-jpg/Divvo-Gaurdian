-- READ ONLY. Save/review output from a DEVELOPMENT clone before any grants.
-- No tokens, row data, credential values or auth.users contents are selected.
select current_database(), version();
select n.nspname as schema, c.relname, c.relkind, c.relrowsecurity,
       c.reloptions, c.relacl
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'storage') and c.relkind in ('r','v','m','S')
order by n.nspname,c.relname;
select schemaname,tablename,policyname,roles,cmd,qual,with_check
from pg_policies where schemaname in ('public','storage')
order by schemaname,tablename,policyname;
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef,p.proacl,p.proconfig
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' order by p.proname;
select defaclrole::regrole,defaclnamespace::regnamespace,defaclobjtype,defaclacl
from pg_default_acl;
select pg_get_viewdef(to_regclass('public.gps_latest'), true) as gps_latest_definition;
-- Supplement the inventory with the missing creation/alter SQL, including
-- signup/profile trigger DDL (inspect function source privately for secrets).
