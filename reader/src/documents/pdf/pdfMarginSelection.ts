interface TextBoundary {
  node: Node;
  offset: number;
}

function textEdge(span: HTMLElement, atStart: boolean): TextBoundary | null {
  const walker = span.ownerDocument.createTreeWalker(span, NodeFilter.SHOW_TEXT);
  let boundary: Text | null = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.length) continue;
    boundary = node as Text;
    if (atStart) break;
  }
  return boundary ? { node: boundary, offset: atStart ? 0 : boundary.length } : null;
}

/** Find the closest text edge on the row under a whitespace press. */
function rowBoundary(layer: HTMLElement, x: number, y: number): TextBoundary | null {
  let nearest: HTMLElement | null = null;
  let nearestDistance = Infinity;
  let onLeft = false;
  for (const span of layer.querySelectorAll<HTMLElement>('span[role="presentation"]')) {
    if (!span.textContent?.trim()) continue;
    const rect = span.getBoundingClientRect();
    if (rect.width === 0 || y < rect.top || y > rect.bottom) continue;
    const distance = Math.max(rect.left - x, x - rect.right, 0);
    if (distance < nearestDistance) {
      nearest = span;
      nearestDistance = distance;
      onLeft = x < rect.left;
    }
  }
  if (!nearest) return null;

  return textEdge(nearest, onLeft !== (nearest.dir === "rtl"));
}

/** Complete a passed line; let native hit testing handle points on text. */
function whitespaceFocus(layer: HTMLElement, focus: Node, x: number, y: number): TextBoundary | null {
  const element = focus.nodeType === Node.ELEMENT_NODE ? focus as Element : focus.parentElement;
  const span = element?.closest<HTMLElement>('span[role="presentation"]');
  if (!span || !layer.contains(span)) return rowBoundary(layer, x, y);
  const rect = span.getBoundingClientRect();
  if (y >= rect.top && y <= rect.bottom) return rowBoundary(layer, x, y);

  const atStart = y < rect.top;
  const spans = Array.from(layer.querySelectorAll<HTMLElement>('span[role="presentation"]'));
  let edge = span;
  // A logical line can contain several font/search spans. Extend only across
  // adjacent items in the same row, stopping at PDF.js's explicit line break.
  for (let index = spans.indexOf(span) + (atStart ? -1 : 1);
    index >= 0 && index < spans.length; index += atStart ? -1 : 1) {
    const candidate = spans[index];
    if ((atStart ? candidate : edge).nextElementSibling?.tagName === "BR") break;
    const next = candidate.getBoundingClientRect();
    if (next.height === 0 || next.bottom <= rect.top || next.top >= rect.bottom) break;
    edge = candidate;
  }
  return textEdge(edge, atStart);
}

/**
 * PDF.js positions text spans absolutely. Chromium can place a whitespace
 * caret at the end of the layer instead of at the adjacent line, even with
 * user-select enabled. Correct that initial caret after the native mousedown
 * and normalize a drag's whitespace endpoint to the passed line's text edge.
 * The browser and PDF.js continue to own text hit testing, copy and geometry.
 */
export function installPdfMarginSelection(container: HTMLElement): () => void {
  const document = container.ownerDocument;
  const window = document.defaultView!;
  let pending: number | undefined;
  let pendingFocus: number | undefined;
  let dragBoundary: TextBoundary | null = null;
  let pressPoint: { x: number; y: number } | null = null;
  let dragPoint: { x: number; y: number } | null = null;
  let dragged = false;
  const cancelPending = () => {
    window.clearTimeout(pending);
    pending = undefined;
    window.clearTimeout(pendingFocus);
    pendingFocus = undefined;
    dragBoundary = null;
    pressPoint = dragPoint = null;
    dragged = false;
  };
  const keepDragSelection = () => {
    const selection = window.getSelection();
    if (!dragBoundary || !container.contains(dragBoundary.node) ||
      !selection?.focusNode || !container.contains(selection.focusNode)) return;
    let focus: TextBoundary = { node: selection.focusNode, offset: selection.focusOffset };
    if (dragged && dragPoint) {
      const hit = document.elementFromPoint(dragPoint.x, dragPoint.y);
      const layer = hit?.closest<HTMLElement>(".textLayer");
      if (layer && container.contains(layer) && !hit?.closest('span[role="presentation"], a, input, textarea, select, button')) {
        focus = whitespaceFocus(layer, selection.focusNode, dragPoint.x, dragPoint.y) ?? focus;
      }
    } else if (selection.isCollapsed) return;
    if (selection.anchorNode === dragBoundary.node && selection.anchorOffset === dragBoundary.offset &&
      selection.focusNode === focus.node && selection.focusOffset === focus.offset) return;
    selection.setBaseAndExtent(dragBoundary.node, dragBoundary.offset,
      focus.node, focus.offset);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!pressPoint || !(event.buttons & 1)) return;
    dragPoint = { x: event.clientX, y: event.clientY };
    dragged ||= Math.hypot(dragPoint.x - pressPoint.x, dragPoint.y - pressPoint.y) >= 3;
    // A move in empty space need not change the native caret or emit
    // selectionchange. Apply after its native default action in that case.
    window.clearTimeout(pendingFocus);
    pendingFocus = window.setTimeout(keepDragSelection, 0);
  };
  const onPointerUp = (event: PointerEvent) => {
    if (dragPoint) dragPoint = { x: event.clientX, y: event.clientY };
    // Apply the last native focus before text-markup mouseup reads the range.
    keepDragSelection();
    cancelPending();
  };
  const onMouseDown = (event: MouseEvent) => {
    cancelPending();
    if (event.button !== 0 || event.detail > 1 || event.defaultPrevented ||
      event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    // Text presses keep their native anchor; links/forms/overlays are excluded.
    const layer = target.closest<HTMLElement>(".textLayer");
    if (!layer || target.closest("a, input, textarea, select, button, [contenteditable=true]")) return;
    const inMargin = target.matches(".textLayer, .textLayer .endOfContent");
    const boundary = inMargin ? rowBoundary(layer, event.clientX, event.clientY) : null;
    if (inMargin && !boundary) return;
    dragBoundary = boundary;
    pressPoint = dragPoint = { x: event.clientX, y: event.clientY };

    pending = window.setTimeout(() => {
      pending = undefined;
      const selection = window.getSelection();
      if (!boundary && selection?.anchorNode && layer.contains(selection.anchorNode)) {
        dragBoundary = { node: selection.anchorNode, offset: selection.anchorOffset };
      } else if (boundary && container.contains(boundary.node) && selection?.isCollapsed) {
        selection.collapse(boundary.node, boundary.offset);
      } else {
        keepDragSelection();
      }
    }, 0);
  };

  container.addEventListener("mousedown", onMouseDown);
  // Chromium may reset a caret placed at a text edge on its first drag update.
  // Keep that one anchor and correct only the focus in PDF whitespace.
  document.addEventListener("selectionchange", keepDragSelection);
  document.addEventListener("pointermove", onPointerMove, true);
  document.addEventListener("pointerup", onPointerUp, true);
  document.addEventListener("pointercancel", cancelPending, true);
  window.addEventListener("blur", cancelPending);
  return () => {
    cancelPending();
    container.removeEventListener("mousedown", onMouseDown);
    document.removeEventListener("selectionchange", keepDragSelection);
    document.removeEventListener("pointermove", onPointerMove, true);
    document.removeEventListener("pointerup", onPointerUp, true);
    document.removeEventListener("pointercancel", cancelPending, true);
    window.removeEventListener("blur", cancelPending);
  };
}
