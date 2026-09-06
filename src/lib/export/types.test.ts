// Export entitlement + upgrade-context mapping tests. Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EXPORT_CAPABILITY, EXPORT_MENU, KIND_UPGRADE_CONTEXT } from "./types.ts";

test("every menu export kind has a capability and an upgrade context", () => {
  for (const m of EXPORT_MENU) {
    assert.ok(EXPORT_CAPABILITY[m.kind], `no capability for ${m.kind}`);
    assert.ok(KIND_UPGRADE_CONTEXT[m.kind], `no upgrade context for ${m.kind}`);
  }
});

test("free kinds are Free; pro kinds map to a specific export upgrade context", () => {
  assert.equal(EXPORT_CAPABILITY["png-standard"], "standardPNG");
  assert.equal(EXPORT_CAPABILITY["pdf-standard"], "standardPDF");
  assert.equal(EXPORT_MENU.find((m) => m.kind === "png-standard")?.pro, false);
  assert.equal(EXPORT_MENU.find((m) => m.kind === "pdf-standard")?.pro, false);

  assert.equal(KIND_UPGRADE_CONTEXT["png-hd"], "hd-export");
  assert.equal(KIND_UPGRADE_CONTEXT["png-transparent"], "transparent-export");
  assert.equal(KIND_UPGRADE_CONTEXT["svg"], "svg-export");
  assert.equal(KIND_UPGRADE_CONTEXT["png-selection"], "selection-export");
  assert.equal(KIND_UPGRADE_CONTEXT["custom"], "custom-size");
  assert.equal(KIND_UPGRADE_CONTEXT["pdf-multi"], "multi-page-pdf");
  // Every pro menu item is really flagged pro.
  for (const m of EXPORT_MENU) {
    if (m.pro) assert.notEqual(EXPORT_CAPABILITY[m.kind], "standardPNG");
  }
});
