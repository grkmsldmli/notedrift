-- iOS Phase 2 — Apple StoreKit 2 subscriptions + unified Pro entitlement.
--
-- Adds server-OWNED Apple subscription state (separate from the Stripe tables, per
-- the "don't overload Stripe tables" rule) and unifies entitlement so:
--
--   Pro = active verified Stripe subscription  OR  active verified Apple subscription
--
-- Authority chain (Apple):
--   StoreKit transaction -> device JWS -> server cryptographic verification
--   (@apple/app-store-server-library) -> appAccountToken == authenticated Supabase
--   user -> apply_apple_subscription() (service role) -> billing_apple_subscriptions
--   -> is_pro() -> create_cloud_canvas cap -> UI
--
-- The browser can NEVER write these rows. is_pro()/get_billing_status() are
-- CREATE OR REPLACE'd with the SAME signatures/return columns as the mode-guard
-- migration — only an Apple branch is added. No Stripe table/column is changed and
-- no data is deleted. Mode-awareness reuses expected_livemode(): a live database
-- (expected_livemode=true) trusts only Apple `Production` rows; a test database
-- trusts only `Sandbox` rows, mirroring the Stripe livemode guard.

-- ===========================================================================
-- Tables (server-owned)
-- ===========================================================================

-- One row per Apple subscription, keyed by the stable originalTransactionId.
-- Historical/expired rows may remain; is_pro() looks for ANY currently-granting
-- row, so that is fine.
create table if not exists public.billing_apple_subscriptions (
  original_transaction_id text primary key,
  user_id                 uuid not null references auth.users (id) on delete cascade,
  latest_transaction_id   text,
  product_id              text not null,
  billing_interval        text,                        -- 'monthly' | 'yearly' | null
  status                  text not null default 'active',
  environment             text not null default 'Production',  -- 'Sandbox' | 'Production'
  purchased_at            timestamptz,
  expires_at              timestamptz,
  revoked_at              timestamptz,
  auto_renew              boolean not null default true,
  app_account_token       uuid,
  last_signed_date        bigint,                       -- ms; ordering / stale-guard
  last_notification_type  text,
  last_notification_at    timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists billing_apple_subscriptions_user_idx
  on public.billing_apple_subscriptions (user_id);
create index if not exists billing_apple_subscriptions_token_idx
  on public.billing_apple_subscriptions (app_account_token);

-- Processed App Store Server Notification uuids, for idempotent replay handling
-- (mirrors stripe_webhook_events).
create table if not exists public.apple_notification_events (
  notification_uuid text primary key,
  notification_type text,
  subtype           text,
  signed_date       bigint,
  processed_at      timestamptz not null default now()
);

-- ===========================================================================
-- RLS — Apple billing tables are SERVER-OWNED (identical posture to Stripe)
-- ===========================================================================
alter table public.billing_apple_subscriptions enable row level security;
alter table public.apple_notification_events    enable row level security;

revoke all on public.billing_apple_subscriptions from anon, authenticated;
revoke all on public.apple_notification_events    from anon, authenticated;

grant select, insert, update, delete on public.billing_apple_subscriptions to service_role;
grant select, insert, update, delete on public.apple_notification_events    to service_role;

-- ===========================================================================
-- is_pro() — Stripe OR Apple, both mode-aware
-- ===========================================================================
-- Same signature as the mode-guard migration. Adds an Apple branch: an Apple row
-- grants Pro when it is not revoked, not expired, and its environment matches the
-- configured mode. create_cloud_canvas() calls this, so the Free=3 cloud cap now
-- honors Apple Pro too with no change there.
create or replace function public.is_pro(p_uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    exists (
      select 1
        from public.billing_subscriptions
       where user_id = p_uid
         and plan_key = 'pro'
         and status in ('active', 'trialing')
         and livemode = public.expected_livemode()
    )
    or exists (
      select 1
        from public.billing_apple_subscriptions
       where user_id = p_uid
         and revoked_at is null
         and (expires_at is null or expires_at > now())
         and (environment = 'Production') = public.expected_livemode()
    );
$$;
revoke all on function public.is_pro(uuid) from public, anon, authenticated;

-- ===========================================================================
-- get_billing_status() — Apple-aware, SAME return columns (backwards compatible)
-- ===========================================================================
-- Precedence: an active Stripe Pro (existing web behavior, unchanged) first; then
-- an active Apple Pro; otherwise the latest Stripe row for status display. Apple
-- subscribers have no billing_customers row, so can_manage_billing stays false for
-- them (correct — Apple subscriptions are managed in the App Store, not Stripe).
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
  v_apple public.billing_apple_subscriptions;
  v_has_customer boolean;
  v_expected boolean := public.expected_livemode();
begin
  if v_uid is null then
    return;  -- no rows for an unauthenticated caller
  end if;

  v_has_customer := exists (
    select 1 from public.billing_customers where user_id = v_uid
  );

  -- 1) Active Stripe Pro (unchanged precedence / web behavior).
  select * into v_sub
    from public.billing_subscriptions
   where user_id = v_uid
     and plan_key = 'pro'
     and status in ('active', 'trialing')
     and livemode = v_expected
   order by current_period_end desc nulls last
   limit 1;
  if found then
    plan := 'pro';
    subscription_status  := v_sub.status;
    billing_interval     := v_sub.billing_interval;
    current_period_end   := v_sub.current_period_end;
    cancel_at_period_end := coalesce(v_sub.cancel_at_period_end, false);
    can_manage_billing   := v_has_customer;
    return next;
    return;
  end if;

  -- 2) Active Apple Pro.
  select * into v_apple
    from public.billing_apple_subscriptions
   where user_id = v_uid
     and revoked_at is null
     and (expires_at is null or expires_at > now())
     and (environment = 'Production') = v_expected
   order by expires_at desc nulls last
   limit 1;
  if found then
    plan := 'pro';
    subscription_status  := coalesce(v_apple.status, 'active');
    billing_interval     := v_apple.billing_interval;
    current_period_end   := v_apple.expires_at;
    cancel_at_period_end := coalesce(not v_apple.auto_renew, false);
    can_manage_billing   := v_has_customer;  -- Apple managed in App Store (false unless they also have Stripe)
    return next;
    return;
  end if;

  -- 3) Fallback: latest in-mode Stripe row purely for status display (unchanged).
  select * into v_sub
    from public.billing_subscriptions
   where user_id = v_uid
     and livemode = v_expected
   order by updated_at desc
   limit 1;

  plan := case
            when v_sub.stripe_subscription_id is not null
             and v_sub.plan_key = 'pro'
             and v_sub.status in ('active', 'trialing')
             and v_sub.livemode = v_expected
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
-- apply_apple_subscription() — server/service-role only, atomic + replay-safe
-- ===========================================================================
-- Called ONLY by the server (verify endpoint + notifications endpoint) via the
-- service role, AFTER cryptographic verification of the Apple signed payload. The
-- caller passes only verified, extracted values. Idempotent (notification uuid),
-- replay-safe (signed_date ordering). Returns: applied | duplicate | stale | unmapped.
create or replace function public.apply_apple_subscription(
  p_user_id                uuid,
  p_original_transaction_id text,
  p_latest_transaction_id  text,
  p_product_id             text,
  p_billing_interval       text,
  p_status                 text,
  p_environment            text,
  p_purchased_at           timestamptz,
  p_expires_at             timestamptz,
  p_revoked_at             timestamptz,
  p_auto_renew             boolean,
  p_app_account_token      uuid,
  p_signed_date            bigint,
  p_notification_uuid      text,
  p_notification_type      text,
  p_notification_subtype   text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid := p_user_id;
  v_new_event    integer;
  v_last_signed  bigint;
begin
  -- 1) Idempotency for App Store Server Notifications (verify endpoint passes NULL).
  if p_notification_uuid is not null then
    insert into public.apple_notification_events
      (notification_uuid, notification_type, subtype, signed_date)
    values (p_notification_uuid, p_notification_type, p_notification_subtype, p_signed_date)
    on conflict (notification_uuid) do nothing;
    get diagnostics v_new_event = row_count;
    if v_new_event = 0 then
      return 'duplicate';
    end if;
  end if;

  -- 2) Resolve the user. The verify endpoint supplies the authenticated user id;
  --    notifications supply the (verified) appAccountToken and/or resolve via the
  --    existing row for this subscription.
  if v_uid is null then
    select user_id into v_uid
      from public.billing_apple_subscriptions
     where original_transaction_id = p_original_transaction_id;
  end if;
  if v_uid is null then
    v_uid := p_app_account_token;
  end if;
  if v_uid is null then
    return 'unmapped';
  end if;

  -- 3) Stale-guard: never let an older signed payload overwrite newer state.
  select last_signed_date into v_last_signed
    from public.billing_apple_subscriptions
   where original_transaction_id = p_original_transaction_id;
  if v_last_signed is not null
     and p_signed_date is not null
     and p_signed_date < v_last_signed then
    return 'stale';
  end if;

  -- 4) Upsert the authoritative Apple subscription row.
  insert into public.billing_apple_subscriptions (
    original_transaction_id, user_id, latest_transaction_id, product_id,
    billing_interval, status, environment, purchased_at, expires_at, revoked_at,
    auto_renew, app_account_token, last_signed_date, last_notification_type,
    last_notification_at, updated_at
  ) values (
    p_original_transaction_id, v_uid, p_latest_transaction_id, p_product_id,
    p_billing_interval, coalesce(p_status, 'active'), coalesce(p_environment, 'Production'),
    p_purchased_at, p_expires_at, p_revoked_at, coalesce(p_auto_renew, true),
    p_app_account_token, p_signed_date, p_notification_type,
    case when p_notification_uuid is not null then now() else null end, now()
  )
  on conflict (original_transaction_id) do update set
    user_id                = excluded.user_id,
    latest_transaction_id  = excluded.latest_transaction_id,
    product_id             = excluded.product_id,
    billing_interval       = excluded.billing_interval,
    status                 = excluded.status,
    environment            = excluded.environment,
    purchased_at           = coalesce(excluded.purchased_at, public.billing_apple_subscriptions.purchased_at),
    expires_at             = excluded.expires_at,
    revoked_at             = excluded.revoked_at,
    auto_renew             = excluded.auto_renew,
    app_account_token      = coalesce(excluded.app_account_token, public.billing_apple_subscriptions.app_account_token),
    last_signed_date       = excluded.last_signed_date,
    last_notification_type = coalesce(excluded.last_notification_type, public.billing_apple_subscriptions.last_notification_type),
    last_notification_at   = coalesce(excluded.last_notification_at, public.billing_apple_subscriptions.last_notification_at),
    updated_at             = now();

  return 'applied';
end;
$$;
revoke all on function public.apply_apple_subscription(
  uuid, text, text, text, text, text, text, timestamptz, timestamptz, timestamptz,
  boolean, uuid, bigint, text, text, text
) from public, anon, authenticated;
grant execute on function public.apply_apple_subscription(
  uuid, text, text, text, text, text, text, timestamptz, timestamptz, timestamptz,
  boolean, uuid, bigint, text, text, text
) to service_role;
