import { describe, expect, it } from "vitest";
import { gridFor, layoutSheets, paperCount, parsePageRange, resolveLandscape, type SheetArea } from "./printLayout";

const A4 = { width: 595.28, height: 841.89 };
const A4_LANDSCAPE = { width: 841.89, height: 595.28 };
const area: SheetArea = { paperWidth: 210, paperHeight: 297, left: 5, top: 5, width: 200, height: 287 };

describe("parsePageRange", () => {
  it("reads lists, ranges and open ends", () => {
    expect(parsePageRange("1-3, 5", 10)).toEqual({ pages: [0, 1, 2, 4] });
    expect(parsePageRange("8-", 10)).toEqual({ pages: [7, 8, 9] });
    expect(parsePageRange("-2", 10)).toEqual({ pages: [0, 1] });
    expect(parsePageRange("3，1、2", 10)).toEqual({ pages: [0, 1, 2] });
    expect(parsePageRange("2 - 4", 10)).toEqual({ pages: [1, 2, 3] });
  });

  it("explains bad input", () => {
    expect(parsePageRange("", 10)).toHaveProperty("error");
    expect(parsePageRange("11", 10)).toEqual({ error: "页码超出范围，共 10 页" });
    expect(parsePageRange("5-2", 10)).toHaveProperty("error");
    expect(parsePageRange("a", 10)).toHaveProperty("error");
    expect(parsePageRange("0", 10)).toHaveProperty("error");
  });
});

describe("layout", () => {
  it("puts more pages along the long side", () => {
    expect(gridFor(2, false)).toEqual({ cols: 1, rows: 2 });
    expect(gridFor(2, true)).toEqual({ cols: 2, rows: 1 });
    expect(gridFor(6, true)).toEqual({ cols: 3, rows: 2 });
  });

  it("auto orientation follows the page, or the larger N-up result", () => {
    const paper = { width: 210, height: 297 };
    expect(resolveLandscape("auto", 1, A4_LANDSCAPE, paper)).toBe(true);
    expect(resolveLandscape("auto", 1, A4, paper)).toBe(false);
    expect(resolveLandscape("auto", 2, A4, paper)).toBe(true);
    expect(resolveLandscape("auto", 4, A4, paper)).toBe(false);
    expect(resolveLandscape("portrait", 2, A4, paper)).toBe(false);
  });

  it("fits a page into the printable area, centred", () => {
    const [[placement]] = layoutSheets([0], () => A4, area, 1, "fit");
    expect(placement.rotate).toBe(0);
    expect(placement.width).toBeCloseTo(200, 1);
    expect(placement.height).toBeLessThanOrEqual(287);
    expect(placement.x + placement.width / 2).toBeCloseTo(105, 1);
  });

  it("turns a landscape page on a portrait sheet", () => {
    const [[placement]] = layoutSheets([0], () => A4_LANDSCAPE, area, 1, "fit");
    expect(placement.rotate).toBe(1);
    expect(placement.width).toBeLessThan(placement.height);
  });

  it("keeps actual size centred on the paper", () => {
    const [[placement]] = layoutSheets([0], () => A4, area, 1, "actual");
    expect(placement.x).toBeCloseTo(0, 1);
    expect(placement.width).toBeCloseTo(210, 1);
  });

  it("groups pages per sheet in reading order", () => {
    const landscape: SheetArea = { paperWidth: 297, paperHeight: 210, left: 5, top: 5, width: 287, height: 200 };
    const sheets = layoutSheets([0, 1, 2, 4, 6], () => A4, landscape, 2, "fit");
    expect(sheets.map((sheet) => sheet.map((placement) => placement.page))).toEqual([[0, 1], [2, 4], [6]]);
    expect(sheets[0][0].x).toBeLessThan(sheets[0][1].x);
    expect(sheets[0][0].x + sheets[0][0].width).toBeLessThanOrEqual(sheets[0][1].x);
  });

  it("counts paper with duplex and copies", () => {
    expect(paperCount(5, 1, false)).toBe(5);
    expect(paperCount(5, 2, true)).toBe(6);
  });
});
