"use client";

// Thin, typed wrappers over the cloud RPCs + private asset storage. Every write
// to a canvas goes through a SECURITY DEFINER RPC (so the Free 3-cap and
// optimistic-revision checks can't be bypassed); reads use RLS-scoped table
// selects. All results carry a classified error kind so the engine + UI can act
// (conflict vs limit vs offline …). Reuses the app's cookie-based browser client.

import { getBrowserSupabase } from "../auth/client";
import { classifyCloudError, type CloudErrorKind } from "./link";
import type { CanvasDoc } from "../types";

export type CloudResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: CloudErrorKind; message: string };

function fail(e: { message?: string; code?: string; name?: string } | null): CloudResult<never> {
  return { ok: false, kind: classifyCloudError(e), message: e?.message ?? "Cloud is unavailable." };
}
const NOT_CONFIGURED = { message: "Cloud sign-in isn't available." } as const;

export interface CloudCanvasMeta {
  id: string;
  title: string;
  revision: number;
  schemaVersion: number;
  updatedAt: string;
}
export interface CloudCanvasFull extends CloudCanvasMeta {
  document: CanvasDoc;
}

const BUCKET = "canvas-assets";
const row = <T>(d: unknown): T => (Array.isArray(d) ? d[0] : d) as T;

/* -------------------------------- canvases -------------------------------- */

export async function createCloudCanvas(
  title: string,
  document: CanvasDoc,
  schemaVersion: number,
  assetShas: string[],
): Promise<CloudResult<{ id: string; revision: number }>> {
  const sb = getBrowserSupabase();
  if (!sb) return fail(NOT_CONFIGURED);
  const { data, error } = await sb.rpc("create_cloud_canvas", {
    p_title: title,
    p_document: document,
    p_schema_version: schemaVersion,
    p_asset_shas: assetShas.length ? assetShas : null,
  });
  if (error) return fail(error);
  const r = row<{ id: string; revision: number }>(data);
  return { ok: true, data: { id: r.id, revision: r.revision } };
}

export async function updateCloudCanvas(
  id: string,
  expectedRevision: number,
  title: string,
  document: CanvasDoc,
  schemaVersion: number,
  assetShas: string[],
): Promise<CloudResult<{ revision: number }>> {
  const sb = getBrowserSupabase();
  if (!sb) return fail(NOT_CONFIGURED);
  const { data, error } = await sb.rpc("update_cloud_canvas", {
    p_id: id,
    p_expected_revision: expectedRevision,
    p_title: title,
    p_document: document,
    p_schema_version: schemaVersion,
    p_asset_shas: assetShas.length ? assetShas : null,
  });
  if (error) return fail(error);
  return { ok: true, data: { revision: row<{ revision: number }>(data).revision } };
}

/** Delete a remote canvas. Returns storage paths that are now unreferenced. */
export async function deleteCloudCanvas(id: string): Promise<CloudResult<string[]>> {
  const sb = getBrowserSupabase();
  if (!sb) return fail(NOT_CONFIGURED);
  const { data, error } = await sb.rpc("delete_cloud_canvas", { p_id: id });
  if (error) return fail(error);
  const paths = Array.isArray(data)
    ? (data as { storage_path: string }[]).map((r) => r.storage_path)
    : [];
  return { ok: true, data: paths };
}

export async function countCloudCanvases(): Promise<CloudResult<number>> {
  const sb = getBrowserSupabase();
  if (!sb) return fail(NOT_CONFIGURED);
  const { data, error } = await sb.rpc("count_cloud_canvases");
  if (error) return fail(error);
  return { ok: true, data: Number(data) || 0 };
}

/** Metadata list for the Cloud Canvases UI — never fetches document bodies. */
export async function listCloudCanvases(): Promise<CloudResult<CloudCanvasMeta[]>> {
  const sb = getBrowserSupabase();
  if (!sb) return fail(NOT_CONFIGURED);
  const { data, error } = await sb
    .from("cloud_canvases")
    .select("id,title,revision,schema_version,updated_at")
    .order("updated_at", { ascending: false });
  if (error) return fail(error);
  return {
    ok: true,
    data: (data ?? []).map((r) => ({
      id: r.id as string,
      title: r.title as string,
      revision: r.revision as number,
      schemaVersion: r.schema_version as number,
      updatedAt: r.updated_at as string,
    })),
  };
}

/** Full canvas (with the document manifest) — fetched only when opening. */
export async function getCloudCanvas(id: string): Promise<CloudResult<CloudCanvasFull>> {
  const sb = getBrowserSupabase();
  if (!sb) return fail(NOT_CONFIGURED);
  const { data, error } = await sb
    .from("cloud_canvases")
    .select("id,title,revision,schema_version,updated_at,document")
    .eq("id", id)
    .maybeSingle();
  if (error) return fail(error);
  if (!data) return { ok: false, kind: "not-found", message: "That cloud canvas no longer exists." };
  return {
    ok: true,
    data: {
      id: data.id as string,
      title: data.title as string,
      revision: data.revision as number,
      schemaVersion: data.schema_version as number,
      updatedAt: data.updated_at as string,
      document: (data.document ?? {}) as CanvasDoc,
    },
  };
}

/* --------------------------------- assets --------------------------------- */

/** Upload one content-addressed asset if it isn't already stored, and record it
 *  in the owner's asset registry. Idempotent: a repeated hash is a no-op. */
export async function putAsset(
  ownerId: string,
  sha256: string,
  mime: string,
  bytes: Uint8Array,
): Promise<CloudResult<{ path: string; uploaded: boolean }>> {
  const sb = getBrowserSupabase();
  if (!sb) return fail(NOT_CONFIGURED);
  const path = `${ownerId}/${sha256}`;
  const up = await sb.storage
    .from(BUCKET)
    .upload(path, bytes as unknown as Blob, { contentType: mime, upsert: false });
  let uploaded = true;
  if (up.error) {
    // Same bytes already there (content-addressed) → not an error.
    if (/exist|dupl|409/i.test(up.error.message)) uploaded = false;
    else return fail(up.error);
  }
  // Register (idempotent) so cleanup can reference-count. A content-addressed
  // row never changes, so ON CONFLICT DO NOTHING (ignoreDuplicates) — which only
  // needs the INSERT grant, not UPDATE.
  await sb.from("cloud_assets").upsert(
    { owner_id: ownerId, sha256, mime, byte_size: bytes.byteLength, storage_path: path },
    { onConflict: "owner_id,sha256", ignoreDuplicates: true },
  );
  return { ok: true, data: { path, uploaded } };
}

export async function getAsset(path: string): Promise<CloudResult<{ bytes: Uint8Array; mime: string }>> {
  const sb = getBrowserSupabase();
  if (!sb) return fail(NOT_CONFIGURED);
  const { data, error } = await sb.storage.from(BUCKET).download(path);
  if (error || !data) return fail(error);
  const buf = new Uint8Array(await data.arrayBuffer());
  return { ok: true, data: { bytes: buf, mime: data.type || "application/octet-stream" } };
}

/** Best-effort removal of orphaned asset objects (never fails the caller). */
export async function removeAssetPaths(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const sb = getBrowserSupabase();
  if (!sb) return;
  try {
    await sb.storage.from(BUCKET).remove(paths);
    const shas = paths.map((p) => p.split("/").pop()!).filter(Boolean);
    if (shas.length) await sb.from("cloud_assets").delete().in("sha256", shas);
  } catch {
    /* orphans can be reaped later; never break the canvas transaction */
  }
}
