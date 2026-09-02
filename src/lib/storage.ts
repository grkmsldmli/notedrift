// Local persistence for NoteDrift.
//
// Split by size:
//  - Canvas documents (can be large: pasted/embedded images) -> IndexedDB.
//  - Page index + prefs (tiny, needed synchronously on load) -> localStorage.
//
// Everything here is client-only and defensively guarded so it never throws
// during SSR or in privacy modes where storage is unavailable.

import type { CanvasDoc, CanvasStyle, PageMeta, ToolDefaults } from "./types";

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

const DEFAULT_TOOL_DEFAULTS: ToolDefaults = {
  penColor: "#20242e",
  penWidth: 4,
  penOpacity: 1,
  penStabilization: "low",
  penPressure: false,
  shapeStroke: "#20242e",
  shapeStrokeWidth: 4,
  shapeFill: "transparent",
  lineStroke: "#20242e",
  lineStrokeWidth: 4,
  textColor: "#20242e",
  textFontSize: 24,
  noteFill: "#fef3c7",
};

export function loadToolDefaults(): ToolDefaults {
  return {
    ...DEFAULT_TOOL_DEFAULTS,
    ...readJSON<Partial<ToolDefaults>>(TOOLDEFAULTS_KEY, {}),
  };
}

export function saveToolDefaults(defaults: ToolDefaults): void {
  writeJSON(TOOLDEFAULTS_KEY, defaults);
}

/* --------------------------------- misc ----------------------------------- */

/** Short, collision-resistant id for pages. */
export function uid(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  );
}
