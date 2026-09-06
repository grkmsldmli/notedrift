// SEO regression guards. Run with `npm test`. These fail the build if the SEO
// invariants that protect our organic ranking ever regress: duplicate titles,
// orphaned/unreachable tools, broken internal links, phantom (unbuilt) indexed
// routes, or a malformed canonical. Pure data checks over the registries — no DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import { allToolRoutes } from "./tool-routes.ts";
import { absoluteUrl, breadcrumbList, webApplication, toolBreadcrumb } from "./structured-data.ts";
import {
  TOOLS,
  CATEGORY_ORDER,
  getTool,
  relatedTools,
  toolsInCategory,
} from "../convert/registry.ts";
import { AUDIO_TOOLS } from "../audio/tools.ts";

/* ------------------------------ unique titles ----------------------------- */

test("every indexable tool route has a UNIQUE SEO title (no duplicate-title penalty)", () => {
  const routes = allToolRoutes();
  const titles = routes.map((r) => r.seoTitle);
  const dupes = titles.filter((t, i) => titles.indexOf(t) !== i);
  assert.deepEqual([...new Set(dupes)], [], `duplicate SEO titles: ${[...new Set(dupes)].join(" | ")}`);
});

test("every indexable tool route has a UNIQUE path and slug", () => {
  const routes = allToolRoutes();
  const paths = routes.map((r) => r.path);
  assert.equal(new Set(paths).size, paths.length, "duplicate tool paths");
  const slugs = routes.map((r) => r.slug);
  assert.equal(new Set(slugs).size, slugs.length, "duplicate tool slugs (converter/audio/standalone collision)");
});

test("SEO titles are non-empty and end with the brand", () => {
  for (const r of allToolRoutes()) {
    assert.ok(r.seoTitle.length > 0, `empty title for ${r.slug}`);
    assert.ok(/NoteDrift/.test(r.seoTitle), `title missing brand for ${r.slug}: "${r.seoTitle}"`);
  }
});

/* --------------------------- orphan / reachability ------------------------ */

test("no orphan tools: every converter is in a LISTED category (reachable from /tools)", () => {
  // The /tools hub renders exactly toolsInCategory(cat) for cat in CATEGORY_ORDER,
  // so a tool whose category isn't listed would be unreachable (orphaned).
  const listed = new Set(CATEGORY_ORDER.flatMap((c) => toolsInCategory(c)).map((t) => t.slug));
  for (const t of TOOLS) {
    assert.ok(listed.has(t.slug), `orphan tool not shown on /tools: ${t.slug} (category "${t.category}")`);
  }
});

test("every 'related tools' link resolves to a real tool (no broken internal links)", () => {
  for (const t of TOOLS) {
    for (const slug of t.related) {
      assert.ok(getTool(slug), `tool "${t.slug}" links to missing related tool "${slug}"`);
    }
    // relatedTools() must only ever surface real tools.
    for (const r of relatedTools(t)) assert.ok(getTool(r.slug), `relatedTools returned phantom ${r.slug}`);
  }
});

test("a tool never lists itself as related", () => {
  for (const t of TOOLS) {
    assert.ok(!t.related.includes(t.slug), `${t.slug} lists itself as related`);
  }
});

/* -------------------------- index-only-finished --------------------------- */

test("indexable routes contain ONLY finished, registered tools (no phantom pages)", () => {
  const known = new Set([...TOOLS.map((t) => t.slug), ...AUDIO_TOOLS.map((t) => t.slug), "edit-pdf"]);
  for (const r of allToolRoutes()) {
    assert.ok(known.has(r.slug), `indexed route is not a finished/registered tool: ${r.slug}`);
  }
});

/* ------------------------------ canonical / URLs -------------------------- */

test("absoluteUrl builds correct canonical URLs", () => {
  assert.match(absoluteUrl("/tools/png-to-jpg"), /^https?:\/\/[^/]+\/tools\/png-to-jpg$/);
  assert.equal(absoluteUrl("https://x.test/y"), "https://x.test/y"); // pass-through
  assert.match(absoluteUrl("tools/x"), /\/tools\/x$/); // tolerates missing leading slash
});

/* --------------------------- structured data ------------------------------ */

test("breadcrumbList produces ordered ListItems with absolute URLs", () => {
  const bc = breadcrumbList([
    { name: "NoteDrift", path: "/" },
    { name: "Free Tools", path: "/tools" },
  ]) as { itemListElement: Array<{ position: number; name: string; item: string }> };
  assert.equal(bc.itemListElement.length, 2);
  assert.equal(bc.itemListElement[0].position, 1);
  assert.equal(bc.itemListElement[1].position, 2);
  assert.match(bc.itemListElement[1].item, /\/tools$/);
});

test("toolBreadcrumb yields Home › Free Tools › <tool> (3 levels)", () => {
  const bc = toolBreadcrumb("PNG to JPG", "/tools/png-to-jpg") as {
    itemListElement: Array<{ name: string; position: number }>;
  };
  assert.equal(bc.itemListElement.length, 3);
  assert.equal(bc.itemListElement[2].name, "PNG to JPG");
});

test("webApplication is a free, browser-based WebApplication", () => {
  const wa = webApplication({ name: "X", description: "d", path: "/tools/x" }) as Record<string, unknown>;
  assert.equal(wa["@type"], "WebApplication");
  assert.equal(wa.isAccessibleForFree, true);
  assert.match(String(wa.url), /\/tools\/x$/);
});
