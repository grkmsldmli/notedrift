-- =============================================================================
-- NoteDrift — Phase 2.0C-A  follow-up: base-table privileges
-- =============================================================================
-- Live verification found that the initial migration enabled RLS and wrote row
-- policies but never granted base-table privileges, so PostgREST rejected even
-- the owner's own reads with "permission denied for table". RLS only filters
-- rows *after* a base grant exists; without the grant, no query runs.
--
-- This grants exactly the access the existing policies already gate (reads scope
-- to owner_id = auth.uid(); writes to cloud_canvases still go only through the
-- SECURITY DEFINER RPCs). `anon` is intentionally NOT granted — it stays with no
-- cloud access at all. Safe + idempotent; apply via SQL Editor or `db push`.
-- =============================================================================

-- List own canvases (the Cloud Canvases UI). RLS: owner rows only.
grant select on public.cloud_canvases to authenticated;

-- Content-addressed asset registry: the client inserts rows for uploaded assets,
-- reads them, and deletes orphaned ones. RLS: owner rows only.
grant select, insert, delete on public.cloud_assets to authenticated;

-- Asset references are written by the RPCs; the client only reads them.
grant select on public.cloud_canvas_asset_refs to authenticated;

-- (Direct INSERT/UPDATE/DELETE on cloud_canvases is deliberately NOT granted, so
--  the Free 3-cap + optimistic-revision checks in the RPCs can't be bypassed.)
