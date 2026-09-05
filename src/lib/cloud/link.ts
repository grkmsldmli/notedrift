// Local ↔ cloud link model + pure sync-state logic (Phase 2.0C-B).
//
// A "link" records that a specific LOCAL canvas is bound to a cloud canvas. It is
// stored separately from CanvasDoc so cloud metadata never pollutes the editor's
// document. All logic here is pure (no storage, no network) and unit-tested; the
// browser persistence lives in linkStore.ts and the async engine in engine.ts.

export type SyncState =
  | "local-only" // never uploaded
  | "dirty" // local changes not yet synced
  | "syncing" // an upload is in flight
  | "synced" // cloud matches local
  | "offline" // waiting for connectivity
  | "error" // last sync failed (will retry)
  | "conflict"; // remote moved ahead — auto-sync paused, user must resolve

export interface CloudLink {
  /** Local page id (from storage.uid()). */
  readonly localId: string;
  /** Cloud canvas UUID. */
  readonly cloudId: string;
  /** Cloud owner uid — the account that owns the remote row. NEVER retargeted. */
  readonly ownerId: string;
  /** Last-known cloud revision (optimistic concurrency token). */
  readonly revision: number;
  /** Fingerprint of the last state synced to/from the cloud. */
  readonly fingerprint: string;
  readonly syncState: SyncState;
  readonly updatedAt: number;
}

export function createLink(init: {
  localId: string;
  cloudId: string;
  ownerId: string;
  revision: number;
  fingerprint: string;
  now: number;
}): CloudLink {
  return {
    localId: init.localId,
    cloudId: init.cloudId,
    ownerId: init.ownerId,
    revision: init.revision,
    fingerprint: init.fingerprint,
    syncState: "synced",
    updatedAt: init.now,
  };
}

/** A link may sync under `uid` only if `uid` owns the remote row. This is the
 *  P0 cross-account guard: an account-A link must never sync under account B. */
export function ownsLink(link: CloudLink, uid: string | null): boolean {
  return !!uid && link.ownerId === uid;
}

/** True when the local content has diverged from what's in the cloud. */
export function isDivergent(link: CloudLink, currentFingerprint: string): boolean {
  return link.fingerprint !== currentFingerprint;
}

/**
 * Decide what should happen after a local save, for the current owner + network.
 * Coalescing/single-flight is handled by the engine; this only decides intent.
 */
export function planSync(
  link: CloudLink,
  currentFingerprint: string,
  opts: { uid: string | null; online: boolean },
): "skip" | "sync" | "offline" | "foreign" | "blocked-conflict" {
  if (!ownsLink(link, opts.uid)) return "foreign"; // different/none account → never sync
  if (link.syncState === "conflict") return "blocked-conflict"; // paused until resolved
  if (!isDivergent(link, currentFingerprint)) return "skip"; // nothing changed
  if (!opts.online) return "offline";
  return "sync";
}

/* ------------------------------ transitions ------------------------------ */

const set = (link: CloudLink, patch: Partial<CloudLink>, now: number): CloudLink => ({
  ...link,
  ...patch,
  updatedAt: now,
});

export const toDirty = (l: CloudLink, now: number): CloudLink =>
  l.syncState === "conflict" ? l : set(l, { syncState: "dirty" }, now);
export const toSyncing = (l: CloudLink, now: number): CloudLink => set(l, { syncState: "syncing" }, now);
export const toSynced = (l: CloudLink, revision: number, fingerprint: string, now: number): CloudLink =>
  set(l, { syncState: "synced", revision, fingerprint }, now);
export const toOffline = (l: CloudLink, now: number): CloudLink =>
  l.syncState === "conflict" ? l : set(l, { syncState: "offline" }, now);
export const toError = (l: CloudLink, now: number): CloudLink =>
  l.syncState === "conflict" ? l : set(l, { syncState: "error" }, now);
export const toConflict = (l: CloudLink, now: number): CloudLink => set(l, { syncState: "conflict" }, now);

/* ---------------------------- error classification ----------------------- */

export type CloudErrorKind = "conflict" | "limit" | "not-found" | "auth" | "network" | "unknown";

/** Map a Supabase/PostgREST error into a kind the engine + UI can act on. The
 *  RPCs raise named exceptions (revision_conflict / cloud_limit_reached / …). */
export function classifyCloudError(
  err: { message?: string; code?: string; name?: string } | null | undefined,
): CloudErrorKind {
  const m = (err?.message ?? "").toLowerCase();
  if (m.includes("revision_conflict")) return "conflict";
  if (m.includes("cloud_limit_reached")) return "limit";
  if (m.includes("not_found")) return "not-found";
  if (m.includes("auth_required") || err?.code === "42501") return "auth";
  if (m.includes("failed to fetch") || m.includes("network") || err?.name === "TypeError") return "network";
  return "unknown";
}
