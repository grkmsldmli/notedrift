-- iOS Phase 2 hardening — Apple notification user-binding authority.
--
-- Tightens apply_apple_subscription() (SAME signature; CREATE OR REPLACE):
--
--   FIRST binding (original_transaction_id -> user_id) may be created ONLY by the
--   authenticated device reconciliation path (POST /api/billing/apple/verify),
--   which passes a non-null p_user_id AFTER it has verified the Apple JWS and that
--   appAccountToken == authenticated user. App Store Server Notifications (p_user_id
--   null) may ONLY update an ALREADY-mapped subscription, resolved by
--   original_transaction_id. A notification NEVER creates a user binding from
--   appAccountToken alone.
--
-- Also fixes notification retryability: an "unmapped" notification must NOT be
-- recorded in apple_notification_events (that would make a later, now-mappable
-- retry look like a "duplicate" and never apply). We resolve the mapping FIRST and
-- only then record idempotency. The notifications route returns a retryable non-2xx
-- for "unmapped" so Apple retries after the authenticated purchase creates the map.
--
-- Preserved unchanged: signature, product/bundle/environment checks (done in the
-- app layer before calling this), the stale signed_date guard, idempotency AFTER a
-- valid mapping, and original_transaction_id as the row key/authority. No table or
-- column changes; nothing is deleted. p_app_account_token is still STORED for
-- reference but is NEVER used to derive user authority.

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
  v_uid          uuid;
  v_new_event    integer;
  v_last_signed  bigint;
begin
  -- 1) Resolve the user with STRICT authority rules (BEFORE any idempotency write).
  if p_user_id is not null then
    -- Authenticated device reconciliation (/api/billing/apple/verify). The route
    -- has already verified the JWS and that appAccountToken == authenticated user,
    -- so this path MAY create the first original_transaction_id -> user mapping.
    v_uid := p_user_id;
  else
    -- Notification path: may ONLY update an EXISTING mapping. Never bind a new user
    -- from appAccountToken alone.
    select user_id into v_uid
      from public.billing_apple_subscriptions
     where original_transaction_id = p_original_transaction_id;
    if v_uid is null then
      -- No canonical mapping yet — leave the notification RETRYABLE (do not record
      -- it as processed). The authenticated purchase verification will create the
      -- mapping, and Apple's retry will then apply.
      return 'unmapped';
    end if;
  end if;

  -- 2) Idempotency for App Store Server Notifications — only AFTER a real mapping
  --    exists (the verify path passes NULL and skips this).
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
    -- user_id is NEVER reassigned here: once the canonical mapping exists it is the
    -- authority. (The verify path only ever reconciles the same user's own token.)
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
