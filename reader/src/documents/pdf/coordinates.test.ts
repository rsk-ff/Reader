import { describe, expect, it } from "vitest";

import { clipScreenRect, pdfRectToScreen, pdfToScreen, screenToPdf } from "./coordinates";
import type { PageGeom } from "./coordinates";

describe("PDF coordinate transforms", () => {
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
