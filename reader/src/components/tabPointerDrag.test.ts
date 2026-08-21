import { describe, expect, it } from "vitest";

import {
  buildReorderedOrder,
  computeInsertionIndex,
  isOutsideStripBounds,
  movementExceedsThreshold,
} from "./tabPointerDrag";

function rect(id: string, left: number, width = 100): { id: string; left: number; right: number } {
  return { id, left, right: left + width };
}

describe("movementExceedsThreshold", () => {
  it("is a click below the threshold", () => {
    expect(movementExceedsThreshold(0, 0)).toBe(false);
    expect(movementExceedsThreshold(3, 2)).toBe(false); // ~3.6 < 4
  });

  it("is still a click exactly at the threshold", () => {
    expect(movementExceedsThreshold(4, 0)).toBe(false);
    expect(movementExceedsThreshold(0, 4)).toBe(false);
  });

  it("becomes a drag above the threshold", () => {
    expect(movementExceedsThreshold(4.0001, 0)).toBe(true);
    expect(movementExceedsThreshold(3, 3)).toBe(true); // ~4.24 > 4
  });

  it("honours a custom threshold", () => {
    expect(movementExceedsThreshold(5, 5, 8)).toBe(false); // ~7.07 < 8
    expect(movementExceedsThreshold(6, 6, 8)).toBe(true); // ~8.49 > 8
  });
});

describe("computeInsertionIndex", () => {
  const rects = [rect("a", 0), rect("b", 100), rect("c", 200)];

  it("inserts at the beginning before the first tab midpoint", () => {
    expect(computeInsertionIndex(rects, 10)).toBe(0);
    expect(computeInsertionIndex(rects, 49)).toBe(0);
  });

  it("inserts between tabs past the first midpoint", () => {
    expect(computeInsertionIndex(rects, 51)).toBe(1);
    expect(computeInsertionIndex(rects, 149)).toBe(1);
  });

  it("inserts between the second and third tab", () => {
    expect(computeInsertionIndex(rects, 151)).toBe(2);
  });

  it("inserts after the final tab past its midpoint", () => {
    expect(computeInsertionIndex(rects, 251)).toBe(3);
    expect(computeInsertionIndex(rects, 10_000)).toBe(3);
  });

  it("returns the after-last slot for an empty strip", () => {
    expect(computeInsertionIndex([], 50)).toBe(0);
  });
});

describe("buildReorderedOrder", () => {
  const ids = ["a", "b", "c", "d"];

  it("moves a tab left-to-right without duplication or loss", () => {
    // a -> after c (insertion slot 3 in the full array)
    expect(buildReorderedOrder(ids, "a", 3)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves a tab right-to-left without duplication or loss", () => {
    // d -> before b (insertion slot 1 in the full array)
    expect(buildReorderedOrder(ids, "d", 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("inserts at the very beginning", () => {
    expect(buildReorderedOrder(ids, "c", 0)).toEqual(["c", "a", "b", "d"]);
  });

  it("inserts after the final tab", () => {
    expect(buildReorderedOrder(ids, "a", 4)).toEqual(["b", "c", "d", "a"]);
  });

  it("leaves the order unchanged when the source returns to its own slot", () => {
    expect(buildReorderedOrder(ids, "b", 1)).toEqual(["a", "b", "c", "d"]);
    // Released just past its own midpoint (slot 2) is also unchanged for b.
    expect(buildReorderedOrder(ids, "b", 2)).toEqual(["a", "b", "c", "d"]);
  });

  it("clamps an out-of-range slot to the array bounds", () => {
    expect(buildReorderedOrder(ids, "a", 999)).toEqual(["b", "c", "d", "a"]);
    expect(buildReorderedOrder(ids, "a", -5)).toEqual(["a", "b", "c", "d"]);
  });

  it("returns the input order when the source id is unknown", () => {
    expect(buildReorderedOrder(ids, "z", 2)).toEqual(["a", "b", "c", "d"]);
  });

  it("preserves all ids exactly once", () => {
    const out = buildReorderedOrder(ids, "c", 1);
    expect(out.sort()).toEqual(ids.slice().sort());
    expect(out).toHaveLength(ids.length);
  });
});

describe("isOutsideStripBounds", () => {
  const strip = { left: 0, right: 300, top: 0, bottom: 36 };

  it("is inside within the strip rectangle", () => {
    expect(isOutsideStripBounds(150, 18, strip)).toBe(false);
  });

  it("is still inside within the horizontal tolerance", () => {
    expect(isOutsideStripBounds(-5, 18, strip)).toBe(false);
    expect(isOutsideStripBounds(305, 18, strip)).toBe(false);
  });

  it("detaches past the horizontal tolerance", () => {
    expect(isOutsideStripBounds(-9, 18, strip)).toBe(true);
    expect(isOutsideStripBounds(309, 18, strip)).toBe(true);
  });

  it("is still inside within the top tolerance", () => {
    expect(isOutsideStripBounds(150, -5, strip)).toBe(false);
  });

  it("detaches above the top tolerance", () => {
    expect(isOutsideStripBounds(150, -9, strip)).toBe(true);
  });

  it("allows the 40 px downward leeway before detaching", () => {
    expect(isOutsideStripBounds(150, 76, strip)).toBe(false); // bottom + 40
    expect(isOutsideStripBounds(150, 77, strip)).toBe(true); // just past
  });

  it("detaches far below the strip", () => {
    expect(isOutsideStripBounds(150, 300, strip)).toBe(true);
  });
});
