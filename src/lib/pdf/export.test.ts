import assert from "node:assert/strict";
import { test } from "node:test";

import type { PageGeometry } from "./coordinates.ts";
import { displayToPdf } from "./coordinates.ts";
import {
  arrowHead,
  boxCorners,
  ellipseBeziers,
  exportFilename,
  isWinAnsiText,
  liberationFile,
  pdfColor,
  rotateDisplay,
  standardFontKey,
  toSvgPoint,
} from "./exportGeometry.ts";

const LETTER: PageGeometry = { width: 612, height: 792, rotation: 0 };

test("exportFilename appends -edited and strips .pdf", () => {
  assert.equal(exportFilename("report.pdf"), "report-edited.pdf");
  assert.equal(exportFilename("report.PDF"), "report-edited.pdf");
  assert.equal(exportFilename("notes"), "notes-edited.pdf");
  assert.equal(exportFilename("   "), "document-edited.pdf");
});

test("pdfColor maps hex to 0..1 components", () => {
  assert.deepEqual(pdfColor("#ff0000"), { r: 1, g: 0, b: 0 });
  assert.deepEqual(pdfColor("#000000"), { r: 0, g: 0, b: 0 });
  const g = pdfColor("#808080");
  assert.ok(Math.abs(g.r - 128 / 255) < 1e-9);
});

test("standardFontKey covers family × weight × style", () => {
  assert.equal(standardFontKey("sans", false, false), "Helvetica");
  assert.equal(standardFontKey("sans", true, true), "Helvetica-BoldOblique");
  assert.equal(standardFontKey("serif", true, false), "Times-Bold");
  assert.equal(standardFontKey("serif", false, true), "Times-Italic");
  assert.equal(standardFontKey("mono", true, true), "Courier-BoldOblique");
});

test("liberationFile picks the right TTF", () => {
  assert.equal(liberationFile(false, false), "LiberationSans-Regular.ttf");
  assert.equal(liberationFile(true, true), "LiberationSans-BoldItalic.ttf");
});

test("isWinAnsiText accepts Latin-1 + CP1252 extras, rejects other scripts/symbols", () => {
  assert.equal(isWinAnsiText("Café déjà — €5"), true);
  assert.equal(isWinAnsiText("hello world"), true);
  assert.equal(isWinAnsiText("Ω greek"), false);
  assert.equal(isWinAnsiText("✔ check"), false);
  assert.equal(isWinAnsiText("日本語"), false);
});

test("rotateDisplay rotates clockwise in y-down space", () => {
  const r = rotateDisplay({ x: 1, y: 0 }, { x: 0, y: 0 }, 90);
  assert.ok(Math.abs(r.x - 0) < 1e-9 && Math.abs(r.y - 1) < 1e-9); // right → down
});

test("boxCorners returns 4 corners; unrotated box is axis-aligned", () => {
  const c = boxCorners(100, 100, 40, 20, 0);
  assert.equal(c.length, 4);
  assert.deepEqual(c[0], { x: 80, y: 90 });
  assert.deepEqual(c[2], { x: 120, y: 110 });
});

test("ellipseBeziers starts at the right vertex with 4 segments", () => {
  const e = ellipseBeziers(100, 100, 50, 30, 0);
  assert.deepEqual(e.start, { x: 150, y: 100 });
  assert.equal(e.segments.length, 4);
  assert.deepEqual(e.segments[0].end, { x: 100, y: 130 });
});

test("arrowHead tip sits at the end point", () => {
  const h = arrowHead(0, 0, 100, 0, 3);
  assert.deepEqual(h.tip, { x: 100, y: 0 });
  // base is behind the tip on the shaft (x < 100), symmetric in y
  assert.ok(h.left.x < 100 && h.right.x < 100);
  assert.ok(Math.abs(h.left.y + h.right.y) < 1e-9);
});

test("toSvgPoint = displayToPdf with y negated (rotation 0)", () => {
  assert.deepEqual(toSvgPoint({ x: 0, y: 792 }, LETTER), { x: 0, y: 0 }); // display top-left → PDF (0,0)
  assert.deepEqual(toSvgPoint({ x: 0, y: 0 }, LETTER), { x: 0, y: -792 }); // display bottom-left
});

test("the 5 canonical positions map correctly and are zoom-independent", () => {
  // Overlays store display-space geometry, so the editor zoom never enters the
  // export mapping — displayToPdf is a function of the point + page only.
  const cases: Record<string, { display: { x: number; y: number }; pdf: { x: number; y: number } }> = {
    topLeft: { display: { x: 0, y: 0 }, pdf: { x: 0, y: 792 } },
    topRight: { display: { x: 612, y: 0 }, pdf: { x: 612, y: 792 } },
    bottomLeft: { display: { x: 0, y: 792 }, pdf: { x: 0, y: 0 } },
    bottomRight: { display: { x: 612, y: 792 }, pdf: { x: 612, y: 0 } },
    center: { display: { x: 306, y: 396 }, pdf: { x: 306, y: 396 } },
  };
  for (const [name, c] of Object.entries(cases)) {
    const got = displayToPdf(c.display, LETTER);
    assert.ok(Math.abs(got.x - c.pdf.x) < 1e-9 && Math.abs(got.y - c.pdf.y) < 1e-9, name);
  }
});

test("landscape + rotated pages round-trip through display space", () => {
  for (const page of [
    { width: 792, height: 612, rotation: 0 } as PageGeometry,
    { width: 612, height: 792, rotation: 90 } as PageGeometry,
    { width: 612, height: 792, rotation: 270 } as PageGeometry,
  ]) {
    for (const p of [{ x: 10, y: 10 }, { x: 300, y: 200 }]) {
      const svg = toSvgPoint(p, page);
      // svg y is the negated PDF y; recovering PDF and mapping back is exact
      const pdf = { x: svg.x, y: -svg.y };
      const back = displayToPdf(p, page);
      assert.ok(Math.abs(pdf.x - back.x) < 1e-9 && Math.abs(pdf.y - back.y) < 1e-9);
    }
  }
});
