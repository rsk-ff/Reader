interface TextBoundary {
  node: Text;
  offset: number;
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

  const atStart = onLeft !== (nearest.dir === "rtl");
  const walker = layer.ownerDocument.createTreeWalker(nearest, NodeFilter.SHOW_TEXT);
  let boundary: Text | null = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.length) continue;
    boundary = node as Text;
    if (atStart) break;
  }
  return boundary ? { node: boundary, offset: atStart ? 0 : boundary.length } : null;
}

/**
 * PDF.js positions text spans absolutely. Chromium can place a whitespace
 * caret at the end of the layer instead of at the adjacent line, even with
 * user-select enabled. Correct that initial caret after the native mousedown;
 * the browser and PDF.js continue to own dragging, copy and markup geometry.
 */
export function installPdfMarginSelection(container: HTMLElement): () => void {
  const document = container.ownerDocument;
  const window = document.defaultView!;
  let pending: number | undefined;
  let dragBoundary: TextBoundary | null = null;
  const cancelPending = () => {
    window.clearTimeout(pending);
    pending = undefined;
    dragBoundary = null;
  };
  const keepAnchor = () => {
    const selection = window.getSelection();
    if (!dragBoundary || !container.contains(dragBoundary.node) ||
      !selection?.focusNode || selection.isCollapsed || !container.contains(selection.focusNode)) return;
    if (selection.anchorNode === dragBoundary.node && selection.anchorOffset === dragBoundary.offset) return;
    selection.setBaseAndExtent(dragBoundary.node, dragBoundary.offset,
      selection.focusNode, selection.focusOffset);
  };
  const onPointerUp = () => {
    // Apply the last native focus before text-markup mouseup reads the range.
    keepAnchor();
    cancelPending();
  };
  const onMouseDown = (event: MouseEvent) => {
    cancelPending();
    if (event.button !== 0 || event.detail > 1 || event.defaultPrevented ||
      event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    // Do not interfere with text presses, links, forms or drawing overlays.
    if (!target.matches(".textLayer, .textLayer .endOfContent")) return;
    const layer = target.closest<HTMLElement>(".textLayer")!;
    const boundary = rowBoundary(layer, event.clientX, event.clientY);
    if (!boundary) return;
    dragBoundary = boundary;

    pending = window.setTimeout(() => {
      pending = undefined;
      const selection = window.getSelection();
      if (container.contains(boundary.node) && selection?.isCollapsed) {
        selection.collapse(boundary.node, boundary.offset);
      } else {
        keepAnchor();
      }
    }, 0);
  };

  container.addEventListener("mousedown", onMouseDown);
  // Chromium may reset a caret placed at a text edge on its first drag update.
  // Keep that one anchor; native selection still determines the moving focus.
  document.addEventListener("selectionchange", keepAnchor);
  document.addEventListener("pointerup", onPointerUp, true);
  document.addEventListener("pointercancel", cancelPending, true);
  window.addEventListener("blur", cancelPending);
  return () => {
    cancelPending();
    container.removeEventListener("mousedown", onMouseDown);
    document.removeEventListener("selectionchange", keepAnchor);
    document.removeEventListener("pointerup", onPointerUp, true);
    document.removeEventListener("pointercancel", cancelPending, true);
    window.removeEventListener("blur", cancelPending);
  };
}
