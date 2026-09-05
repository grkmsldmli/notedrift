# Billing State Audit & Test→Live DB Strategy — NoteDrift

How NoteDrift keeps a **TEST** Stripe subscription from ever granting **production
Pro**, the architecture decision behind it, and the (human-run, non-destructive)
SQL to audit and — only if you choose the reuse path — clean up test billing state.

> **Nothing in this document is executed automatically.** The preflight queries
> are read-only. The cleanup queries are clearly labeled and must be reviewed and
> run by a human. Never delete auth users, cloud canvases, or assets.

> **⚑ CHOSEN DECISION (2026-09-05): reuse the existing project
> `kmgcmoaveppzhjezyqax` as production** — i.e. the "Alternative" column below, NOT
> the fresh-project recommendation. The fresh-project path stays documented here as
> the theoretically safest option, but it is **not** the path being taken. Because
> the existing project already holds Stripe TEST billing state, the mode-guard
> migration, the TEST-billing cleanup, and `expected_livemode = true` are all
> **required**. The exact, tailored, transactional SQL-Editor runbook for this
> decision is [`EXISTING_PROJECT_CUTOVER.md`](./EXISTING_PROJECT_CUTOVER.md).

---

## The risk

`billing_subscriptions` carries a `livemode` column, but the 2.0D `is_pro()` and
`get_billing_status()` did **not** consider it. So a Stripe **TEST** subscription
(`livemode = false`, `plan_key = 'pro'`, `status = 'active'`) would grant Pro even
in a live production deployment. The development project already contains such test
rows. Also, `billing_customers` maps one Supabase user to exactly one Stripe
customer id — but a **test** customer and a **live** customer are different Stripe
objects, so a project that has both modes' customers for the same user is
ambiguous.

## The decision (safest + simplest for a small launch)

**Primary architecture: environment isolation (option B) — a separate Supabase
project per Stripe mode**, so each database is single-mode:

- **Production** = a **fresh Supabase project** paired with **Stripe LIVE**.
- **Development/test** = the **existing project** (which holds the 2.0D test
  billing rows) paired with **Stripe TEST**.

Why this is safest **and** simplest:

- A fresh production project starts with **zero billing rows**, so a test
  subscription cannot possibly grant production Pro — there is nothing to clean up
  and **no destructive operation is ever required**.
- `billing_customers`' one-customer-per-user mapping stays correct, because each
  project only ever sees one mode's customers.
- The existing project keeps all its data and simply becomes the dev/test project.

**Defense-in-depth: a mode-aware DB guard (a small part of option A)** — migration
`supabase/migrations/20250905120000_billing_mode_guard.sql`:

- Adds a single-row `billing_config(expected_livemode)` (default `false` = test).
- Makes `is_pro()` and `get_billing_status()` grant Pro **only** from
  subscriptions whose `livemode` matches `expected_livemode`.
- `create_cloud_canvas()` calls `is_pro()`, so the cloud cap inherits the guard.

This backstop means that **even if** you instead reuse the current project as
production, a leftover test subscription (`livemode = false`) cannot grant Pro once
the project is switched to live mode:

```sql
-- Production project only, after review:
update public.billing_config set expected_livemode = true;
```

The default (`false`) is non-breaking for the current/dev project and for local
test billing. This is why the change ships as a **new** migration and does not
rewrite the 2.0D migration.

### Recommended vs alternative

| | Recommended: fresh prod project | Alternative: reuse current project as prod |
|---|---|---|
| Test rows in prod DB | none (empty by construction) | present until cleaned |
| Destructive cleanup needed | **no** | yes (test billing rows) — human-run |
| Mode guard still applied | yes (defense in depth) | yes (**required** — the primary protection) |
| Risk | lowest | acceptable only with careful cleanup + `expected_livemode=true` |

Choose the fresh-project path unless you have a specific reason not to.

---

## Read-only PREFLIGHT (safe to run anywhere)

Run these in the Supabase SQL Editor to understand the billing state of a project.
They only SELECT.

```sql
-- 1) Billing rows by Stripe mode.
select 'billing_subscriptions' as tbl, livemode, count(*) as rows
  from public.billing_subscriptions
 group by livemode
 order by livemode;

-- 2) Users who are currently 'pro' from a TEST subscription (livemode = false).
--    On a live project these must NOT be granted Pro.
select user_id, stripe_subscription_id, plan_key, status, billing_interval, current_period_end
  from public.billing_subscriptions
 where plan_key = 'pro'
   and status in ('active', 'trialing')
   and livemode = false;

-- 3) Customer mappings with no LIVE subscription (i.e. likely test-only customers).
select bc.user_id, bc.stripe_customer_id
  from public.billing_customers bc
 where not exists (
   select 1 from public.billing_subscriptions bs
    where bs.stripe_customer_id = bc.stripe_customer_id
      and bs.livemode = true
 );

-- 4) The database's configured expected mode (after the mode-guard migration).
select * from public.billing_config;

-- 5) Counts of the data we must NEVER delete (sanity — should be untouched).
select
  (select count(*) from public.cloud_canvases)            as cloud_canvases,
  (select count(*) from public.cloud_canvas_asset_refs)   as asset_refs;
```

Interpretation:

- If query (2) returns rows on a project you intend to use as **production**, those
  users would get Pro from a test subscription **unless** `expected_livemode = true`
  (mode guard) — or unless you cleaned the test rows. With the guard set to live,
  they are already denied Pro.
- On the **fresh production project**, queries (1)–(3) return nothing (empty DB).

---

## OPTIONAL CLEANUP — human review required · DO NOT run automatically

⚠️ **Only relevant if you reuse the current (test-data-containing) project as
production.** On the recommended fresh-project path, skip this entirely.

⚠️ These statements **DELETE only billing TEST state**. They must be reviewed and
run **by a human**, ideally after a database backup. They never touch
`auth.users`, `cloud_canvases`, `cloud_canvas_asset_refs`, storage assets, or any
user document.

```sql
-- === OPTIONAL CUTOVER CLEANUP (billing TEST state only) =====================
-- Review the PREFLIGHT output first. Run inside a transaction so you can inspect
-- and ROLLBACK if the counts look wrong.
begin;

-- (a) Remove TEST subscriptions (livemode = false). LIVE rows are untouched.
delete from public.billing_subscriptions
 where livemode = false;

-- (b) Remove customer mappings that have no remaining LIVE subscription.
--     (Test Stripe customers are useless against the live Stripe API.)
delete from public.billing_customers bc
 where not exists (
   select 1 from public.billing_subscriptions bs
    where bs.stripe_customer_id = bc.stripe_customer_id
      and bs.livemode = true
 );

-- (c) OPTIONAL: clear processed-webhook idempotency records. Harmless — these are
--     only event-id de-dupe markers and carry no user data. Leaving them is also
--     fine.
-- delete from public.stripe_webhook_events;

-- Inspect the row counts reported above, THEN choose:
-- commit;      -- keep the cleanup
-- rollback;    -- undo (default until you decide)
rollback;
```

After a real cleanup on a reused-as-production project, also run
`update public.billing_config set expected_livemode = true;` so the mode guard is
authoritative.

---

## Absolute rules (restated)

- No destructive migration, table drop, reset, or data reset was performed by this
  phase. The new migration only **adds** a table and **replaces two functions**
  with the same signatures.
- Never delete `auth.users`, `cloud_canvases`, `cloud_canvas_asset_refs`, storage
  assets, or user documents. Only billing **test** state may ever be cleaned, and
  only by a human, on the reuse path.
