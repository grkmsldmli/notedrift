"use client";

import { useSyncExternalStore } from "react";

// True on phone-width viewports (< Tailwind `sm` = 640px). Used to switch the
// editor chrome between the desktop left rail and the mobile bottom tool dock.
// `useSyncExternalStore` keeps it SSR-safe and free of setState-in-effect; the
// editor is client-only (ssr:false) so there is no hydration mismatch.

// Phone-shaped viewports: narrow (portrait phones) OR short (landscape phones,
// which are wider than 639px but too short for the tall vertical rail). Tablets
// and desktops (tall AND wide) keep the left rail.
const QUERY = "(max-width: 639px), (max-height: 500px)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  // Also react to plain resize/orientation changes: some engines (and device
  // emulation) don't fire the matchMedia `change` event on every viewport change,
  // so this guarantees the mobile/desktop switch recovers on rotate/resize.
  window.addEventListener("resize", onChange);
  window.addEventListener("orientationchange", onChange);
  return () => {
    mql.removeEventListener("change", onChange);
    window.removeEventListener("resize", onChange);
    window.removeEventListener("orientationchange", onChange);
  };
}

function getSnapshot(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia &&
    window.matchMedia(QUERY).matches
  );
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
