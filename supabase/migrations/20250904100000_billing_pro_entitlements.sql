-- Phase 2.0D-A — Server-authoritative billing + Pro entitlements.
--
-- Adds server-OWNED billing state (customers, subscriptions, processed webhook
-- events) and rewires the cloud-canvas cap so Pro = unlimited cloud canvases and
-- Free = 3 (unchanged), enforced SERVER-SIDE. Authority chain:
--
--   Stripe subscription -> signature-verified webhook (service role) ->
--   billing_subscriptions.plan_key -> is_pro() -> create_cloud_canvas cap -> UI
--
-- The browser can NEVER write these rows or set plan_key='pro'; it can only READ
-- a sanitized summary via get_billing_status(). plan_key='pro' is written ONLY by
-- the server AFTER it validates the Stripe Price against the approved allowlist
-- (kept in app env, not in the DB), so the database can trust plan_key without
-- knowing the price ids.
--
-- This is a NEW migration; it does NOT rewrite 2.0C history. create_cloud_canvas
-- is CREATE OR REPLACE'd with the SAME signature — only the cap branch changes.

-- ===========================================================================
-- Tables (server-owned)
-- ===========================================================================

-- One Supabase user <-> one Stripe Customer.
create table if not exists public.billing_customers (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Authoritative subscription state. Historical rows may accumulate (a user can
-- have an old canceled subscription and a new active one) — is_pro() looks for
-- ANY currently-granting row, so that is fine.
create table if not exists public.billing_subscriptions (
  stripe_subscription_id text primary key,
  user_id                uuid not null references auth.users (id) on delete cascade,
  stripe_customer_id     text not null,
  stripe_price_id        text,
  plan_key               text not null default 'none',   -- 'pro' ONLY for an approved price
  billing_interval       text,                            -- 'monthly' | 'yearly' | null
  status                 text not null default 'incomplete',
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  livemode               boolean not null default false,
  last_event_created     bigint,                          -- stripe event.created (unix secs), for ordering
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists billing_subscriptions_user_idx
  on public.billing_subscriptions (user_id);
create index if not exists billing_subscriptions_customer_idx
  on public.billing_subscriptions (stripe_customer_id);

-- Processed webhook event ids, for idempotent replay handling.
create table if not exists public.stripe_webhook_events (
  stripe_event_id text primary key,
  event_type      text not null,
  event_created   bigint,
  processed_at    timestamptz not null default now()
);

-- ===========================================================================
-- RLS — billing tables are SERVER-OWNED
-- ===========================================================================
-- Enable RLS and add NO anon/authenticated policies: with RLS on and no policy
-- (and no base-table grant), regular users cannot read or write these tables at
-- all. The ONLY user-facing read path is the SECURITY DEFINER get_billing_status()
-- (own row, sanitized). Writes happen only via the service role (server routes,
-- which bypass RLS) and the SECURITY DEFINER apply RPC below.

alter table public.billing_customers     enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.stripe_webhook_events  enable row level security;

-- Defense in depth: ensure anon/authenticated hold no direct table privileges
-- (RLS-with-no-policy already denies them; this makes the intent explicit).
revoke all on public.billing_customers     from anon, authenticated;
revoke all on public.billing_subscriptions from anon, authenticated;
revoke all on public.stripe_webhook_events  from anon, authenticated;

-- The service role manages all billing state (used only by server routes).
grant select, insert, update, delete on public.billing_customers     to service_role;
grant select, insert, update, delete on public.billing_subscriptions to service_role;
grant select, insert, update, delete on public.stripe_webhook_events  to service_role;

-- ===========================================================================
-- Entitlement functions
-- ===========================================================================

-- Is this user currently Pro? True iff they have a subscription the server marked
-- plan_key='pro' (approved price) whose status still grants access. 'active'
-- covers the cancel_at_period_end window: Stripe keeps status 'active' until the
-- period actually ends, then sends a delete/updated event flipping it to canceled.
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
  );
$$;
-- Internal helper only — never exposed to clients (an arbitrary-uid form would
-- leak another user's Pro status). create_cloud_canvas (SECURITY DEFINER, same
-- owner) can still call it.
revoke all on function public.is_pro(uuid) from public, anon, authenticated;

-- Sanitized billing summary for the CURRENT user (auth.uid()). The only
-- client-facing billing read path. Never accepts a user id from the caller.
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
begin
  if v_uid is null then
    return;  -- no rows for an unauthenticated caller
  end if;

  v_has_customer := exists (
    select 1 from public.billing_customers where user_id = v_uid
  );

  -- Prefer an active Pro-granting subscription (latest period end); otherwise the
  -- most recently updated row, purely so the UI can show a status (past_due, etc.).
  select * into v_sub
    from public.billing_subscriptions
   where user_id = v_uid
     and plan_key = 'pro'
     and status in ('active', 'trialing')
   order by current_period_end desc nulls last
   limit 1;

  if not found then
    select * into v_sub
      from public.billing_subscriptions
     where user_id = v_uid
     order by updated_at desc
     limit 1;
  end if;

  plan := case
            when v_sub.stripe_subscription_id is not null
             and v_sub.plan_key = 'pro'
             and v_sub.status in ('active', 'trialing')
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

-- ===========================================================================
-- Webhook apply RPC (server/service-role only)
-- ===========================================================================
-- One atomic transaction handling: user resolution, idempotency (event id),
-- out-of-order protection (event.created), and the subscription upsert. Called
-- ONLY by the server webhook via the service role, AFTER Stripe signature
-- verification and price-allowlist validation. The server passes plan_key='pro'
-- ONLY when the price matched the approved monthly/yearly allowlist, else 'none'.
-- Returns a short status: applied | duplicate | stale | unmapped | no_subscription.
create or replace function public.apply_stripe_subscription_event(
  p_event_id             text,
  p_event_type           text,
  p_event_created        bigint,
  p_subscription_id      text,
  p_user_id              uuid,
  p_customer_id          text,
  p_price_id             text,
  p_plan_key             text,
  p_billing_interval     text,
  p_status               text,
  p_current_period_end   timestamptz,
  p_cancel_at_period_end boolean,
  p_livemode             boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid              uuid := p_user_id;
  v_new_event        integer;
  v_existing_created bigint;
begin
  -- 1) Resolve the user BEFORE recording the event. If unresolvable we record
  --    nothing and signal the caller to return non-2xx so Stripe retries later
  --    (by which time the checkout customer mapping / metadata exists).
  if v_uid is null and p_customer_id is not null then
    select user_id into v_uid
      from public.billing_customers
     where stripe_customer_id = p_customer_id;
  end if;
  if v_uid is null then
    return 'unmapped';
  end if;

  -- 2) Idempotency: record the event id; an exact replay is a harmless no-op.
  insert into public.stripe_webhook_events (stripe_event_id, event_type, event_created)
  values (p_event_id, p_event_type, p_event_created)
  on conflict (stripe_event_id) do nothing;
  get diagnostics v_new_event = row_count;  -- 1 inserted, 0 duplicate
  if v_new_event = 0 then
    return 'duplicate';
  end if;

  if p_subscription_id is null then
    return 'no_subscription';  -- event recorded; nothing to upsert (e.g. one-off session)
  end if;

  -- 3) Out-of-order protection: never let an older event overwrite newer state.
  select last_event_created into v_existing_created
    from public.billing_subscriptions
   where stripe_subscription_id = p_subscription_id;
  if v_existing_created is not null
     and p_event_created is not null
     and p_event_created < v_existing_created then
    return 'stale';
  end if;

  -- 4) Upsert the authoritative subscription row.
  insert into public.billing_subscriptions (
    stripe_subscription_id, user_id, stripe_customer_id, stripe_price_id, plan_key,
    billing_interval, status, current_period_end, cancel_at_period_end, livemode,
    last_event_created, updated_at
  ) values (
    p_subscription_id, v_uid, p_customer_id, p_price_id, coalesce(p_plan_key, 'none'),
    p_billing_interval, coalesce(p_status, 'incomplete'), p_current_period_end,
    coalesce(p_cancel_at_period_end, false), coalesce(p_livemode, false),
    p_event_created, now()
  )
  on conflict (stripe_subscription_id) do update set
    user_id              = excluded.user_id,
    stripe_customer_id   = excluded.stripe_customer_id,
    stripe_price_id      = excluded.stripe_price_id,
    plan_key             = excluded.plan_key,
    billing_interval     = excluded.billing_interval,
    status               = excluded.status,
    current_period_end   = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    livemode             = excluded.livemode,
    last_event_created   = excluded.last_event_created,
    updated_at           = now();

  return 'applied';
