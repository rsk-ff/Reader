import { describe, expect, it } from "vitest";

import { blankPageInsertArgs, pdfFileUrl, toPdfPageIndex } from "./pdfModel";

describe("PDF view model", () => {
  it("converts UI page numbers to PDFium indexes exactly once", () => {
    expect(toPdfPageIndex(1)).toBe(0);
    expect(toPdfPageIndex(7)).toBe(6);
    expect(() => toPdfPageIndex(0)).toThrow(RangeError);
  });

  it("builds a revisioned PDF.js Range URL", () => {
    const url = pdfFileUrl("C:\\docs\\a b.pdf", 12);
    expect(url).toBe("http://reader-file.localhost/C%3A%5Cdocs%5Ca%20b.pdf?rev=12");
  });

  it("serializes blank-page insertion with the backend's lowercase enum", () => {
    expect(blankPageInsertArgs(3, "before")).toEqual({
      index: 2,
      size: "same",
      referencePageIndex: 2,
    });
    expect(blankPageInsertArgs(3, "after")).toEqual({
      index: 3,
      size: "same",
      referencePageIndex: 2,
    });
  });
});
