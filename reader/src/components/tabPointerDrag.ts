/**
 * Pure helpers for pointer-driven tab reorder and detach.
 *
 * The tab strip moved off HTML5 drag-and-drop because Tauri's Windows native
 * drag/drop handler replaces WebView2's and Reader must keep it enabled for
 * external OS file drops (see `workspace/useFileDrop.ts`). Reorder/detach now
 * uses Pointer Events with pointer capture; these helpers contain the
 * deterministic geometry so the logic is unit-testable without a DOM.
 *
 *detach contract (preserved from the prior HTML5 `dragend` handler):
 * a release is "outside" the strip when the pointer left the strip bounds
 * with roughly 8 px of horizontal/vertical slack and a 40 px downward leeway.
 */

/** Minimum pointer travel (CSS px) before a `pointerdown` becomes a drag. */
export const DRAG_THRESHOLD = 4;

/** Horizontal slack (CSS px) around the strip before a release detaches. */
export const DETACH_TOLERANCE_X = 8;
/** Slack above the strip before a release detaches. */
export const DETACH_TOLERANCE_Y_TOP = 8;
/** Extra downward leeway below the strip before a release detaches. */
export const DETACH_TOLERANCE_Y_BOTTOM = 40;

/** A tab's horizontal extent, in strip-local CSS pixels. */
export interface TabRect {
  id: string;
  left: number;
  right: number;
}

/** A bounding rectangle, mirroring a subset of `DOMRect`. */
export interface StripRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Viewport position for the drag preview while preserving its grab point. */
export function dragPreviewPosition(
  pointerX: number,
  pointerY: number,
  grabOffsetX: number,
  grabOffsetY: number,
): { left: number; top: number } {
  return {
    left: pointerX - grabOffsetX,
    top: pointerY - grabOffsetY,
  };
}

/**
 * True when pointer travel exceeds the movement threshold that distinguishes a
 * click from a drag. At exactly the threshold it is still a click, so a tiny
 * jitter on a focus click does not start a reorder.
 */
export function movementExceedsThreshold(
  dx: number,
  dy: number,
  threshold: number = DRAG_THRESHOLD,
): boolean {
  return Math.hypot(dx, dy) > threshold;
}

/**
 * Compute the insertion slot (0..rects.length) for a pointer at `pointerX`
 * given the current tab bounding rectangles, ordered left-to-right.
 *
 * The pointer inserts before a tab when it lies left of that tab's horizontal
 * midpoint; otherwise it falls through to the next tab. A pointer past the
 * last tab's midpoint inserts after the final tab (slot `rects.length`).
 */
export function computeInsertionIndex(rects: TabRect[], pointerX: number): number {
  for (let i = 0; i < rects.length; i++) {
    const mid = (rects[i].left + rects[i].right) / 2;
    if (pointerX < mid) return i;
  }
  return rects.length;
}

/**
 * Build the complete tab-id order that results from moving `sourceId` to the
 * insertion slot `insertionIndex` (relative to the *original* full ordering).
 *
 * `insertionIndex` is the slot returned by {@link computeInsertionIndex} over
 * the full rect list (including the source tab). Removing the source shifts
 * later slots down by one, which this helper accounts for. The result never
 * duplicates or drops a tab id, and when the source returns to its own slot the
 * order is unchanged.
 */
export function buildReorderedOrder(
  ids: string[],
  sourceId: string,
  insertionIndex: number,
): string[] {
  const srcIdx = ids.indexOf(sourceId);
  if (srcIdx < 0) return ids.slice();
  const remaining = ids.filter((_, i) => i !== srcIdx);
  // Translate the full-array slot into a slot within `remaining`.
  let slot = insertionIndex;
  if (srcIdx < insertionIndex) slot = insertionIndex - 1;
  if (slot < 0) slot = 0;
  if (slot > remaining.length) slot = remaining.length;
  const out = remaining.slice();
  out.splice(slot, 0, sourceId);
  return out;
}

/**
 * True when a release at (`pointerX`, `pointerY`) is outside the tab strip and
 * should detach the tab into a new native window, using the same tolerances as
 * the prior HTML5 `dragend` handler.
 */
export function isOutsideStripBounds(
  pointerX: number,
  pointerY: number,
  strip: StripRect,
  tolX: number = DETACH_TOLERANCE_X,
  tolYTop: number = DETACH_TOLERANCE_Y_TOP,
  tolYBottom: number = DETACH_TOLERANCE_Y_BOTTOM,
): boolean {
  return (
    pointerX < strip.left - tolX ||
    pointerX > strip.right + tolX ||
    pointerY < strip.top - tolYTop ||
    pointerY > strip.bottom + tolYBottom
  );
}
