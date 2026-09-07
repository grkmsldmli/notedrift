"use client";

import { useSyncExternalStore } from "react";

// True on phone-width viewports (< Tailwind `sm` = 640px). Used to switch the
// editor chrome between the desktop left rail and the mobile bottom tool dock.
// `useSyncExternalStore` keeps it SSR-safe and free of setState-in-effect; the
// editor is client-only (ssr:false) so there is no hydration mismatch.

// Phone-shaped viewports: narrow (portrait phones) OR short AND touch-driven
// (landscape phones — wider than 639px but too short for the tall vertical rail).
// The `pointer: coarse` guard on the height clause is the important bit: a short
// viewport ALONE is not enough, because a mouse-driven desktop can be short too
// (a browser zoomed to 150%+ shrinks the CSS viewport below 500px, and so does a
// half-height window). Those still have a fine pointer, so they keep the desktop
// left rail instead of wrongly collapsing to the mobile bottom dock. Only a real
// touch device (coarse pointer) that is also short gets the landscape-phone dock.
const QUERY = "(max-width: 639px), (max-height: 500px) and (pointer: coarse)";

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
