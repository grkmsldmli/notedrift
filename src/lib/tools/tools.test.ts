// Tool Factory tests: pure helpers (word counter, PDF page parsing) + registry
// integrity (unique routes, reachable, related links resolve, cross-sell present).
// Run with `npm test`. No DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import { countTextStats } from "./text-stats.ts";
import { parsePageList, parsePageRangeGroups } from "./pdf.ts";
import {
  FACTORY_TOOLS,
  FACTORY_CATEGORY_ORDER,
  factoryToolsInCategory,
  getFactoryTool,
} from "./factory.ts";
import { resolveToolLink } from "./links.ts";
import { allToolRoutes } from "../seo/tool-routes.ts";

/* ------------------------------ word counter ------------------------------ */

test("countTextStats counts words, characters and no-space characters", () => {
  const s = countTextStats("Hello world");
  assert.equal(s.words, 2);
  assert.equal(s.characters, 11);
  assert.equal(s.charactersNoSpaces, 10);
});

test("countTextStats is empty on empty/whitespace input", () => {
  const s = countTextStats("   \n  ");
  assert.equal(s.words, 0);
  assert.equal(s.sentences, 0);
  assert.equal(s.paragraphs, 0);
  assert.equal(s.readingTime, "0 sec");
});

test("countTextStats counts sentences and paragraphs", () => {
  const s = countTextStats("One two. Three four! Five?\n\nSecond paragraph here.");
  assert.equal(s.sentences, 4);
  assert.equal(s.paragraphs, 2);
});

test("countTextStats reading time scales with length", () => {
  assert.match(countTextStats("word ".repeat(20)).readingTime, /sec/);
  assert.match(countTextStats("word ".repeat(600)).readingTime, /min/);
});

/* ---------------------------- pdf page parsing ---------------------------- */

test("parsePageList flattens, sorts, dedupes and clamps", () => {
  assert.deepEqual(parsePageList("1-3, 5", 10), [1, 2, 3, 5]);
  assert.deepEqual(parsePageList("3-1", 10), [1, 2, 3]); // reversed
  assert.deepEqual(parsePageList("5, 5, 2", 10), [2, 5]); // dedupe
  assert.deepEqual(parsePageList("1, 99, abc", 10), [1]); // out-of-range + junk ignored
  assert.deepEqual(parsePageList("", 10), []);
});

test("parsePageRangeGroups keeps ordered groups and drops empties", () => {
  assert.deepEqual(parsePageRangeGroups("1-3, 5, 7-8", 10), [[1, 2, 3], [5], [7, 8]]);
  assert.deepEqual(parsePageRangeGroups("1-3, , 99", 5), [[1, 2, 3]]); // empty + out-of-range dropped
  assert.deepEqual(parsePageRangeGroups("2-4", 3), [[2, 3]]); // clamp to total
});

/* --------------------------- registry integrity --------------------------- */

test("factory tools have unique slugs, seoTitles and titles", () => {
  const slugs = FACTORY_TOOLS.map((t) => t.slug);
  assert.equal(new Set(slugs).size, slugs.length, "duplicate factory slug");
  const seo = FACTORY_TOOLS.map((t) => t.seoTitle);
  assert.equal(new Set(seo).size, seo.length, "duplicate factory seoTitle");
  const titles = FACTORY_TOOLS.map((t) => t.title);
  assert.equal(new Set(titles).size, titles.length, "duplicate factory H1/title");
});

test("every factory tool is in a listed category (reachable from /tools)", () => {
  const listed = new Set(FACTORY_CATEGORY_ORDER.flatMap((c) => factoryToolsInCategory(c)).map((t) => t.slug));
  for (const t of FACTORY_TOOLS) assert.ok(listed.has(t.slug), `orphan factory tool: ${t.slug}`);
});

test("every related link and cross-sell resolves (no broken internal links)", () => {
  for (const t of FACTORY_TOOLS) {
    assert.ok(!t.related.includes(t.slug), `${t.slug} lists itself as related`);
    for (const r of t.related) {
      assert.ok(resolveToolLink(r), `${t.slug} → missing related "${r}"`);
    }
    assert.ok(t.crossSell.href.length > 0, `${t.slug} missing cross-sell href`);
    assert.ok(t.crossSell.label.length > 0 && t.crossSell.sub.length > 0, `${t.slug} incomplete cross-sell`);
    assert.ok(t.howTo.length > 0 && t.about.length > 0 && t.useCases.length > 0, `${t.slug} missing content`);
  }
});

test("resolveToolLink finds tools across every registry, null otherwise", () => {
  assert.equal(resolveToolLink("merge-pdf")?.title, "Merge PDF"); // factory
  assert.equal(resolveToolLink("png-to-jpg")?.title, "PNG to JPG"); // converter
  assert.equal(resolveToolLink("metronome")?.title, "Metronome"); // audio
  assert.equal(resolveToolLink("edit-pdf")?.title, "Edit PDF"); // standalone
  assert.equal(resolveToolLink("does-not-exist"), null);
});

test("factory routes are included in the indexable sitemap source", () => {
  const routeSlugs = new Set(allToolRoutes().map((r) => r.slug));
  for (const t of FACTORY_TOOLS) {
    assert.ok(routeSlugs.has(t.slug), `factory tool not in allToolRoutes: ${t.slug}`);
  }
  assert.ok(getFactoryTool("qr-code-generator"), "getFactoryTool works");
});