end;
$$;
revoke all on function public.apply_stripe_subscription_event(
  text, text, bigint, text, uuid, text, text, text, text, text, timestamptz, boolean, boolean
) from public, anon, authenticated;
grant execute on function public.apply_stripe_subscription_event(
  text, text, bigint, text, uuid, text, text, text, text, text, timestamptz, boolean, boolean
) to service_role;

-- ===========================================================================
-- Cloud cap: Pro = unlimited, Free = 3 (server-authoritative)
-- ===========================================================================
-- CREATE OR REPLACE with the SAME signature/return type as 2.0C. Only the cap
-- branch changes: Pro (server-authoritative is_pro) has no cloud-count cap; Free
-- stays at 3, still race-safe via the per-user advisory lock. update/delete are
-- unchanged, so a downgraded Free user with >3 cloud canvases keeps every
-- existing canvas fully readable, editable and syncable — only NEW creation is
-- blocked while at/above the Free limit.
create or replace function public.create_cloud_canvas(
  p_title          text,
  p_document       jsonb,
  p_schema_version integer,
  p_asset_shas     text[]
) returns public.cloud_canvases
language plpgsql security definer set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_count integer;
  v_row   public.cloud_canvases;
  v_sha   text;
begin
  if v_uid is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;

  -- Serialize concurrent creates for this user so two requests can't both pass
  -- the cap check (3 -> 5). Released automatically at transaction end.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  -- Free is capped at 3 cloud canvases; Pro (server-authoritative) is unlimited.
  if not public.is_pro(v_uid) then
    select count(*) into v_count from public.cloud_canvases where owner_id = v_uid;
    if v_count >= 3 then
      raise exception 'cloud_limit_reached' using errcode = 'P0001';
    end if;
  end if;

  insert into public.cloud_canvases (owner_id, title, document, schema_version, revision)
  values (v_uid, coalesce(p_title, 'Untitled'), coalesce(p_document, '{}'::jsonb),
          coalesce(p_schema_version, 1), 1)
  returning * into v_row;

  if p_asset_shas is not null then
    foreach v_sha in array p_asset_shas loop
      insert into public.cloud_canvas_asset_refs (canvas_id, owner_id, asset_sha256)
      values (v_row.id, v_uid, v_sha)
      on conflict do nothing;
    end loop;
  end if;

  return v_row;
end;
$$;

-- CREATE OR REPLACE preserves existing privileges, but re-affirm intent.
grant execute on function public.create_cloud_canvas(text, jsonb, integer, text[]) to authenticated;
