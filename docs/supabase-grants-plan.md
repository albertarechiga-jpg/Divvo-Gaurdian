# Explicit Data API grants implementation plan

Goal: make repository-owned table creation reproducible without automatic API grants, preserving pilot RLS and manual deployment order.

1. Trace current browser, server and device requests, including nested PostgREST reads and Auth profile lookup. Record required privileges and missing schema sources.
2. Add an isolated PostgreSQL regression harness; reproduce missing device/phone/profile grants with no default table grants. Check allowed operations and denied roles/operations.
3. Add an additive numbered migration for device and phone tables; keep historical device schema unchanged. Add a manual, idempotent Mission Engine grant supplement and append equivalent grants to its original creation script. Do not move manual pilot migrations into the automatic runner.
4. Verify fresh creation, supplement replay, and application before/after pilot lockdown; compare policies and exercise active, suspended and unregistered users. Run build and inspect final diff.
5. Open a reviewable PR with evidence and limitations. No production SQL, merge or deployment.

Review focus: anon phone helpers versus authenticated dashboard; service-role RLS bypass still needs ACLs; nested reads require referenced table SELECT; serial versus identity behavior; missing v1/signup/insurance schemas prevent a full application reset claim.

Execution evidence: all five steps completed through local verification; PR publication follows. Independent review identified and resolved cross-tenant verification RLS and an existing-schema test isolation gap. See the audit for evidence and rollout limitations.
