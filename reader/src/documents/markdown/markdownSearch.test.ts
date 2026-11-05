import { describe, expect, it } from "vitest";

import { findMatches, wrapIndex } from "./markdownSearch";

describe("Markdown find", () => {
  it("finds case-insensitive, non-overlapping matches", () => {
    expect(findMatches("Aaa aAA", "aa")).toEqual([
      { start: 0, end: 2 },
      { start: 4, end: 6 },
    ]);
    expect(findMatches("中文内容，中文", "中文")).toEqual([
      { start: 0, end: 2 },
      { start: 5, end: 7 },
    ]);
    expect(findMatches("anything", "")).toEqual([]);
  });

  it("wraps the current match in both directions", () => {
    expect(wrapIndex(-1, 3)).toBe(2);
    expect(wrapIndex(3, 3)).toBe(0);
    expect(wrapIndex(5, 0)).toBe(0);
  });
});
