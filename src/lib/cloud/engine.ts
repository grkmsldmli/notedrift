"use client";

// The local-first cloud sync engine (Phase 2.0C-B).
//
// Hard rules it enforces:
//   * LOCAL SAVE FIRST, cloud second. The editor persists locally and only THEN
//     notifies this engine; a cloud failure never touches local durability.
//   * Signing in uploads nothing. A local canvas becomes cloud-linked only via an
//     explicit saveToCloud(). After that, edits auto-sync (debounced, single-flight).
//   * A link is bound to one owner uid and NEVER retargeted — an account-A canvas
//     can't sync under account B.
//   * Optimistic revision: a stale update becomes a conflict (never last-write-wins);
//     resolving with "use cloud" first backs up unsynced local work.
//
// The engine owns only cloud concerns; it reads/writes local storage through the
// existing helpers and calls back into the editor to open/reload pages.

import { loadCanvasDoc, loadPages, savePages, saveCanvasDoc, uid as newId } from "../storage";
import type { PageMeta } from "../types";
import {
  createLink,
  ownsLink,
  toConflict,
  toDirty,
  toError,
  toOffline,
  toSynced,
  toSyncing,
  type CloudLink,
} from "./link";
import { getLink, getLinkByCloudId, removeLink, saveLink } from "./linkStore";
import {
  countCloudCanvases,
  createCloudCanvas,
  deleteCloudCanvas,
  getAsset,
  getCloudCanvas,
  listCloudCanvases,
  putAsset,
  removeAssetPaths,
  updateCloudCanvas,
  type CloudCanvasMeta,
  type CloudResult,
} from "./client";
import {
  bytesToDataUrl,
  extractAssets,
  fingerprint,
  hydrateAssets,
  manifestAssetShas,
} from "./manifest";
import type { CanvasDoc } from "../types";

export const CLOUD_SCHEMA_VERSION = 1;
const SYNC_DEBOUNCE_MS = 2000;

export type SaveFailKind = "auth" | "limit" | "network" | "schema" | "unknown";
export type SaveOutcome =
  | { ok: true; cloudId: string }
  | { ok: false; kind: SaveFailKind; message: string };

export interface EngineHooks {
  /** Reload the React page list from storage (a page was added/renamed). */
  onPagesChanged?: () => void;
  /** Reload the canvas for `localId` if it is the one on screen (doc replaced). */
  onCanvasReplaced?: (localId: string) => void;
}

