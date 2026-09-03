// Local persistence for NoteDrift.
//
// Split by size:
//  - Canvas documents (can be large: pasted/embedded images) -> IndexedDB.
//  - Page index + prefs (tiny, needed synchronously on load) -> localStorage.
//
// Everything here is client-only and defensively guarded so it never throws
// during SSR or in privacy modes where storage is unavailable.

import type {
  CanvasDoc,
  CanvasStyle,
  DrawTool,
  DrawToolPrefs,
  PageMeta,
  PenStabilization,
  ToolDefaults,
} from "./types";
import { DRAW_TOOLS, defaultPrefsFor } from "./brush/materials";
import { FONT_STACKS } from "./fonts";

const DB_NAME = "notedrift";
const STORE = "pages";
const DB_VERSION = 1;

const PAGES_KEY = "notedrift:pages";
const CURRENT_KEY = "notedrift:current";
const PREFS_KEY = "notedrift:prefs";

export interface Prefs {
  /** Canvas style applied to newly created pages. */
  defaultStyle: CanvasStyle;
}

const DEFAULT_PREFS: Prefs = { defaultStyle: "dots" };

/* ------------------------------- IndexedDB -------------------------------- */

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveCanvasDoc(pageId: string, doc: CanvasDoc): Promise<void> {
  try {
    await idbSet(pageId, doc);
  } catch {
    /* best-effort autosave; ignore storage failures */
  }
}

export async function loadCanvasDoc(pageId: string): Promise<CanvasDoc | undefined> {
  try {
    return await idbGet<CanvasDoc>(pageId);
  } catch {
    return undefined;
  }
}

export async function deleteCanvasDoc(pageId: string): Promise<void> {
  try {
    await idbDelete(pageId);
  } catch {
    /* ignore */
  }
}

/* ------------------------------ localStorage ------------------------------ */

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

export function loadPages(): PageMeta[] {
  const pages = readJSON<PageMeta[]>(PAGES_KEY, []);
  return Array.isArray(pages) ? pages : [];
}

export function savePages(pages: PageMeta[]): void {
  writeJSON(PAGES_KEY, pages);
}

export function getCurrentPageId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(CURRENT_KEY);
  } catch {
    return null;
  }
}

export function setCurrentPageId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CURRENT_KEY, id);
  } catch {
    /* ignore */
  }
}

export function loadPrefs(): Prefs {
  return { ...DEFAULT_PREFS, ...readJSON<Partial<Prefs>>(PREFS_KEY, {}) };
}

export function savePrefs(prefs: Prefs): void {
  writeJSON(PREFS_KEY, prefs);
}

const TOOLDEFAULTS_KEY = "notedrift:tooldefaults";

function freshToolDefaults(): ToolDefaults {
  const draw = {} as Record<DrawTool, DrawToolPrefs>;
  for (const t of DRAW_TOOLS) draw[t] = defaultPrefsFor(t);
  return {
    draw,
    shapeStroke: "#20242e",
    shapeStrokeWidth: 3,
    shapeFill: "transparent",
    shapeDash: "solid",
    shapeOpacity: 1,
    shapeRadius: 16,
    shapeSides: 6,
    shapeStarPoints: 5,
    shapeStarInner: 0.45,
    lineStroke: "#20242e",
    lineStrokeWidth: 4,
    lineDash: "solid",
    lineOpacity: 1,
    textColor: "#20242e",
    textFontSize: 24,
    textFontFamily: FONT_STACKS.sans,
    textLineHeight: 1.3,
    noteFill: "#fef3c7",
  };
}

const SCALAR_KEYS = [
  "shapeStroke",
  "shapeStrokeWidth",
  "shapeFill",
  "shapeDash",
  "shapeOpacity",
  "shapeRadius",
  "shapeSides",
  "shapeStarPoints",
  "shapeStarInner",
  "lineStroke",
  "lineStrokeWidth",
  "lineDash",
  "lineOpacity",
  "textColor",
  "textFontSize",
  "textFontFamily",
  "textLineHeight",
  "noteFill",
] as const;

export function loadToolDefaults(): ToolDefaults {
  const stored = readJSON<Record<string, unknown>>(TOOLDEFAULTS_KEY, {});
  const base = freshToolDefaults();

  // Migrate legacy flat pen prefs (Phase 1.6A and earlier) into draw.pen.
  if (stored.penColor !== undefined && stored.draw === undefined) {
    base.draw.pen = {
      color: (stored.penColor as string) ?? base.draw.pen.color,
      width: (stored.penWidth as number) ?? base.draw.pen.width,
      opacity: (stored.penOpacity as number) ?? base.draw.pen.opacity,
      stabilization:
        (stored.penStabilization as PenStabilization) ??
        base.draw.pen.stabilization,
      pressure: (stored.penPressure as boolean) ?? base.draw.pen.pressure,
    };
  }

  // Merge any stored per-tool draw prefs over the material defaults.
  const storedDraw = (stored.draw ?? {}) as Partial<
    Record<DrawTool, Partial<DrawToolPrefs>>
  >;
  for (const t of DRAW_TOOLS) {
    base.draw[t] = { ...base.draw[t], ...(storedDraw[t] ?? {}) };
  }

  const rec = base as unknown as Record<string, unknown>;
  for (const k of SCALAR_KEYS) {
    if (stored[k] !== undefined) rec[k] = stored[k];
  }
  return base;
}

export function saveToolDefaults(defaults: ToolDefaults): void {
  writeJSON(TOOLDEFAULTS_KEY, defaults);
}

/* ------------------------------ colors: recents / favorites ---------------- */

const RECENT_COLORS_KEY = "notedrift:recentcolors";
const FAVORITE_COLORS_KEY = "notedrift:favcolors";
const MAX_RECENT_COLORS = 8;

export function loadRecentColors(): string[] {
  const list = readJSON<string[]>(RECENT_COLORS_KEY, []);
  return Array.isArray(list) ? list.slice(0, MAX_RECENT_COLORS) : [];
}

/** Record a used color: most-recent-first, de-duplicated, capped. Returns the list. */
export function pushRecentColor(hex: string): string[] {
  const norm = hex.toLowerCase();
  const next = [norm, ...loadRecentColors().filter((c) => c.toLowerCase() !== norm)].slice(
    0,
    MAX_RECENT_COLORS,
  );
  writeJSON(RECENT_COLORS_KEY, next);
  return next;
}

export function loadFavoriteColors(): string[] {
  const list = readJSON<string[]>(FAVORITE_COLORS_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function saveFavoriteColors(colors: string[]): void {
  writeJSON(FAVORITE_COLORS_KEY, colors);
}

/* --------------------------------- misc ----------------------------------- */

/** Short, collision-resistant id for pages. */
export function uid(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  );
}
