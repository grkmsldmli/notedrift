// Pure decision for how the editor resolves its FIRST page on load. Kept
// dependency-free so it can be unit-tested without React/DOM/storage (the
// bootstrap effect itself needs a real canvas and can't run in the node test
// runner). Used by Editor.tsx's bootstrap. See the product rule: a signed-out
// visitor starting a NEW browser session opens a fresh blank page instead of
// auto-restoring a previous anonymous canvas.

export type StartupPlan =
  | { kind: "wait" } // identity still resolving — don't touch storage yet
  | { kind: "restore" } // use the persisted current page (signed-in, or same anon session)
  | { kind: "new-blank" }; // signed-out + brand-new browser session → fresh blank page

/** Decide the first-page action purely from identity + session state. Never
 *  inspects private/incognito mode — determinism comes from auth status and the
 *  sessionStorage "anonymous session started" marker alone. */
export function planStartup(args: {
  authStatus: "loading" | "ready";
  signedIn: boolean;
  anonSessionStarted: boolean;
}): StartupPlan {
  // Identity must resolve first: never restore (or replace) a canvas before we
  // know whether the visitor is signed in or anonymous.
  if (args.authStatus === "loading") return { kind: "wait" };
  // Signed-in users always keep the existing restore behavior. A signed-out
  // visitor whose anonymous session has ALREADY started (a same-session refresh)
  // also restores — only a genuinely new anonymous session starts fresh.
  if (!args.signedIn && !args.anonSessionStarted) return { kind: "new-blank" };
  return { kind: "restore" };
}
