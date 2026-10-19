-- ============================================================================
-- PILOT-001 / PR 3 — rename the customer "Owlet" -> "Sony" in the database
-- ============================================================================
-- Run BY HAND in the Supabase SQL editor, in the order below. Safe to re-run.
-- The company ID stays 'owlet' on purpose: alert_settings, saved_routes, users'
-- org mapping and the mock fleets are all keyed by it. Only the display NAME
-- changes. Order vs. the code deploy does not matter: the dashboard matches
-- shipments to a company under either name (src/lib/companyMatch.js).
-- ============================================================================

-- STEP 1 (read-only, run this ONE query on its own first, then the rest):
-- every text column in `public` that currently contains the old name, with row
-- counts. Anything listed besides companies.name and dashboard_shipments.customer
-- needs a look before you rename. (Rows where the match is the ID 'owlet', e.g.
-- companies.id or company_id columns, are expected and must NOT be changed.)
--
--   select c.table_name, c.column_name,
--          (xpath('/row/c/text()', query_to_xml(
--             format('select count(*) as c from public.%I where %I ilike %L', c.table_name, c.column_name, '%owlet%'),
--             false, true, '')))[1]::text::int as hits
--   from information_schema.columns c
--   join information_schema.tables t
--     on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
--   where c.table_schema = 'public' and c.data_type in ('text', 'character varying')
--   order by hits desc, 1, 2;

-- STEP 2: the rename. Both statements only touch rows that still say "Owlet".
begin;

-- The name shown in the sidebar company switcher and used for every page title.
update public.companies
   set name = 'Sony'
 where id = 'owlet' and name = 'Owlet';

-- Live shipments store the customer name as text.
update public.dashboard_shipments
   set customer = 'Sony'
 where customer = 'Owlet';

commit;

-- STEP 3 (only if step 1 listed it): the organization row behind the company.
-- Check it is Owlet's own org and not shared with other tenants first.
--   select id, name from public.organizations where name ilike '%owlet%';
--   update public.organizations set name = 'Sony' where id = '<id from the select>';

-- Verification — shown in the results panel (expect name 'Sony', 0 old rows):
select c.id, c.name, (select count(*) from public.dashboard_shipments where customer = 'Owlet') as shipments_still_owlet
from public.companies c
where c.id = 'owlet';

-- Rollback:
--   update public.companies set name = 'Owlet' where id = 'owlet';
--   update public.dashboard_shipments set customer = 'Owlet' where customer = 'Sony' and company_id = 'owlet';
