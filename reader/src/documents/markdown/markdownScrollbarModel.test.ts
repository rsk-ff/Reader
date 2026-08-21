import { describe, expect, it } from "vitest";

import {
  getMarkdownScrollbarMetrics,
  getScrollTopForThumb,
} from "./markdownScrollbarModel";

describe("Markdown scrollbar geometry", () => {
  it("maps the thumb position to the same document ratio", () => {
    const metrics = getMarkdownScrollbarMetrics(700, 14_000, 3_325);

    expect(metrics.thumbHeight).toBe(35);
    expect(metrics.thumbTop).toBeCloseTo(166.25);
    expect(getScrollTopForThumb(metrics.thumbTop, metrics)).toBeCloseTo(3_325);
  });

  it("uses a grabbable minimum thumb and clamps either end", () => {
    const metrics = getMarkdownScrollbarMetrics(688, 41_000, 0);

    expect(metrics.thumbHeight).toBe(28);
    expect(getScrollTopForThumb(-100, metrics)).toBe(0);
    expect(getScrollTopForThumb(10_000, metrics)).toBe(metrics.scrollRange);
  });

  it("hides scrolling geometry when content fits", () => {
    const metrics = getMarkdownScrollbarMetrics(700, 500, 0);

    expect(metrics.scrollRange).toBe(0);
    expect(metrics.thumbRange).toBe(0);
    expect(metrics.thumbHeight).toBe(700);
  });
});
