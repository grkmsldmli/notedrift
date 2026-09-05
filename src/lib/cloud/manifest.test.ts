import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ASSET_REF_PREFIX,
  bytesToDataUrl,
  extractAssets,
  fingerprint,
  hasDataUrlImages,
  hydrateAssets,
  manifestAssetShas,
  parseDataUrl,
  sha256Hex,
} from "./manifest.ts";

const IMG_A = "data:image/png;base64,iVBORw0KGgoAAAA=";
const IMG_B = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

// A Fabric-style doc with a root image, an http-url image (left alone), and a
// nested image inside a group — plus a duplicate of IMG_A to test dedupe.
function sampleDoc() {
  return {
    version: "6.0.0",
    objects: [
      { type: "image", src: IMG_A, left: 10 },
      { type: "image", src: "https://example.com/logo.png", left: 20 },
      {
        type: "group",
        objects: [
          { type: "image", src: IMG_B, left: 0 },
          { type: "image", src: IMG_A, left: 5 }, // duplicate of IMG_A
        ],
      },
    ],
  };
}

test("parseDataUrl + bytesToDataUrl round-trip", () => {
  const { mime, bytes } = parseDataUrl(IMG_A);
  assert.equal(mime, "image/png");
  assert.ok(bytes.length > 0);
  const back = bytesToDataUrl(bytes, mime);
  assert.deepEqual(parseDataUrl(back).bytes, bytes);
});

test("extractAssets externalizes every embedded image, recursing groups, deduped", async () => {
  const { manifest, assets } = await extractAssets(sampleDoc());
  // two distinct assets (IMG_A appears twice -> deduped)
  assert.equal(assets.length, 2);
  const shaA = await sha256Hex(parseDataUrl(IMG_A).bytes);
  const shaB = await sha256Hex(parseDataUrl(IMG_B).bytes);
  assert.deepEqual(new Set(assets.map((a) => a.sha256)), new Set([shaA, shaB]));
  // manifest srcs are refs / untouched http url — NO data URLs remain
  assert.equal(hasDataUrlImages(manifest), false);
  const objs = (manifest as { objects: { src?: string; objects?: { src: string }[] }[] }).objects;
  assert.equal(objs[0].src, ASSET_REF_PREFIX + shaA);
  assert.equal(objs[1].src, "https://example.com/logo.png"); // non-data left as-is
  assert.equal(objs[2].objects![0].src, ASSET_REF_PREFIX + shaB); // nested
  assert.equal(objs[2].objects![1].src, ASSET_REF_PREFIX + shaA); // nested duplicate
});

test("manifestAssetShas lists the referenced assets", async () => {
  const { manifest } = await extractAssets(sampleDoc());
  const shaA = await sha256Hex(parseDataUrl(IMG_A).bytes);
  const shaB = await sha256Hex(parseDataUrl(IMG_B).bytes);
  assert.deepEqual(new Set(manifestAssetShas(manifest)), new Set([shaA, shaB]));
});

test("hydrateAssets restores data URLs from resolved assets (round-trip)", async () => {
  const doc = sampleDoc();
  const { manifest, assets } = await extractAssets(doc);
  const byId = new Map(assets.map((a) => [a.sha256, a.dataUrl]));
  const hydrated = hydrateAssets(manifest, (sha) => byId.get(sha));
  assert.deepEqual(hydrated, doc);
  assert.equal(hasDataUrlImages(hydrated), true);
});

test("hydrateAssets leaves unresolved refs untouched (missing asset)", () => {
  const manifest = { objects: [{ type: "image", src: ASSET_REF_PREFIX + "deadbeef" }] };
  const out = hydrateAssets(manifest, () => undefined) as { objects: { src: string }[] };
  assert.equal(out.objects[0].src, ASSET_REF_PREFIX + "deadbeef");
});

test("fingerprint is stable and sensitive to title + content", async () => {
  const { manifest } = await extractAssets(sampleDoc());
  const f1 = await fingerprint("A", manifest);
  const f2 = await fingerprint("A", manifest);
  const f3 = await fingerprint("B", manifest);
  assert.equal(f1, f2);
  assert.notEqual(f1, f3);
  const f4 = await fingerprint("A", { ...manifest, extra: 1 } as typeof manifest);
  assert.notEqual(f1, f4);
});

test("an image-free doc extracts to itself with no assets", async () => {
  const doc = { version: "6", objects: [{ type: "rect", left: 1 }] };
  const { manifest, assets } = await extractAssets(doc);
  assert.equal(assets.length, 0);
  assert.deepEqual(manifest, doc);
});
