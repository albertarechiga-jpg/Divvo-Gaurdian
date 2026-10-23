import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
// In-memory PostgreSQL only: no credentials, database URL or network.
const db = new PGlite();
const sql = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const apply = async path => db.exec(await sql(path));
let checks = 0;
async function check(name, fn) { await fn(); console.log(`ok ${++checks} - ${name}`); }
async function as(role, statement, uid = '') {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try { return await db.query(statement); } finally { await db.exec('reset role'); }
}
const denied = (role, statement, uid = '') => assert.rejects(() => as(role, statement, uid), /permission denied|row-level security/);
const active = '00000000-0000-0000-0000-000000000001';
const suspended = '00000000-0000-0000-0000-000000000002';
const stranger = '00000000-0000-0000-0000-000000000003';
const org = '00000000-0000-0000-0000-000000000010';
const deviceGrants = 'supabase/migrations/20261023000000_explicit_data_api_grants.sql';
const missionGrants = 'supabase_mission_api_grants.sql';
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    create schema storage;
    create table storage.buckets(id text primary key, name text, public boolean);
    create table storage.objects(id uuid default gen_random_uuid(), bucket_id text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated, service_role;
    grant select on storage.objects to anon, authenticated;
    create publication supabase_realtime;`);
  // PGlite lacks pgcrypto; this schema uses core gen_random_uuid().
  await db.exec((await sql('supabase_migration_001_mission_engine.sql')).split('-- Explicit Data API privileges')[0].replace('create extension if not exists pgcrypto;', ''));
  await apply('supabase/migrations/20261018000000_devices.sql');
  await apply('supabase/migrations/20261018000001_device_extras.sql');
  await apply('supabase/migrations/20261018100000_phone_events.sql');
  await check('device read denied without explicit grants', () => denied('authenticated','select * from public.imei_devices'));
  await check('phone read denied without explicit grants', () => denied('anon','select * from public.phone_events'));
  if (process.env.GRANTS_BASELINE !== '1') await apply(deviceGrants);
  await check('dashboard can read devices', () => as('authenticated','select * from public.imei_devices'));
  await check('dashboard queues take_photo and receives identity id', async () => {
    assert.equal((await as('authenticated',`insert into public.commands(imei,command) values ('869830089252035','take_photo') returning id`)).rows.length,1);
  });
  await check('dashboard cannot forge completion or arbitrary commands', async () => {
    await denied('authenticated',`insert into public.commands(command,status) values ('take_photo','done')`);
    await denied('authenticated',`insert into public.commands(command) values ('set_param')`);
    await denied('authenticated',`update public.commands set status='done'`);
  });
  await check('anon cannot read or delete device data', async () => {
    for (const t of ['imei_devices','events','photos','commands']) {
      await denied('anon',`select * from public.${t}`); await denied('anon',`delete from public.${t}`);
    }
  });
  await check('service can read/update devices, log events, insert photos and process commands', async () => {
    await as('service_role','select * from public.imei_devices');
    await as('service_role',`update public.imei_devices set status='online'`);
    await as('service_role',`insert into public.events(imei,type) values ('869830089252035','status') returning id`);
    await as('service_role',`insert into public.photos(imei,storage_path) values ('869830089252035','test.jpg') returning id`);
    for (const t of ['events','photos','commands']) await as('service_role',`select * from public.${t}`);
    await as('service_role',`update public.commands set status='sent'`);
  });
  await check('unneeded device service writes remain denied', async () => {
    await denied('service_role','delete from public.photos');
    await denied('service_role',`update public.events set type='forged'`);
    await denied('service_role',`insert into public.imei_devices(imei) values ('unprovisioned')`);
  });
  await check('phone roles can insert/read but cannot update/delete', async () => {
    for (const role of ['anon','authenticated']) {
      await as(role,`insert into public.phone_events(device_id,event_type) values ('DG-1028','no_signal') returning id`);
      assert.ok((await as(role,'select * from public.phone_events')).rows.length);
      await denied(role,'delete from public.phone_events');
      await denied(role,`update public.phone_events set note='forged'`);
    }
  });
  // Test-only v1 fixture; production DDL is missing from the repository.
  await db.exec(`create table public.gps_pings(id bigserial primary key,device_id text,lat float8,lon float8,created_at timestamptz default now());
    insert into public.organizations(id,name,slug) values ('${org}','Test','test');
    insert into public.users(id,organization_id,email,status) values
      ('${active}','${org}','active@test.invalid','active'),('${suspended}','${org}','suspended@test.invalid','suspended');
    insert into public.user_roles(user_id,organization_id,role) values ('${active}','${org}','admin');`);
  // Local token generation results are deliberately not printed.
  await apply('pilot_proof_of_capture_migration.sql');
  await apply('pilot_security_migration.sql');
  const policies = () => db.query(`select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies order by schemaname,tablename,policyname`);
  const before = await policies();
  await apply(deviceGrants); await apply(deviceGrants);
  await check('replayed compatibility grants preserve every pilot policy', async () => assert.deepEqual(await policies(),before));
  await check('pilot device reads/commands require a non-suspended app user', async () => {
    assert.equal((await as('authenticated','select * from public.imei_devices',active)).rows.length,2);
    for (const uid of [suspended,stranger]) {
      assert.equal((await as('authenticated','select * from public.imei_devices',uid)).rows.length,0);
      await denied('authenticated',`insert into public.commands(command) values ('take_photo')`,uid);
    }
    await as('authenticated',`insert into public.commands(command) values ('take_photo') returning id`,active);
  });
  await check('GPS retains validated anon insert and app-user read', async () => {
    await as('anon',`insert into public.gps_pings(device_id,lat,lon) values ('DG-1028',29.4,-98.5)`);
    await denied('anon','select * from public.gps_pings');
    await denied('anon',`insert into public.gps_pings(device_id,lat,lon) values ('DG-1028',91,0)`);
    assert.equal((await as('authenticated','select * from public.gps_pings',active)).rows.length,1);
  });
  await check('credentials stay service-only and evidence trigger still rejects mutation', async () => {
    await denied('authenticated','select * from public.device_credentials',active);
    await denied('anon','select * from public.device_credentials');
    await as('service_role','select * from public.device_credentials');
    // Exercise trigger even with extra test-only privileges.
    await db.exec('grant update,delete on public.photos to service_role');
    await assert.rejects(() => as('service_role',`update public.photos set storage_path='forged'`), /immutable/);
    await assert.rejects(() => as('service_role','delete from public.photos'), /cannot be deleted/);
  });
  await check('existing Mission schema profile SELECT is denied before supplement', () => denied('authenticated','select * from public.users',active));
  await apply(missionGrants); await apply(missionGrants);
  await check('verification SELECT stays within tenant or the driver own record', async () => {
    const orgB = '00000000-0000-0000-0000-000000000020';
    const carrierA = '00000000-0000-0000-0000-000000000030';
    const carrierB = '00000000-0000-0000-0000-000000000040';
    const driverA = '00000000-0000-0000-0000-000000000050';
    const driverB = '00000000-0000-0000-0000-000000000060';
    await db.exec(`insert into public.organizations(id,name,slug) values ('${orgB}','Other','other');
      insert into public.carriers(id,organization_id,name) values ('${carrierA}','${org}','A'),('${carrierB}','${orgB}','B');
      insert into public.drivers(id,carrier_id,full_name) values ('${driverA}','${carrierA}','A'),('${driverB}','${carrierB}','B');
      insert into public.driver_verifications(driver_id,verification_type,provider_reference_id) values
        ('${driverA}','government_id','own-tenant'),('${driverB}','government_id','other-tenant');`);
    for (const role of ['admin','dispatcher','analyst']) {
      await db.exec(`update public.user_roles set role='${role}' where user_id='${active}'`);
      const rows = (await as('authenticated','select provider_reference_id from public.driver_verifications',active)).rows;
      assert.deepEqual(rows,[{provider_reference_id:'own-tenant'}]);
    }
    // Preserve original own-driver access even without analyst staff privileges.
    await db.exec(`insert into public.users(id,organization_id,email) values ('${stranger}','${orgB}','driver@test.invalid'); update public.drivers set user_id='${stranger}' where id='${driverB}'`);
    assert.deepEqual((await as('authenticated','select provider_reference_id from public.driver_verifications',stranger)).rows,
      [{provider_reference_id:'other-tenant'}]);
    await db.exec(`update public.drivers set user_id=null where id='${driverB}'; delete from public.users where id='${stranger}';
      update public.user_roles set role='admin' where user_id='${active}'`);
    assert.equal((await as('authenticated','select * from public.driver_verifications',stranger)).rows.length,0);
  });
  await check('profile/embedded org/role reads work and respect tenant RLS', async () => {
    for (const t of ['users','user_roles','organizations']) {
      assert.ok((await as('authenticated',`select * from public.${t}`,active)).rows.length);
      await denied('anon',`select * from public.${t}`);
    }
    assert.equal((await as('authenticated','select * from public.users',stranger)).rows.length,0);
  });
  await check('team management uses admin RLS without client INSERT grants', async () => {
    await as('authenticated',`update public.users set status='active' where id='${suspended}'`,active);
    await denied('authenticated',`insert into public.users(id,organization_id,email) values ('${stranger}','${org}','new@test.invalid')`,active);
    assert.equal((await as('authenticated',`update public.users set status='suspended' returning id`,suspended)).rows.length,0);
  });
  await check('nested BOL/RLS dependencies selectable, unnecessary writes denied', async () => {
    for (const t of ['carriers','drivers','shipments','missions','digital_bols','driver_verifications','receiver_verifications','bol_signatures','chain_of_custody_events','lock_events','evidence_files']) {
      await as('authenticated',`select * from public.${t}`,active);
      await denied('anon',`select * from public.${t}`);
      await denied('authenticated',`delete from public.${t}`,active);
    }
  });
  await check('Mission fresh-create and manual supplement grants stay synchronized', async () => {
    const supplement = await sql(missionGrants);
    const source = await sql('supabase_migration_001_mission_engine.sql');
    assert.equal(source.slice(source.lastIndexOf('begin;')),supplement.slice(supplement.indexOf('begin;')));
  });
  await check('fresh Mission creation independently installs grants and tightened policy', async () => {
    const fresh = new PGlite();
    try {
      await fresh.exec(`create role anon; create role authenticated; create role service_role bypassrls;
        create schema auth;
        create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
        grant usage on schema auth to authenticated,service_role;`);
      await fresh.exec((await sql('supabase_migration_001_mission_engine.sql')).replace('create extension if not exists pgcrypto;', ''));
      await fresh.exec('set role authenticated; select * from public.users; select * from public.user_roles; select * from public.organizations; reset role;');
      const result = await fresh.query(`select qual from pg_policies where tablename='driver_verifications' and policyname='driver_verifications_select'`);
      assert.match(result.rows[0].qual,/current_org_id/);
    } finally { await fresh.close(); }
  });
  await check('server ACLs match BOL/invitation operations without broad DELETE', async () => {
    const required = {
      users: ['SELECT','INSERT'], user_roles: ['SELECT','INSERT'], organizations: ['SELECT'],
      carriers: ['SELECT','INSERT'], drivers: ['SELECT','INSERT'], guardians: ['SELECT','INSERT'],
      shipments: ['SELECT','INSERT','UPDATE'], missions: ['SELECT','INSERT','UPDATE'],
      digital_bols: ['SELECT','INSERT','UPDATE'], driver_verifications: ['SELECT','INSERT','UPDATE'],
      receiver_verifications: ['SELECT','INSERT'], bol_signatures: ['SELECT','INSERT'],
      chain_of_custody_events: ['SELECT','INSERT'], lock_events: ['SELECT','INSERT'],
      evidence_files: ['SELECT','INSERT'], camera_events: ['SELECT','INSERT'],
    };
    for (const [table,privileges] of Object.entries(required)) {
      for (const privilege of privileges) {
        const result = await db.query(`select has_table_privilege('service_role','public.${table}','${privilege}') as allowed`);
        assert.equal(result.rows[0].allowed,true, `${table} ${privilege}`);
      }
      await denied('service_role',`delete from public.${table}`);
    }
    await denied('authenticated',`update public.users set organization_id='${org}'`,active);
  });
  await check('future private tables receive no default grants', async () => {
    await db.exec('create table public.future_private_table(secret text)');
    for (const r of ['anon','authenticated','service_role']) await denied(r,'select * from public.future_private_table');
  });
  await check('legacy supplement fails closed when schema sources are missing', async () => {
    await assert.rejects(() => apply('supabase_legacy_api_grants.sql'), /missing or lacks reviewed RLS/);
    await db.exec('rollback');
    await denied('anon','select * from public.gps_pings');
  });
  await check('legacy supplement handles serial ids without changing existing pilot policies', async () => {
    for (const t of ['companies','dashboard_shipments','webrtc_signals','saved_routes','audit_log','alert_settings','insurance_claims']) {
      await db.exec(`create table public.${t}(id bigserial primary key);
        alter table public.${t} enable row level security;`);
      // Test-only fixtures to exercise ACLs. These are NOT production policies.
      await db.exec(`create policy test_fixture_insert on public.${t} for insert to anon,authenticated with check (true)`);
    }
    const beforeLegacy = await policies();
    await apply('supabase_legacy_api_grants.sql'); await apply('supabase_legacy_api_grants.sql');
    assert.deepEqual(await policies(),beforeLegacy);
    await as('anon','insert into public.webrtc_signals default values');
    await as('anon','insert into public.saved_routes default values');
    await as('anon','insert into public.audit_log default values');
    await as('authenticated','insert into public.alert_settings default values',active);
    await denied('anon','select * from public.gps_pings');
    await denied('anon','select * from public.alert_settings');
    await denied('authenticated','select * from public.device_credentials',active);
    assert.equal((await db.query("select has_sequence_privilege('anon','public.webrtc_signals_id_seq','UPDATE') as allowed")).rows[0].allowed,false);
  });
  console.log(`PASS: ${checks} PostgreSQL privilege/RLS checks`);
} catch (error) { console.error(`${error.code || 'FAIL'}: ${error.message}`); process.exitCode = 1; } finally { await db.close(); }
