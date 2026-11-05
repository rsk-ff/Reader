import { describe, expect, it } from "vitest";

import { clipScreenRect, mergeSelectionRects, pdfRectToScreen, pdfToScreen, rectToQuad, screenToPdf } from "./coordinates";
import type { PageGeom } from "./coordinates";

describe("PDF coordinate transforms", () => {
  it("merges overlapping selection rects into one run per line", () => {
    const merged = mergeSelectionRects([
      // line 1: two spans, a duplicate inner box and a tall element box
      { left: 10, top: 100, right: 60, bottom: 120 },
      { left: 60, top: 100, right: 200, bottom: 120 },
      { left: 12, top: 101, right: 58, bottom: 119 },
      { left: 10, top: 96, right: 200, bottom: 124 },
      // line 2 overlaps line 1 by 4px
      { left: 10, top: 116, right: 150, bottom: 136 },
      // a second column on line 2
      { left: 400, top: 116, right: 500, bottom: 136 },
    ]);
    expect(merged).toEqual([
      { left: 10, top: 100, right: 200, bottom: 118 },
      { left: 10, top: 118, right: 150, bottom: 136 },
      { left: 400, top: 118, right: 500, bottom: 136 },
    ]);
  });

  it("orders markup quads top-left, top-right, bottom-left, bottom-right", () => {
    // Acrobat and PDF.js draw underline on the (x3,y3)-(x4,y4) edge.
    const geom: PageGeom = { w1: 600, h1: 800, scale: 1 };
    const quad = rectToQuad(geom, 10, 100, 210, 120);
    expect(quad).toEqual({ x1: 10, y1: 700, x2: 210, y2: 700, x3: 10, y3: 680, x4: 210, y4: 680 });
  });

  it("round-trips the default unrotated page transform", () => {
    const geom: PageGeom = { w1: 600, h1: 800, scale: 2 };
    const screen = pdfToScreen(geom, 10, 20);

    expect(screen).toEqual({ x: 20, y: 1560 });
    expect(screenToPdf(geom, screen.x, screen.y)).toEqual({ x: 10, y: 20 });
  });

  it("uses the PDFium affine transform for rotated pages", () => {
    const geom: PageGeom = {
      w1: 800,
      h1: 600,
      scale: 1.5,
      rotation: 90,
      transform: [0, 1, 1, 0, 0, 0],
    };
    const screen = pdfToScreen(geom, 40, 120);
    const pdf = screenToPdf(geom, screen.x, screen.y);

    expect(screen).toEqual({ x: 180, y: 60 });
    expect(pdf.x).toBeCloseTo(40);
    expect(pdf.y).toBeCloseTo(120);
  });

  it("produces positive screen bounds for PDF rectangles", () => {
    const geom: PageGeom = { w1: 600, h1: 800, scale: 2 };
    const box = pdfRectToScreen(geom, { left: 10, right: 50, bottom: 40, top: 100 });

    expect(box).toEqual({ x: 20, y: 1400, width: 80, height: 120 });
  });

  it("keeps only the current-page portion of a cross-page selection", () => {
    const page = { left: 100, top: 200, right: 500, bottom: 800 };

    expect(clipScreenRect({ left: 50, top: 700, right: 300, bottom: 900 }, page)).toEqual({
      left: 100,
      top: 700,
      right: 300,
      bottom: 800,
    });
    expect(clipScreenRect({ left: 0, top: 0, right: 50, bottom: 50 }, page)).toBeNull();
  });
});
