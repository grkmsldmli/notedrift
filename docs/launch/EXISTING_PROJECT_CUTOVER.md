# Existing-Project Production Cutover — NoteDrift

> **CHOSEN DEPLOYMENT DECISION (2026-09-05): reuse the existing Supabase project
> `kmgcmoaveppzhjezyqax` as production**, rather than the fresh-project option in
> [`BILLING_STATE_AUDIT.md`](./BILLING_STATE_AUDIT.md). The fresh-project option
> remains documented there as the theoretically safest path; this project reuse is
> the path we are taking. Because the existing project already holds Stripe **TEST**
> billing state, this reuse path **requires** the cleanup + mode switch below.

This is the exact, ordered runbook to run **in the Supabase SQL Editor** for
project `kmgcmoaveppzhjezyqax` (`https://kmgcmoaveppzhjezyqax.supabase.co`). It is
transactional and safe. Nothing here touches users, cloud canvases, or assets.

## Why the SQL Editor (and not automated)

Applying the mode-guard **migration is DDL**, and the cleanup **must run in a
transaction** with a verify-then-commit gate. This environment has no Supabase
CLI, no `psql`, no direct database connection string — only the service-role REST
key, which can neither run DDL nor open a rollback-able transaction. So these
steps are handed to you to run in the SQL Editor (which is transactional and lets
you review before commit). A **read-only** audit was performed and a **local
backup** of the billing rows was captured first (see below).

## Audited starting state (read-only, 2026-09-05)

| Item | Value |
|---|---|
| Project | `kmgcmoaveppzhjezyqax` (matches `.env.local`) |
| `auth.users` | 2 |
| `cloud_canvases` / `cloud_assets` / `cloud_canvas_asset_refs` | exist (service role has no direct SELECT — counts must be read in the SQL Editor) |
| `billing_customers` | 1 (a TEST customer) |
| `billing_subscriptions` | 1 (livemode=false, plan=pro, active, yearly — the dev TEST sub) |
| `stripe_webhook_events` | 0 |
| `billing_config` / `expected_livemode()` | **absent** → mode-guard migration NOT yet applied |

**Local backup of billing rows:** `docs/launch/private-local/test-billing-backup.json`
(gitignored, never committed). Keep it until cutover is verified.

---

## Step 1 — Apply the mode-guard migration (DDL)

Paste the full contents of
`supabase/migrations/20250905120000_billing_mode_guard.sql` into the SQL Editor
and run it. It is idempotent (`create table if not exists`, `create or replace
function`, `insert … on conflict do nothing`) and does not rewrite any prior
migration. Verify:

```sql
select * from public.billing_config;      -- expect id=1, expected_livemode=false
select public.expected_livemode();         -- expect false
```

## Step 2 — Preflight counts (read-only) — record these

```sql
select
  (select count(*) from auth.users)                     as auth_users,                 -- expect 2
  (select count(*) from public.cloud_canvases)          as cloud_canvases,
  (select count(*) from public.cloud_assets)            as cloud_assets,
  (select count(*) from public.cloud_canvas_asset_refs) as cloud_canvas_asset_refs;

select livemode, count(*) from public.billing_subscriptions group by livemode order by livemode;
select count(*) as billing_customers from public.billing_customers;
```

Write down the four counts in the first query — you will re-check them after.

## Step 3 — Transactional cleanup (billing TEST state ONLY)

```sql
begin;

-- (a) Remove TEST subscriptions (livemode = false). Expect ~1 row.
delete from public.billing_subscriptions where livemode = false;

-- (b) Remove customer mappings with no remaining LIVE subscription (test customers
--     cannot be reused by Stripe LIVE anyway). Expect ~1 row.
delete from public.billing_customers bc
 where not exists (
   select 1 from public.billing_subscriptions bs
    where bs.stripe_customer_id = bc.stripe_customer_id and bs.livemode = true
 );

-- (c) Clear TEST webhook idempotency markers (0 here; safe during test→live cutover).
delete from public.stripe_webhook_events;

-- VERIFY before committing — the first must be 0, and the cloud/auth counts MUST
-- equal the Step 2 preflight values exactly:
select
  (select count(*) from public.billing_subscriptions where livemode = false) as remaining_test_subs, -- expect 0
  (select count(*) from auth.users)                     as auth_users,
  (select count(*) from public.cloud_canvases)          as cloud_canvases,
  (select count(*) from public.cloud_assets)            as cloud_assets,
  (select count(*) from public.cloud_canvas_asset_refs) as cloud_canvas_asset_refs;

-- If remaining_test_subs = 0 AND auth/cloud counts are unchanged:  commit;
-- If ANYTHING else changed:                                        rollback;
commit;
```

## Step 4 — Switch entitlement mode to LIVE

```sql
update public.billing_config set expected_livemode = true, updated_at = now() where id = 1;
select * from public.billing_config;     -- expected_livemode = true
select public.expected_livemode();        -- expect true
```

## Step 5 — Post-cutover verification

```sql
-- No test subscriptions remain, and none could grant Pro:
select count(*) as test_subs from public.billing_subscriptions where livemode = false;          -- 0
select count(*) as test_pro  from public.billing_subscriptions
 where livemode = false and plan_key = 'pro' and status in ('active','trialing');                -- 0

-- DATA SAFETY: these MUST equal the Step 2 preflight values.
select
  (select count(*) from auth.users)                     as auth_users,
  (select count(*) from public.cloud_canvases)          as cloud_canvases,
  (select count(*) from public.cloud_assets)            as cloud_assets,
  (select count(*) from public.cloud_canvas_asset_refs) as cloud_canvas_asset_refs;
```

If any `auth.users` / cloud count changed from Step 2, **stop and investigate** —
the cleanup should only ever remove billing rows.

---

## After cutover — local development discipline

This project is now **production**. Consequences of the reuse decision:

- Local development shares this database. **Do not create Stripe TEST
  subscriptions against it anymore** — no test billing writes to the production
  billing tables.
- With `expected_livemode = true`, a test subscription (`livemode = false`) would
  not grant Pro anyway (the DB guard blocks it), but avoid writing test billing
  rows to production regardless.
- Keep `STRIPE_BILLING_MODE=test` as the local default in code, but do not point
  local billing flows at this project. If you later want a real test sandbox,
  create a separate development Supabase project for it.

Continue with Vercel env + Stripe LIVE per
[`LAUNCH_CHECKLIST.md`](./LAUNCH_CHECKLIST.md),
[`STRIPE_PRODUCTION_CUTOVER.md`](./STRIPE_PRODUCTION_CUTOVER.md), and
[`SUPABASE_PRODUCTION.md`](./SUPABASE_PRODUCTION.md).
