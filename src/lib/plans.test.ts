// Tests for the Free/Pro business model (Phase 2.0). Run with `npm test`
// (node's built-in runner — no framework dependency).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PLANS,
  getEntitlements,
  can,
  limitOf,
  canCreateLocalCanvas,
  canAddCloudCanvas,
  PRICING,
  SHIPPED_PRO_BENEFITS,
  SHIPPED_FREE_BENEFITS,
  annualMonthlyEquivalent,
  annualSavingsUsd,
  annualSavingsPercent,
} from "./plans.ts";

const near = (a: number, b: number, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

/* ----------------------------- core invariants ---------------------------- */

test("core creation is NEVER plan-gated", () => {
  for (const plan of PLANS) {
    assert.equal(can(plan, "coreEditor"), true, `${plan} coreEditor`);
    assert.equal(
      can(plan, "unlimitedLocalCanvases"),
      true,
      `${plan} unlimitedLocalCanvases`,
    );
    assert.equal(can(plan, "standardPNG"), true, `${plan} standardPNG`);
    assert.equal(can(plan, "standardPDF"), true, `${plan} standardPDF`);
  }
});

test("local canvas creation is unconditionally free", () => {
  assert.equal(canCreateLocalCanvas(), true);
});

/* -------------------------------- anonymous ------------------------------- */

test("ANONYMOUS entitlements", () => {
  const e = getEntitlements("anonymous");
  assert.equal(e.coreEditor, true);
  assert.equal(e.unlimitedLocalCanvases, true);
  assert.equal(e.standardPNG, true);
  assert.equal(e.standardPDF, true);
  // no cloud
  assert.equal(e.cloudSync, false);
  assert.equal(e.cloudCanvasLimit, 0);
  // no pro features
  assert.equal(e.hdPNG, false);
  assert.equal(e.transparentPNG, false);
  assert.equal(e.svgExport, false);
  assert.equal(e.privateSharing, false);
  assert.equal(e.publicSharing, false);
});

/* ---------------------------------- free ---------------------------------- */

test("FREE entitlements", () => {
  const e = getEntitlements("free");
  assert.equal(e.coreEditor, true);
  assert.equal(e.unlimitedLocalCanvases, true);
  assert.equal(e.standardPNG, true);
  assert.equal(e.standardPDF, true);
  // cloud, but limited to 3
  assert.equal(e.cloudSync, true);
  assert.equal(e.cloudCanvasLimit, 3);
  assert.equal(e.versionHistoryDays, 7);
  // still no pro export / private sharing
  assert.equal(e.hdPNG, false);
  assert.equal(e.transparentPNG, false);
  assert.equal(e.svgExport, false);
  assert.equal(e.selectionExport, false);
  assert.equal(e.multiPagePDF, false);
  assert.equal(e.customExportSize, false);
  assert.equal(e.privateSharing, false);
  // limited public sharing is allowed
  assert.equal(e.publicSharing, true);
});

/* ----------------------------------- pro ---------------------------------- */

test("PRO entitlements", () => {
  const e = getEntitlements("pro");
  assert.equal(e.coreEditor, true);
  assert.equal(e.unlimitedLocalCanvases, true);
  assert.equal(e.cloudSync, true);
  assert.equal(e.cloudCanvasLimit, Number.POSITIVE_INFINITY);
  assert.equal(e.versionHistoryDays, Number.POSITIVE_INFINITY);
  assert.equal(e.hdPNG, true);
  assert.equal(e.transparentPNG, true);
  assert.equal(e.svgExport, true);
  assert.equal(e.selectionExport, true);
  assert.equal(e.multiPagePDF, true);
  assert.equal(e.customExportSize, true);
  assert.equal(e.privateSharing, true);
  assert.equal(e.publicSharing, true);
  assert.equal(e.collaboration, true);
  assert.equal(e.folders, true);
});

/* ---------------------- cloud limit ≠ local limit ------------------------- */

test("cloud limit gates only the cloud, never local creation", () => {
  // Free: 3 cloud slots.
  assert.equal(canAddCloudCanvas("free", 0), true);
  assert.equal(canAddCloudCanvas("free", 2), true);
  assert.equal(canAddCloudCanvas("free", 3), false); // 4th cloud → upgrade path
  // A free user with 27 local + 3 cloud can still make local canvases forever.
  assert.equal(canCreateLocalCanvas(), true);
  assert.equal(canAddCloudCanvas("free", 3), false); // but not a 4th cloud one
  // Anonymous has no cloud at all.
  assert.equal(canAddCloudCanvas("anonymous", 0), false);
  // Pro is unlimited.
  assert.equal(canAddCloudCanvas("pro", 0), true);
  assert.equal(canAddCloudCanvas("pro", 9999), true);
});

test("pro cloud > free cloud > anonymous cloud", () => {
  assert.ok(
    limitOf("pro", "cloudCanvasLimit") > limitOf("free", "cloudCanvasLimit"),
  );
  assert.ok(
    limitOf("free", "cloudCanvasLimit") > limitOf("anonymous", "cloudCanvasLimit"),
  );
});

test("AI allowance scales anon → free → pro", () => {
  assert.equal(limitOf("anonymous", "aiMonthlyActions"), 0);
  assert.ok(limitOf("free", "aiMonthlyActions") > 0);
  assert.ok(
    limitOf("pro", "aiMonthlyActions") > limitOf("free", "aiMonthlyActions"),
  );
});

/* -------------------------------- pricing --------------------------------- */

test("canonical pricing", () => {
  assert.equal(PRICING.monthly, 3.99);
  assert.equal(PRICING.annual, 29.99);
  assert.equal(PRICING.currency, "USD");
});

test("pricing math derives from the canonical constants", () => {
  near(annualMonthlyEquivalent(), 29.99 / 12); // ~2.4992
  near(annualSavingsUsd(), 3.99 * 12 - 29.99); // 17.89
  near(annualSavingsPercent(), (3.99 * 12 - 29.99) / (3.99 * 12)); // ~0.3736
  // sanity: the headline "~37%" saving
  assert.ok(Math.round(annualSavingsPercent() * 100) === 37);
});

/* -------------------------- entitlement plumbing -------------------------- */

test("can()/limitOf() read the same source as getEntitlements()", () => {
  for (const plan of PLANS) {
    const e = getEntitlements(plan);
    assert.equal(can(plan, "hdPNG"), e.hdPNG);
    assert.equal(limitOf(plan, "cloudCanvasLimit"), e.cloudCanvasLimit);
  }
});

test("entitlement objects are frozen (immutable at runtime)", () => {
  const e = getEntitlements("free") as { hdPNG: boolean };
  assert.throws(() => {
    "use strict";
    e.hdPNG = true;
  });
});

/* -------------------- shipped-benefit truth source ------------------------ */

test("SHIPPED_PRO_BENEFITS never advertises an UNBUILT future feature", () => {
  // Guards sales copy: if someone pastes a future entitlement (folders, version
  // history, sharing, collaboration, pro export formats, AI…) into the list, this
  // fails. Only shipped, wired benefits may be sold.
  const FORBIDDEN =
    /folder|history|version|collaborat|shar|svg|4k|transparent|multi-?page|\bpdf\b|\bai\b|watermark|sso|export format|custom size|selection export|hd png/i;
  assert.ok(SHIPPED_PRO_BENEFITS.length >= 1);
  for (const b of SHIPPED_PRO_BENEFITS) {
    assert.equal(typeof b, "string");
    assert.ok(b.length > 0);
    assert.equal(FORBIDDEN.test(b), false, `benefit advertises an unbuilt feature: "${b}"`);
  }
  // The primary claim must be backed by a real, wired entitlement.
  assert.equal(limitOf("pro", "cloudCanvasLimit"), Number.POSITIVE_INFINITY);
  assert.ok(SHIPPED_PRO_BENEFITS.some((b) => /unlimited cloud/i.test(b)));
});

test("SHIPPED_FREE_BENEFITS reflects the real Free tier (3 cloud, PNG, unlimited local)", () => {
  assert.equal(limitOf("free", "cloudCanvasLimit"), 3);
  assert.equal(can("free", "standardPNG"), true);
  assert.ok(SHIPPED_FREE_BENEFITS.some((b) => /3 cloud/i.test(b)));
  assert.ok(SHIPPED_FREE_BENEFITS.some((b) => /unlimited local/i.test(b)));
});
