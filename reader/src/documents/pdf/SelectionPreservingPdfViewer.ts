import { PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";

interface TextPosition {
  span: HTMLElement;
  offset: number;
}

interface ZoomSelection {
  anchor: TextPosition;
  focus: TextPosition;
}

function textPosition(node: Node, offset: number): TextPosition | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  const span = element?.closest<HTMLElement>('span[role="presentation"]');
  if (!span?.closest(".textLayer")) return null;
  const range = span.ownerDocument.createRange();
  range.selectNodeContents(span);
  range.setEnd(node, offset);
  return { span, offset: range.toString().length };
}

function textBoundary(position: TextPosition): { node: Node; offset: number } | null {
  const walker = position.span.ownerDocument.createTreeWalker(position.span, NodeFilter.SHOW_TEXT);
  let offset = position.offset;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent!.length;
    if (offset <= length) return { node, offset };
    offset -= length;
  }
  return null;
}

/** Keep PDF.js's ordinary selection clearing, except within a zoom update. */
export class SelectionPreservingPdfViewer extends PDFViewer {
  private zoomDepth = 0;
  private zoomSelection: ZoomSelection | null = null;

  constructor(options: ConstructorParameters<typeof PDFViewer>[0]) {
    super(options);
    this.eventBus.on("textlayerrendered", this.onTextLayerRendered);
    this.container.ownerDocument.addEventListener("pointerdown", this.cancelRestoration, true);
    this.container.ownerDocument.addEventListener("keydown", this.onKeyDown, true);
    this.container.ownerDocument.defaultView?.addEventListener("blur", this.cancelRestoration);
  }

  private cancelRestoration = (): void => {
    this.zoomSelection = null;
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    const zoomKey = (event.ctrlKey || event.metaKey) &&
      ["Control", "Meta", "+", "=", "-", "0"].includes(event.key);
    if (!zoomKey) this.cancelRestoration();
  };

  private captureSelection(): ZoomSelection | null {
    const viewer = this.viewer;
    const selection = this.container.ownerDocument.getSelection();
    if (!viewer || !selection || selection.isCollapsed || !selection.anchorNode || !selection.focusNode ||
      !viewer.contains(selection.anchorNode) || !viewer.contains(selection.focusNode)) return null;
    const anchor = textPosition(selection.anchorNode, selection.anchorOffset);
    const focus = textPosition(selection.focusNode, selection.focusOffset);
    return anchor && focus ? { anchor, focus } : null;
  }

  private restoreSelection(): void {
    const snapshot = this.zoomSelection;
    if (!snapshot) return;
    const viewer = this.viewer;
    if (!viewer || !viewer.contains(snapshot.anchor.span) || !viewer.contains(snapshot.focus.span)) {
      this.cancelRestoration();
      return;
    }
    const anchor = textBoundary(snapshot.anchor);
    const focus = textBoundary(snapshot.focus);
    if (!anchor || !focus) {
      this.cancelRestoration();
      return;
    }
    const selection = this.container.ownerDocument.getSelection();
    if (selection?.anchorNode === anchor.node && selection.anchorOffset === anchor.offset &&
      selection.focusNode === focus.node && selection.focusOffset === focus.offset) return;
    selection?.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
  }

  private onTextLayerRendered = (): void => {
    this.restoreSelection();
    const snapshot = this.zoomSelection;
    if (snapshot && !snapshot.anchor.span.closest<HTMLElement>(".textLayer")?.hidden &&
      !snapshot.focus.span.closest<HTMLElement>(".textLayer")?.hidden) this.cancelRestoration();
  };

  disposeSelectionPreservation(): void {
    this.cancelRestoration();
    this.eventBus.off("textlayerrendered", this.onTextLayerRendered);
    this.container.ownerDocument.removeEventListener("pointerdown", this.cancelRestoration, true);
    this.container.ownerDocument.removeEventListener("keydown", this.onKeyDown, true);
    this.container.ownerDocument.defaultView?.removeEventListener("blur", this.cancelRestoration);
  }

  private duringZoom(update: () => void): void {
    // PDF.js keeps text spans on zoom, but search highlighting replaces their
    // child text nodes. Record offsets in those spans rather than a DOM Range.
    if (this.zoomDepth === 0) this.zoomSelection = this.captureSelection() ?? this.zoomSelection;
    this.zoomDepth += 1;
    try {
      update();
    } finally {
      this.zoomDepth -= 1;
      if (this.zoomDepth === 0) this.restoreSelection();
    }
  }

  override clearSelection(): void {
    if (!this.zoomDepth) {
      this.cancelRestoration();
      super.clearSelection();
    }
  }

  override updateScale(options: Parameters<PDFViewer["updateScale"]>[0]): void {
    this.duringZoom(() => super.updateScale(options));
  }

  override get currentScaleValue(): string {
    return super.currentScaleValue;
  }

  override set currentScaleValue(value: string) {
    this.duringZoom(() => { super.currentScaleValue = value; });
  }

  override get currentScale(): number {
    return super.currentScale;
  }

  override set currentScale(value: number) {
    this.duringZoom(() => { super.currentScale = value; });
  }
}
