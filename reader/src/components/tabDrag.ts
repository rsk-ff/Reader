/**
 * Pure drag-data-transfer helpers for tab reorder (§17, §18).
 *
 * Extracted from the `TabStrip` component so the data-transfer contract — in
 * particular the `dropEffect` that WebView2 uses to render the drag cursor —
 * can be unit-tested without mounting React components or a real DnD session.
 *
 * Why a helper at all: `TabStrip` sets `effectAllowed = "move"` on drag start
 * and calls `preventDefault()` on drag over, but never assigns
 * `dataTransfer.dropEffect`. WebView2 therefore reports a prohibited drop
 * operation, so the cursor shows the "no entry" glyph and the drop never fires.
 * Setting `dropEffect = "move"` after `preventDefault()` advertises an allowed
 * move, which is what these helpers enforce.
 */

/** Minimal view of the DnD dataTransfer the helpers touch. */
export interface DragDataTransfer {
  effectAllowed: string;
  dropEffect: string;
  setData: (format: string, data: string) => void;
}

/**
 * Configure a drag start for an intra-window tab move: advertise a `move`
 * operation and stash the source tab id for the drop target.
 */
export function startMoveDrag(dataTransfer: DragDataTransfer, tabId: string): void {
  dataTransfer.effectAllowed = "move";
  // Also pin dropEffect up front so the very first drag-over frame already
  // shows a move cursor before any dragover handler runs.
  dataTransfer.dropEffect = "move";
  dataTransfer.setData("text/plain", tabId);
}

/**
 * Configure a drag over for an intra-window tab move: explicitly advertise an
 * allowed `move` drop. Call after `event.preventDefault()`.
 */
export function allowMoveDrop(dataTransfer: DragDataTransfer): void {
  dataTransfer.dropEffect = "move";
}
