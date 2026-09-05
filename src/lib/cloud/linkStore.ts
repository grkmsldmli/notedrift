"use client";

// Local persistence for local↔cloud link records (Phase 2.0C-B). Kept in
// localStorage, separate from the CanvasDoc, and defensively guarded so it never
// throws in SSR/privacy modes. Never stores tokens — only the cloud id, owner id,
// revision, fingerprint and sync state.

import type { CloudLink } from "./link";

const KEY = "notedrift:cloudlinks";
type LinkMap = Record<string, CloudLink>;

function read(): LinkMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as LinkMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function write(map: LinkMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* quota / privacy mode — cloud link is best-effort, local doc is unaffected */
  }
}

export function getLink(localId: string): CloudLink | null {
  return read()[localId] ?? null;
}

export function getLinkByCloudId(cloudId: string): CloudLink | null {
  return Object.values(read()).find((l) => l.cloudId === cloudId) ?? null;
}

export function saveLink(link: CloudLink): void {
  const map = read();
  map[link.localId] = link;
  write(map);
}

export function removeLink(localId: string): void {
  const map = read();
  if (map[localId]) {
    delete map[localId];
    write(map);
  }
}

export function allLinks(): CloudLink[] {
  return Object.values(read());
}
