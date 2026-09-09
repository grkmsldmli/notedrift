"use client";

import { useSyncExternalStore } from "react";

// Viewport/pointer signals that switch the editor chrome between the desktop left
// rail and a touch-first bottom tool dock. `useSyncExternalStore` keeps them
// SSR-safe and free of setState-in-effect; the editor is client-only (ssr:false)
// so there is no hydration mismatch.
//
//  - useIsMobile(): phone-shaped viewports (compact dock, fewest slots).
//  - useIsTouch():  ANY touch-first device — phone OR tablet (iPad) — i.e. the
//    primary pointer is coarse. Desktop/laptop (fine pointer, even touchscreens
//    whose primary pointer is the trackpad) return false and keep the left rail.

// Phone-shaped viewports: narrow (portrait phones) OR short AND touch-driven
// (landscape phones — wider than 639px but too short for the tall vertical rail).
// The `pointer: coarse` guard on the height clause is the important bit: a short
// viewport ALONE is not enough, because a mouse-driven desktop can be short too
// (a browser zoomed to 150%+ shrinks the CSS viewport below 500px, and so does a
// half-height window). Those still have a fine pointer, so they keep the desktop
// left rail instead of wrongly collapsing to the mobile bottom dock.
const PHONE_QUERY = "(max-width: 639px), (max-height: 500px) and (pointer: coarse)";
// A touch-first device (the primary pointer is coarse): phones and tablets. This
// is what promotes an iPad — wide, but finger/pencil-driven — off the desktop
// vertical rail and onto the touch dock. A desktop with a fine pointer stays false.
const TOUCH_QUERY = "(pointer: coarse)";

function makeSubscribe(query: string) {
  return (onChange: () => void): (() => void) => {
    if (typeof window === "undefined" || !window.matchMedia) return () => {};
    const mql = window.matchMedia(query);
    mql.addEventListener("change", onChange);
    // Also react to plain resize/orientation changes: some engines (and device
    // emulation) don't fire the matchMedia `change` event on every viewport change.
    window.addEventListener("resize", onChange);
    window.addEventListener("orientationchange", onChange);
    return () => {
      mql.removeEventListener("change", onChange);
      window.removeEventListener("resize", onChange);
      window.removeEventListener("orientationchange", onChange);
    };
  };
}

function makeSnapshot(query: string) {
  return (): boolean =>
    typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(query).matches;
}

// Module-level, stable references (required by useSyncExternalStore).
const subscribePhone = makeSubscribe(PHONE_QUERY);
const snapshotPhone = makeSnapshot(PHONE_QUERY);
const subscribeTouch = makeSubscribe(TOUCH_QUERY);
const snapshotTouch = makeSnapshot(TOUCH_QUERY);

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribePhone, snapshotPhone, () => false);
}

/** True on any touch-first device (phone or tablet) — the primary pointer is
 *  coarse. Desktop/laptop (fine pointer) is false. */
export function useIsTouch(): boolean {
  return useSyncExternalStore(subscribeTouch, snapshotTouch, () => false);
}
