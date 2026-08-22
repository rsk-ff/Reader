import { describe, expect, it } from "vitest";

import { shouldLoadPdf, shouldRefit, shouldRenderPortals, hostsEqual } from "./pdfViewerPolicy";

describe("shouldLoadPdf", () => {
  it("does not load a never-activated tab", () => {
    expect(shouldLoadPdf(false, false)).toBe(false);
  });

  it("loads on first activation", () => {
    expect(shouldLoadPdf(true, false)).toBe(true);
  });

  it("keeps a previously activated tab loaded while inactive", () => {
    expect(shouldLoadPdf(false, true)).toBe(true);
  });

  it("keeps a previously activated tab loaded while active", () => {
    expect(shouldLoadPdf(true, true)).toBe(true);
  });
});

describe("shouldRefit", () => {
  it("does no work while inactive even if size changed", () => {
    expect(shouldRefit(false, { width: 800, height: 600 }, { width: 1024, height: 768 })).toBe(false);
  });

  it("ignores zero-size containers", () => {
    expect(shouldRefit(true, { width: 800, height: 600 }, { width: 0, height: 0 })).toBe(false);
    expect(shouldRefit(true, { width: 800, height: 600 }, { width: 800, height: 0 })).toBe(false);
  });

  it("refits on the first positive observation", () => {
    expect(shouldRefit(true, { width: 0, height: 0 }, { width: 800, height: 600 })).toBe(true);
  });

  it("does not refit when the rounded size is unchanged", () => {
    expect(shouldRefit(true, { width: 800, height: 600 }, { width: 800.4, height: 599.6 })).toBe(false);
  });

  it("refits when the rounded width changes", () => {
    expect(shouldRefit(true, { width: 800, height: 600 }, { width: 1024, height: 600 })).toBe(true);
  });

  it("refits when the rounded height changes", () => {
    expect(shouldRefit(true, { width: 800, height: 600 }, { width: 800, height: 768 })).toBe(true);
  });
});

describe("shouldRenderPortals", () => {
  it("is disabled while inactive", () => {
    expect(shouldRenderPortals(false, "select", { 1: [] })).toBe(false);
  });

  it("is disabled in active select mode with no annotations", () => {
    expect(shouldRenderPortals(true, "select", {})).toBe(false);
    expect(shouldRenderPortals(true, "select", { 1: [], 2: [] })).toBe(false);
  });

  it("is enabled in active select mode when annotations exist", () => {
    expect(shouldRenderPortals(true, "select", { 1: [{} as never] })).toBe(true);
    expect(shouldRenderPortals(true, "select", { 1: [], 2: [{} as never] })).toBe(true);
  });

  it("is enabled for any creation tool even with no annotations", () => {
    for (const tool of ["highlight", "underline", "strikeout", "note", "freetext", "ink"] as const) {
      expect(shouldRenderPortals(true, tool, {})).toBe(true);
    }
  });
});

describe("hostsEqual", () => {
  it("matches identical identity sets", () => {
    expect(hostsEqual(
      [{ pageNumber: 1, scale: 1.5 }, { pageNumber: 2, scale: 1.5 }],
      [{ pageNumber: 1, scale: 1.5 }, { pageNumber: 2, scale: 1.5 }],
    )).toBe(true);
  });

  it("rejects different lengths", () => {
    expect(hostsEqual([{ pageNumber: 1, scale: 1 }], [])).toBe(false);
  });

  it("rejects different page numbers", () => {
    expect(hostsEqual(
      [{ pageNumber: 1, scale: 1 }],
      [{ pageNumber: 2, scale: 1 }],
    )).toBe(false);
  });

  it("rejects different scales", () => {
    expect(hostsEqual(
      [{ pageNumber: 1, scale: 1 }],
      [{ pageNumber: 1, scale: 1.5 }],
    )).toBe(false);
  });
});