class CloudSyncEngine {
  private uid: string | null = null;
  private online = typeof navigator === "undefined" ? true : navigator.onLine;
  private hooks: EngineHooks = {};
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private inflight = new Set<string>();
  private coalesce = new Set<string>();
  private listeners = new Set<() => void>();

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => this.setOnline(true));
      window.addEventListener("offline", () => this.setOnline(false));
    }
  }

  configure(hooks: EngineHooks): void {
    this.hooks = hooks;
  }

  /** Called on every auth change. Never uploads; only re-scopes what may sync. */
  setUser(uid: string | null): void {
    this.uid = uid;
    this.emit();
  }

  setOnline(online: boolean): void {
    const was = this.online;
    this.online = online;
    if (!was && online) {
      // reconnect: retry every owned, non-synced, non-conflict link once
      for (const l of this.linksForUser()) {
        if (l.syncState !== "synced" && l.syncState !== "conflict") this.notifyLocalSave(l.localId);
      }
    }
    this.emit();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  /** The link record (with its sync state), or null when local-only. */
  status(localId: string): CloudLink | null {
    return getLink(localId);
  }

  /** Whether the current signed-in user owns this canvas's cloud link. */
  ownsCurrent(localId: string): boolean {
    const l = getLink(localId);
    return !!l && ownsLink(l, this.uid);
  }

  /* --------------------------- explicit upload --------------------------- */

  async saveToCloud(localId: string, title: string): Promise<SaveOutcome> {
    if (!this.uid) return { ok: false, kind: "auth", message: "Sign in to save to the cloud." };
    const doc = await loadCanvasDoc(localId);
    if (!doc) return { ok: false, kind: "unknown", message: "Nothing to save yet." };
    const { manifest, assets } = await extractAssets(doc);
    const freshlyUploaded: string[] = [];
    try {
      for (const a of assets) {
        const r = await putAsset(this.uid, a.sha256, a.mime, a.bytes);
        if (!r.ok) throw r;
        if (r.data.uploaded) freshlyUploaded.push(r.data.path);
      }
      const res = await createCloudCanvas(title, manifest, CLOUD_SCHEMA_VERSION, manifestAssetShas(manifest));
      if (!res.ok) {
        await removeAssetPaths(freshlyUploaded); // §31 rollback (only newly-uploaded)
        return { ok: false, kind: mapKind(res), message: res.message };
      }
      const fp = await fingerprint(title, manifest);
      saveLink(createLink({ localId, cloudId: res.data.id, ownerId: this.uid, revision: res.data.revision, fingerprint: fp, now: Date.now() }));
      this.emit();
      return { ok: true, cloudId: res.data.id };
    } catch (e) {
      await removeAssetPaths(freshlyUploaded);
      const r = e as CloudResult<never>;
      return { ok: false, kind: "kind" in r ? mapKind(r) : "unknown", message: (e as Error)?.message ?? "Cloud error" };
    }
  }

  /* ----------------------------- auto-sync ------------------------------ */

  /** Editor calls this AFTER a successful local save. Debounced + single-flight. */
  notifyLocalSave(localId: string): void {
    const link = getLink(localId);
    if (!link || !ownsLink(link, this.uid) || link.syncState === "conflict") return;
    if (link.syncState === "synced") this.setLink(toDirty(link, Date.now()));
    clearTimeout(this.timers.get(localId));
    this.timers.set(localId, setTimeout(() => void this.doSync(localId), SYNC_DEBOUNCE_MS));
  }

  private async doSync(localId: string): Promise<void> {
    const link = getLink(localId);
    if (!link || !ownsLink(link, this.uid) || link.syncState === "conflict") return;
    if (this.inflight.has(localId)) {
      this.coalesce.add(localId); // a newer state arrived mid-flight — one more pass after
      return;
    }
    const doc = await loadCanvasDoc(localId);
    if (!doc) return;
    const title = pageTitle(localId);
    const { manifest, assets } = await extractAssets(doc);
    const fp = await fingerprint(title, manifest);
    if (fp === link.fingerprint) {
      this.setLink(toSynced(link, link.revision, fp, Date.now())); // already matches cloud
      return;
    }
    if (!this.online) {
      this.setLink(toOffline(link, Date.now()));
      return;
    }
    this.inflight.add(localId);
    this.setLink(toSyncing(link, Date.now()));
    try {
      for (const a of assets) {
        const r = await putAsset(this.uid!, a.sha256, a.mime, a.bytes);
        if (!r.ok) throw r;
      }
      const res = await updateCloudCanvas(link.cloudId, link.revision, title, manifest, CLOUD_SCHEMA_VERSION, manifestAssetShas(manifest));
      if (!res.ok) {
        this.setLink(res.kind === "conflict" ? toConflict(link, Date.now()) : toError(link, Date.now()));
        return;
      }
      this.setLink(toSynced(link, res.data.revision, fp, Date.now()));
    } catch {
      this.setLink(toError(link, Date.now()));
    } finally {
      this.inflight.delete(localId);
      if (this.coalesce.delete(localId)) this.notifyLocalSave(localId);
    }
  }

  /* ------------------------------ open ---------------------------------- */

  /** Download + hydrate a cloud canvas into a local page. Reuses the existing
   *  linked local page if present (no duplicate). Returns the local page id. */
  async openFromCloud(cloudId: string): Promise<{ ok: true; localId: string } | { ok: false; message: string }> {
    const existing = getLinkByCloudId(cloudId);
    if (existing && ownsLink(existing, this.uid)) return { ok: true, localId: existing.localId };
    if (!this.uid) return { ok: false, message: "Sign in to open a cloud canvas." };

    const res = await getCloudCanvas(cloudId);
    if (!res.ok) return { ok: false, message: res.message };
    if (res.data.schemaVersion > CLOUD_SCHEMA_VERSION) {
      return { ok: false, message: "This canvas was saved by a newer version of NoteDrift." }; // §23
    }
    const doc = await this.hydrate(res.data.document);
    const localId = newId();
    await saveCanvasDoc(localId, doc);
    addPage(localId, res.data.title);
    const fp = await fingerprint(res.data.title, res.data.document);
    saveLink(createLink({ localId, cloudId, ownerId: this.uid, revision: res.data.revision, fingerprint: fp, now: Date.now() }));
    this.hooks.onPagesChanged?.();
    this.emit();
    return { ok: true, localId };
  }

  private async hydrate(manifest: CanvasDoc): Promise<CanvasDoc> {
    const shas = manifestAssetShas(manifest);
    const resolved = new Map<string, string>();
    for (const sha of shas) {
      const a = await getAsset(`${this.uid}/${sha}`);
      if (a.ok) resolved.set(sha, bytesToDataUrl(a.data.bytes, a.data.mime));
    }
    return hydrateAssets(manifest, (sha) => resolved.get(sha));
  }

  /* --------------------------- remove / delete -------------------------- */

  /** Explicitly remove the CLOUD copy; the local canvas stays (becomes local-only). */
  async removeFromCloud(localId: string): Promise<{ ok: boolean; message?: string }> {
    const link = getLink(localId);
    if (!link || !ownsLink(link, this.uid)) return { ok: false, message: "Not a cloud canvas on this account." };
    const res = await deleteCloudCanvas(link.cloudId);
    if (!res.ok && res.kind !== "not-found") return { ok: false, message: res.message };
    if (res.ok) await removeAssetPaths(res.data);
    removeLink(localId); // keep local doc + page; just unlink
    this.emit();
    return { ok: true };
  }

  /** A cloud row vanished remotely: keep the local content, drop the link. */
  unlinkMissing(localId: string): void {
    removeLink(localId);
    this.emit();
  }

  /** Remove a cloud canvas by its cloud id (from the browse dialog). Deletes the
   *  remote copy + orphaned assets; keeps + unlinks any local cache. */
  async removeCloudCanvas(cloudId: string): Promise<{ ok: boolean; message?: string }> {
    if (!this.uid) return { ok: false, message: "Sign in required." };
    const res = await deleteCloudCanvas(cloudId);
    if (!res.ok && res.kind !== "not-found") return { ok: false, message: res.message };
    if (res.ok) await removeAssetPaths(res.data);
    const local = getLinkByCloudId(cloudId);
    if (local) removeLink(local.localId);
    this.emit();
    return { ok: true };
  }

  /** Metadata list for the Cloud Canvases UI (never fetches document bodies). */
  async list(): Promise<CloudCanvasMeta[]> {
    const res = await listCloudCanvases();
    return res.ok ? res.data : [];
  }

  async count(): Promise<number> {
    const res = await countCloudCanvases();
    return res.ok ? res.data : 0;
  }

  /** The local page cached for a cloud id, if any (owned by the current user). */
  localIdForCloud(cloudId: string): string | null {
    const l = getLinkByCloudId(cloudId);
    return l && ownsLink(l, this.uid) ? l.localId : null;
  }

  /* ---------------------------- conflicts ------------------------------- */

  async resolveConflict(localId: string, choice: "keep" | "cloud"): Promise<{ ok: boolean; message?: string }> {
    const link = getLink(localId);
    if (!link || !ownsLink(link, this.uid) || link.syncState !== "conflict") return { ok: false };
    const remote = await getCloudCanvas(link.cloudId);
    if (!remote.ok) {
      if (remote.kind === "not-found") this.unlinkMissing(localId);
      return { ok: false, message: remote.message };
    }
    if (choice === "keep") {
      const doc = await loadCanvasDoc(localId);
      if (!doc) return { ok: false };
      const title = pageTitle(localId);
      const { manifest, assets } = await extractAssets(doc);
      for (const a of assets) {
        const r = await putAsset(this.uid!, a.sha256, a.mime, a.bytes);
        if (!r.ok) return { ok: false, message: r.message };
      }
      const res = await updateCloudCanvas(remote.data.id, remote.data.revision, title, manifest, CLOUD_SCHEMA_VERSION, manifestAssetShas(manifest));
      if (!res.ok) return { ok: false, message: res.message };
      const fp = await fingerprint(title, manifest);
      this.setLink(toSynced(link, res.data.revision, fp, Date.now()));
      return { ok: true };
    }
    // "cloud": preserve unsynced local work as a NEW local-only backup first (§42)
    const localDoc = await loadCanvasDoc(localId);
    if (localDoc) {
      const backupId = newId();
      await saveCanvasDoc(backupId, localDoc);
      addPage(backupId, `${pageTitle(localId)} (local backup)`);
    }
    const hydrated = await this.hydrate(remote.data.document);
    await saveCanvasDoc(localId, hydrated);
    setPageTitle(localId, remote.data.title);
    const fp = await fingerprint(remote.data.title, remote.data.document);
    this.setLink(toSynced(link, remote.data.revision, fp, Date.now()));
    this.hooks.onPagesChanged?.();
    this.hooks.onCanvasReplaced?.(localId);
    return { ok: true };
  }

  /* ------------------------------ helpers ------------------------------- */

  private linksForUser(): CloudLink[] {
    const map = loadPages().map((p) => p.id);
    return map.map((id) => getLink(id)).filter((l): l is CloudLink => !!l && ownsLink(l, this.uid));
  }

  private setLink(link: CloudLink): void {
    saveLink(link);
    this.emit();
  }

  /** Called when a local page is renamed, so the title syncs. */
  notifyTitleChange(localId: string): void {
    this.notifyLocalSave(localId);
  }
}

function mapKind(r: { kind: string }): SaveFailKind {
  const k = r.kind;
  if (k === "limit" || k === "auth" || k === "network") return k;
  return "unknown";
}

/* ------------------------- local page helpers ------------------------- */

function pageTitle(localId: string): string {
  return loadPages().find((p) => p.id === localId)?.title ?? "Untitled";
}
function setPageTitle(localId: string, title: string): void {
  savePages(loadPages().map((p) => (p.id === localId ? { ...p, title } : p)));
}
function addPage(localId: string, title: string): void {
  const meta: PageMeta = { id: localId, title, createdAt: Date.now(), updatedAt: Date.now() };
  const pages = loadPages();
  if (!pages.some((p) => p.id === localId)) savePages([meta, ...pages]);
}

let singleton: CloudSyncEngine | null = null;
export function getCloudEngine(): CloudSyncEngine {
  if (!singleton) singleton = new CloudSyncEngine();
  return singleton;
}
export type { CloudSyncEngine, CloudCanvasMeta };
