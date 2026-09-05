-- Phase 3.0A — Billing test/live MODE guard (defense in depth).
--
-- The app layer already refuses to WRITE a wrong-mode subscription: checkout,
-- confirm-checkout and the webhook all require Stripe object/event.livemode to
-- equal the configured expected mode, and the Stripe key itself must match the
-- mode. This migration adds a DATABASE backstop so entitlement is mode-aware even
-- for rows that predate that guard (e.g. Stripe TEST rows created during 2.0D
-- development) or that were somehow written directly.
--
-- Invariant added: a subscription grants Pro ONLY when its `livemode` matches the
-- database's configured expected mode. That expected mode lives in a single-row
-- `billing_config` table, defaulting to FALSE (test) so this migration is
-- NON-BREAKING for the current/development project and for local test billing.
-- The production project is switched to live with ONE documented statement:
--
--     update public.billing_config set expected_livemode = true;
--
-- After that, a leftover TEST subscription (livemode=false) can never grant
-- production Pro, with no destructive cleanup required.
--
-- This is a NEW migration. It does NOT rewrite the 2.0D migration. is_pro() and
-- get_billing_status() are CREATE OR REPLACE'd with the SAME signatures/return
-- types — only a livemode predicate is added. No table/column is dropped and no
-- data is deleted.

-- ===========================================================================
-- Single-row mode configuration (server-owned)
-- ===========================================================================
-- One row, pinned by a constant primary key. RLS on with no anon/authenticated
-- policy or grant: only the service role (or a dashboard/SQL-editor superuser)
-- can read or change it. The SECURITY DEFINER helper below reads it as owner.
create table if not exists public.billing_config (
  id               integer primary key default 1 check (id = 1),
  expected_livemode boolean not null default false,
  updated_at       timestamptz not null default now()
);

insert into public.billing_config (id, expected_livemode)
values (1, false)
on conflict (id) do nothing;

alter table public.billing_config enable row level security;
revoke all on public.billing_config from anon, authenticated;
grant select, insert, update, delete on public.billing_config to service_role;

-- The database's expected livemode. Defaults to FALSE (test) if the row is absent,
-- so entitlement stays fail-safe (a wrong-mode row grants nothing) rather than
-- fail-open. SECURITY DEFINER + owner read bypasses RLS on its own table, exactly
-- like is_pro() reads billing_subscriptions today.
create or replace function public.expected_livemode()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select expected_livemode from public.billing_config where id = 1), false);
$$;
revoke all on function public.expected_livemode() from public, anon;
grant execute on function public.expected_livemode() to authenticated, service_role;

-- ===========================================================================
-- is_pro() — now mode-aware
-- ===========================================================================
-- Same signature/behavior as 2.0D, plus: the granting subscription's livemode
-- must equal the configured expected mode. create_cloud_canvas() calls this, so
-- the cloud cap inherits the mode guard automatically (no change needed there).
create or replace function public.is_pro(p_uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
      from public.billing_subscriptions
     where user_id = p_uid
       and plan_key = 'pro'
       and status in ('active', 'trialing')
       and livemode = public.expected_livemode()
  );
$$;
revoke all on function public.is_pro(uuid) from public, anon, authenticated;

-- ===========================================================================
-- get_billing_status() — now mode-aware
-- ===========================================================================
-- Same return columns as 2.0D. Both the Pro-preferring select and the
-- status-display fallback are scoped to the expected mode, so the sanitized
-- client status only ever reflects current-mode subscriptions. A wrong-mode row
-- reads as Free (fail closed) and never leaks its status into the UI.
create or replace function public.get_billing_status()
returns table (
  plan                 text,
  subscription_status  text,
  billing_interval     text,
  current_period_end   timestamptz,
  cancel_at_period_end boolean,
  can_manage_billing   boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_uid uuid := auth.uid();
  v_sub public.billing_subscriptions;
  v_has_customer boolean;
  v_expected_livemode boolean := public.expected_livemode();
begin
  if v_uid is null then
    return;  -- no rows for an unauthenticated caller
  end if;

  v_has_customer := exists (
    select 1 from public.billing_customers where user_id = v_uid
  );

  -- Prefer an active Pro-granting subscription IN THE EXPECTED MODE (latest period
  -- end); otherwise the most recently updated in-mode row, purely for status.
  select * into v_sub
    from public.billing_subscriptions
   where user_id = v_uid
     and plan_key = 'pro'
     and status in ('active', 'trialing')
     and livemode = v_expected_livemode
   order by current_period_end desc nulls last
   limit 1;

  if not found then
    select * into v_sub
      from public.billing_subscriptions
     where user_id = v_uid
       and livemode = v_expected_livemode
     order by updated_at desc
     limit 1;
  end if;

  plan := case
            when v_sub.stripe_subscription_id is not null
             and v_sub.plan_key = 'pro'
             and v_sub.status in ('active', 'trialing')
             and v_sub.livemode = v_expected_livemode
            then 'pro' else 'free'
          end;
  subscription_status  := v_sub.status;
  billing_interval     := v_sub.billing_interval;
  current_period_end   := v_sub.current_period_end;
  cancel_at_period_end := coalesce(v_sub.cancel_at_period_end, false);
  can_manage_billing   := v_has_customer;
  return next;
end;
$$;
grant execute on function public.get_billing_status() to authenticated;
revoke all on function public.get_billing_status() from public, anon;
