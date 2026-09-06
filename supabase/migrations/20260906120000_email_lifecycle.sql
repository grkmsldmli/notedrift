-- Growth Engine 1 — Email lifecycle infrastructure.
--
-- Two server-owned tables:
--   * email_preferences — one row per user: marketing opt-in (default FALSE, never
--     pre-checked) + a per-user unsubscribe token + a denormalized email so the
--     lifecycle cron can send without re-reading auth.users.
--   * email_events — idempotency log: one row per (user_id, kind). One-shot
--     lifecycle emails use a bare kind ("welcome"); recurring ones use a period
--     key ("newsletter:2026-W36"). The PRIMARY KEY makes "send exactly once"
--     atomic via INSERT ... ON CONFLICT DO NOTHING.
--
-- BOTH tables are service-role only (RLS on, no anon/authenticated policy or
-- grant). All reads/writes go through server routes using the service-role admin
-- client — the browser can never read another user's token or forge an event.

create table if not exists public.email_preferences (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  email              text not null,
  marketing_opt_in   boolean not null default false,
  unsubscribe_token  text not null unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.email_preferences enable row level security;
revoke all on public.email_preferences from anon, authenticated;
grant select, insert, update, delete on public.email_preferences to service_role;

create index if not exists email_preferences_optin_idx
  on public.email_preferences (marketing_opt_in) where marketing_opt_in = true;

create table if not exists public.email_events (
  user_id  uuid not null references auth.users(id) on delete cascade,
  kind     text not null,
  sent_at  timestamptz not null default now(),
  primary key (user_id, kind)
);

alter table public.email_events enable row level security;
revoke all on public.email_events from anon, authenticated;
grant select, insert, update, delete on public.email_events to service_role;
