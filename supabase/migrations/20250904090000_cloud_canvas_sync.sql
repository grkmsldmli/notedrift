-- =============================================================================
-- NoteDrift — Phase 2.0C-A  Cloud Canvas Sync: data foundation
-- =============================================================================
-- Reviewable, reproducible migration. Apply with EITHER:
--   * Supabase Dashboard → SQL Editor → paste this file → Run, OR
--   * supabase db push   (after `supabase login` + `supabase link`)
--
-- Guarantees baked in here (server-authoritative — the app only ever holds the
-- browser publishable/anon key; NO service-role key is ever needed):
--   * RLS: a user reads/writes ONLY their own rows; anonymous has no access.
--   * The Free 3-cloud-canvas cap is enforced INSIDE the database, race-safe via
--     a per-user advisory transaction lock (not client count-then-insert).
--   * Writes go through SECURITY DEFINER RPCs; direct PostgREST INSERT/UPDATE of
--     cloud_canvases is denied, so the cap and revision checks cannot be bypassed.
--   * Optimistic concurrency: every update must present the exact expected
--     revision or it fails with a conflict (never last-write-wins).
--   * Images are content-addressed (sha256) and live in a PRIVATE Storage bucket;
--     the document JSON references assets, it never embeds base64 data URLs.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.cloud_canvases (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users (id) on delete cascade,
  title          text not null default 'Untitled',
  document       jsonb not null default '{}'::jsonb,   -- asset-externalized manifest
  schema_version integer not null default 1,
  revision       integer not null default 1,           -- optimistic concurrency token
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists cloud_canvases_owner_idx on public.cloud_canvases (owner_id);

-- Content-addressed, owner-scoped asset registry (dedupe by sha256 per owner).
create table if not exists public.cloud_assets (
  owner_id     uuid not null references auth.users (id) on delete cascade,
  sha256       text not null,
  mime         text not null,
  byte_size    bigint not null,
  storage_path text not null,                          -- '<owner_id>/<sha256>'
  created_at   timestamptz not null default now(),
  primary key (owner_id, sha256)
);

-- Which canvas references which asset (for reference-counted cleanup).
create table if not exists public.cloud_canvas_asset_refs (
  canvas_id    uuid not null references public.cloud_canvases (id) on delete cascade,
  owner_id     uuid not null references auth.users (id) on delete cascade,
  asset_sha256 text not null,
  primary key (canvas_id, asset_sha256)
);
create index if not exists cloud_refs_owner_sha_idx
  on public.cloud_canvas_asset_refs (owner_id, asset_sha256);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.cloud_canvases            enable row level security;
alter table public.cloud_assets              enable row level security;
alter table public.cloud_canvas_asset_refs   enable row level security;

-- cloud_canvases: read own; NO direct write policies -> INSERT/UPDATE/DELETE via
-- PostgREST are denied, forcing all writes through the SECURITY DEFINER RPCs.
drop policy if exists cc_select_own on public.cloud_canvases;
create policy cc_select_own on public.cloud_canvases
  for select to authenticated using (owner_id = auth.uid());

-- cloud_assets: owner may read/insert/delete own rows (the client uploads assets
-- and cleans up unreferenced ones; the create/update RPCs manage refs).
drop policy if exists ca_select_own on public.cloud_assets;
create policy ca_select_own on public.cloud_assets
  for select to authenticated using (owner_id = auth.uid());
drop policy if exists ca_insert_own on public.cloud_assets;
create policy ca_insert_own on public.cloud_assets
  for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists ca_delete_own on public.cloud_assets;
create policy ca_delete_own on public.cloud_assets
  for delete to authenticated using (owner_id = auth.uid());

-- refs: read own only (writes happen inside the RPCs).
drop policy if exists ref_select_own on public.cloud_canvas_asset_refs;
create policy ref_select_own on public.cloud_canvas_asset_refs
  for select to authenticated using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RPC: create_cloud_canvas — enforces the Free 3-cloud cap, race-safe
-- ---------------------------------------------------------------------------
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

  select count(*) into v_count from public.cloud_canvases where owner_id = v_uid;
  if v_count >= 3 then
    raise exception 'cloud_limit_reached' using errcode = 'P0001';
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

-- ---------------------------------------------------------------------------
-- RPC: update_cloud_canvas — optimistic concurrency (no last-write-wins)
-- ---------------------------------------------------------------------------
create or replace function public.update_cloud_canvas(
  p_id               uuid,
  p_expected_revision integer,
  p_title            text,
  p_document         jsonb,
  p_schema_version   integer,
  p_asset_shas       text[]
) returns public.cloud_canvases
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.cloud_canvases;
  v_sha text;
begin
  if v_uid is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;

  update public.cloud_canvases
     set title          = coalesce(p_title, title),
         document        = coalesce(p_document, document),
         schema_version  = coalesce(p_schema_version, schema_version),
         revision        = revision + 1,
         updated_at      = now()
   where id = p_id
     and owner_id = v_uid
     and revision = p_expected_revision
  returning * into v_row;

  if not found then
    if exists (select 1 from public.cloud_canvases where id = p_id and owner_id = v_uid) then
      raise exception 'revision_conflict' using errcode = 'P0001';   -- stale expected revision
    else
      raise exception 'not_found' using errcode = 'P0002';           -- not owned / missing
    end if;
  end if;

  -- Re-sync this canvas's asset references to the new set.
  delete from public.cloud_canvas_asset_refs where canvas_id = p_id;
  if p_asset_shas is not null then
    foreach v_sha in array p_asset_shas loop
      insert into public.cloud_canvas_asset_refs (canvas_id, owner_id, asset_sha256)
      values (p_id, v_uid, v_sha)
      on conflict do nothing;
    end loop;
  end if;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: delete_cloud_canvas — frees the slot, returns now-orphaned asset paths
--   (physical Storage deletion is done client-side under the owner's RLS)
-- ---------------------------------------------------------------------------
create or replace function public.delete_cloud_canvas(p_id uuid)
returns table (storage_path text)
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.cloud_canvases where id = p_id and owner_id = v_uid) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  delete from public.cloud_canvases where id = p_id and owner_id = v_uid;  -- cascades refs

  return query
    select a.storage_path
      from public.cloud_assets a
     where a.owner_id = v_uid
       and not exists (
         select 1 from public.cloud_canvas_asset_refs r
          where r.owner_id = v_uid and r.asset_sha256 = a.sha256);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: count_cloud_canvases — for cap UX ("2 of 3")
-- ---------------------------------------------------------------------------
create or replace function public.count_cloud_canvases()
returns integer
language sql security definer set search_path = public
as $$
  select count(*)::int from public.cloud_canvases where owner_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Grants: only authenticated users may execute the RPCs; nobody may bypass them.
-- ---------------------------------------------------------------------------
revoke all on function public.create_cloud_canvas(text, jsonb, integer, text[]) from public, anon;
revoke all on function public.update_cloud_canvas(uuid, integer, text, jsonb, integer, text[]) from public, anon;
revoke all on function public.delete_cloud_canvas(uuid) from public, anon;
revoke all on function public.count_cloud_canvases() from public, anon;

grant execute on function public.create_cloud_canvas(text, jsonb, integer, text[]) to authenticated;
grant execute on function public.update_cloud_canvas(uuid, integer, text, jsonb, integer, text[]) to authenticated;
grant execute on function public.delete_cloud_canvas(uuid) to authenticated;
grant execute on function public.count_cloud_canvases() to authenticated;

-- ---------------------------------------------------------------------------
-- Private Storage bucket for content-addressed image assets
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('canvas-assets', 'canvas-assets', false)
on conflict (id) do nothing;

-- Owner-namespaced access: the first path segment must equal the caller's uid.
drop policy if exists "canvas assets select own" on storage.objects;
create policy "canvas assets select own" on storage.objects
  for select to authenticated
  using (bucket_id = 'canvas-assets' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "canvas assets insert own" on storage.objects;
create policy "canvas assets insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'canvas-assets' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "canvas assets delete own" on storage.objects;
create policy "canvas assets delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'canvas-assets' and (storage.foldername(name))[1] = auth.uid()::text);

-- =============================================================================
-- END. After applying, verify (as a signed-in user):
--   select public.create_cloud_canvas('a','{}'::jsonb,1,null);   -- x3 ok
--   select public.create_cloud_canvas('d','{}'::jsonb,1,null);   -- 4th -> cloud_limit_reached
--   -- stale revision -> revision_conflict; anon -> auth_required / RLS denies select
-- =============================================================================
