// NoteDrift Free / Pro business model — the SINGLE SOURCE OF TRUTH (Phase 2.0).
//
// This module expresses *what each plan is allowed to do* and the canonical
// pricing. It is intentionally decoupled from three things it must never import
// or assume:
//   - authentication  (who the user is)
//   - subscription    (billing state from Stripe)
//   - availability     (whether cloud/AI/etc. are actually built yet)
//
// A `Plan` value is decided elsewhere and passed in. In particular, a "pro"
// value must ultimately derive from SERVER-AUTHORITATIVE billing state — never
// from localStorage, React state, or any client claim (see docs/PRODUCT_MODEL.md).
//
// Design rules encoded here on purpose:
//   • Core creation tools are NEVER Pro-gated — coreEditor is true for everyone.
//   • Local canvases are UNLIMITED on every plan. Cloud limits are NOT local
//     limits. `canAddCloudCanvas` counts only cloud canvases.
//   • Standard PNG/PDF export is free for everyone; Pro adds professional
//     formats without degrading the standard ones.

export const PLANS = ["anonymous", "free", "pro"] as const;
export type Plan = (typeof PLANS)[number];

/** Human-facing plan names (for future UI; no UI is built in this phase). */
export const PLAN_LABELS: Record<Plan, string> = {
  anonymous: "Local",
  free: "Free",
  pro: "Pro",
};

/**
 * Everything a plan is entitled to. Boolean fields are capability gates; numeric
 * fields are limits where `Number.POSITIVE_INFINITY` means "unlimited" and `0`
 * means "none". Adding a field here is the ONLY place a capability is defined —
 * never scatter `if (isPro)` checks through the app; call `can()` / `limitOf()`.
 */
export interface Entitlements {
  // ---- Core creation: always true. The free product is genuinely useful. ----
  readonly coreEditor: boolean;
  readonly unlimitedLocalCanvases: boolean;

  // ---- Cloud (future). Local-first behaviour is unaffected by these. ----
  readonly cloudSync: boolean;
  /** Max canvases the user may keep IN THE CLOUD. 0 = no cloud, Infinity = unlimited. */
  readonly cloudCanvasLimit: number;

  // ---- Organization / history / sharing (future) ----
  readonly folders: boolean;
  /** Retention window for cloud version history, in days. 0 = none, Infinity = forever. */
  readonly versionHistoryDays: number;
  readonly publicSharing: boolean;
  readonly privateSharing: boolean;
  readonly collaboration: boolean;

  // ---- Export. Standard is free for everyone; Pro adds professional formats. ----
  readonly standardPNG: boolean;
  readonly standardPDF: boolean;
  readonly hdPNG: boolean;
  readonly transparentPNG: boolean;
  readonly svgExport: boolean;
  readonly selectionExport: boolean;
  readonly multiPagePDF: boolean;
  readonly customExportSize: boolean;

  // ---- AI (future). No AI is built; this only sizes a future allowance. ----
  /** Monthly AI actions. 0 = none. Free/Pro values are illustrative until AI ships. */
  readonly aiMonthlyActions: number;
}

/** Any capability name. */
export type Capability = keyof Entitlements;
/** Capabilities that are simple on/off gates. */
export type BooleanCapability = {
  [K in Capability]: Entitlements[K] extends boolean ? K : never;
}[Capability];
/** Capabilities that are numeric limits. */
export type NumericCapability = {
  [K in Capability]: Entitlements[K] extends number ? K : never;
}[Capability];

const UNLIMITED = Number.POSITIVE_INFINITY;

// Illustrative AI allowances — not canonical; tune when AI actually launches.
const AI_FREE_MONTHLY = 10;
const AI_PRO_MONTHLY = 300;

const ANONYMOUS: Entitlements = {
  coreEditor: true,
  unlimitedLocalCanvases: true,

  cloudSync: false,
  cloudCanvasLimit: 0,

  folders: false,
  versionHistoryDays: 0,
  publicSharing: false,
  privateSharing: false,
  collaboration: false,

  standardPNG: true,
  standardPDF: true,
  hdPNG: false,
  transparentPNG: false,
  svgExport: false,
  selectionExport: false,
  multiPagePDF: false,
  customExportSize: false,

  aiMonthlyActions: 0,
};

const FREE: Entitlements = {
  ...ANONYMOUS,
  // A free ACCOUNT unlocks a small amount of cloud on top of the same great
  // local editor. Local stays unlimited; only cloud is capped at 3.
  cloudSync: true,
  cloudCanvasLimit: 3,
  versionHistoryDays: 7,
  publicSharing: true, // limited public view links
  aiMonthlyActions: AI_FREE_MONTHLY,
};

const PRO: Entitlements = {
  coreEditor: true,
  unlimitedLocalCanvases: true,

  cloudSync: true,
  cloudCanvasLimit: UNLIMITED,

  folders: true,
  versionHistoryDays: UNLIMITED,
  publicSharing: true,
  privateSharing: true,
  collaboration: true,

  standardPNG: true,
  standardPDF: true,
  hdPNG: true,
  transparentPNG: true,
  svgExport: true,
  selectionExport: true,
  multiPagePDF: true,
  customExportSize: true,

  aiMonthlyActions: AI_PRO_MONTHLY,
};

const ENTITLEMENTS: Record<Plan, Entitlements> = Object.freeze({
  anonymous: Object.freeze(ANONYMOUS),
  free: Object.freeze(FREE),
  pro: Object.freeze(PRO),
});

/** The full entitlement set for a plan. */
export function getEntitlements(plan: Plan): Entitlements {
  return ENTITLEMENTS[plan];
}

/** Whether a plan has a boolean capability. The ONE gate every feature check
 *  should route through — do not read `plan === "pro"` in components. */
export function can(plan: Plan, capability: BooleanCapability): boolean {
  return getEntitlements(plan)[capability];
}

/** The numeric limit for a plan (may be `Infinity`). */
export function limitOf(plan: Plan, capability: NumericCapability): number {
  return getEntitlements(plan)[capability];
}

/**
 * Local canvases are unlimited on EVERY plan, forever. Encoded as a function so
 * no caller can accidentally gate local creation behind a plan. There is no
 * "3 free documents" — the 3 is a CLOUD limit only (see below).
 */
export function canCreateLocalCanvas(): boolean {
  return true;
}

/**
 * Whether the plan may put ANOTHER canvas in the cloud, given how many cloud
 * canvases it already has. Local canvases are never counted here — a user with
 * 27 local + 3 cloud canvases on Free can still make unlimited more LOCAL ones;
 * only a 4th CLOUD canvas triggers the upgrade path. Existing cloud canvases
 * always remain editable regardless of this result.
 */
export function canAddCloudCanvas(plan: Plan, currentCloudCount: number): boolean {
  return currentCloudCount < getEntitlements(plan).cloudCanvasLimit;
}

/* --------------------------------- pricing -------------------------------- */

/** Canonical pricing. The ONLY place prices live — derive everything else. */
export const PRICING = Object.freeze({
  currency: "USD" as const,
  monthly: 3.99,
  annual: 29.99,
});

/** Effective monthly cost when paying annually (e.g. ~2.4992). */
export function annualMonthlyEquivalent(): number {
  return PRICING.annual / 12;
}

/** Absolute yearly saving of annual vs. 12× monthly (e.g. 17.89). */
export function annualSavingsUsd(): number {
  return PRICING.monthly * 12 - PRICING.annual;
}

/** Fractional saving of annual vs. 12× monthly (e.g. ~0.3736 → ~37%). */
export function annualSavingsPercent(): number {
  const monthlyAnnualized = PRICING.monthly * 12;
  return (monthlyAnnualized - PRICING.annual) / monthlyAnnualized;
}

/* --------------------------- shipped benefits ----------------------------- */
// The Entitlements table above gates features and intentionally includes FUTURE
// capabilities (folders, version history, sharing, pro export formats, AI). Those
// must NEVER leak into sales copy. These two lists are the SINGLE SOURCE OF TRUTH
// for what conversion UI may claim — only benefits that are actually shipped and
// wired to real behavior today. Outcome-framed and verified: unlimited cloud
// canvases (canAddCloudCanvas) and cross-device cloud sync (the cloud engine) are
// live; everything else Pro remains future and is deliberately absent here.

/** The only Pro benefits sales UI may render today. */
export const SHIPPED_PRO_BENEFITS = [
  "Unlimited cloud canvases",
  "Open your canvases on any device",
  "Your cloud canvases stay backed up and in sync",
  "Support ongoing NoteDrift development",
] as const;

/** What every Free user already gets, for an honest comparison. */
export const SHIPPED_FREE_BENEFITS = [
  "Every drawing & writing tool",
  "Unlimited local canvases",
  "PNG export",
  "3 cloud canvases",
] as const;
