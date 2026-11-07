/**
 * Coordinate conversion between screen (CSS pixels, origin top-left, y down)
 * and PDF user space (points, origin bottom-left, y up) — spec §5.
 *
 * The conversion needs the page's unscaled height (h1) and the current scale.
 * PDF.js `PageViewport` flips the y axis; these helpers mirror that transform
 * deterministically so annotation tools don't each roll their own math.
 */

export interface PageGeom {
  /** unscaled width (scale=1) */
  w1: number;
  /** unscaled height (scale=1) */
  h1: number;
  scale: number;
  /** rotation in degrees (0/90/180/270) */
  rotation?: number;
  /** PDF user-space to rendered-page affine transform at scale 1. */
  transform?: PdfPageTransform;
}

export type PdfPageTransform = [number, number, number, number, number, number];

/** CSS pixel width/height of the page at the current scale. */
export function pageCssSize(g: PageGeom): { w: number; h: number } {
  return { w: Math.round(g.w1 * g.scale), h: Math.round(g.h1 * g.scale) };
}

function pageTransform(g: PageGeom): PdfPageTransform {
  return g.transform ?? [1, 0, 0, -1, 0, g.h1];
}

/** Screen (CSS px, top-left origin) → PDF (points, bottom-left origin). */
export function screenToPdf(g: PageGeom, sx: number, sy: number): Point {
  const [a, b, c, d, e, f] = pageTransform(g);
  const determinant = a * d - b * c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-8) {
    throw new RangeError("invalid PDF page transform");
  }
  const x = sx / g.scale - e;
  const y = sy / g.scale - f;
  return {
    x: (d * x - c * y) / determinant,
    y: (-b * x + a * y) / determinant,
  };
}

/** PDF (points, bottom-left origin) → Screen (CSS px, top-left origin). */
export function pdfToScreen(g: PageGeom, px: number, py: number): Point {
  const [a, b, c, d, e, f] = pageTransform(g);
  return {
    x: (a * px + c * py + e) * g.scale,
    y: (b * px + d * py + f) * g.scale,
  };
}

export interface PdfRectLike {
  left: number;
  bottom: number;
  right: number;
  top: number;
}

/** Axis-aligned screen bounds for a PDF-space rectangle, including rotation. */
export function pdfRectToScreen(g: PageGeom, rect: PdfRectLike): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const corners = [
    pdfToScreen(g, rect.left, rect.bottom),
    pdfToScreen(g, rect.left, rect.top),
    pdfToScreen(g, rect.right, rect.bottom),
    pdfToScreen(g, rect.right, rect.top),
  ];
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
  };
}

export interface Point {
  x: number;
  y: number;
}

export interface ScreenRectEdges {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Intersect a selection rectangle with one rendered page. */
export function clipScreenRect(
  rect: ScreenRectEdges,
  bounds: ScreenRectEdges,
): ScreenRectEdges | null {
  const clipped = {
    left: Math.max(rect.left, bounds.left),
    top: Math.max(rect.top, bounds.top),
    right: Math.min(rect.right, bounds.right),
    bottom: Math.min(rect.bottom, bounds.bottom),
  };
  return clipped.right > clipped.left && clipped.bottom > clipped.top ? clipped : null;
}

/**
 * Turn the rectangles of a text selection into one rectangle per line run.
 *
 * PDF.js splits a line into several spans, and a range also reports boxes for
 * fully selected elements, so raw client rects overlap. Drawn as translucent
 * highlights they stack into darker patches, and as underlines they double.
 * Rects whose vertical centres fall in the same band join one line; a wide
 * horizontal gap (another column) starts a new run. Neighbouring lines that
 * still overlap are split at the midpoint so their fills never stack.
 */
export function mergeSelectionRects(rects: readonly ScreenRectEdges[]): ScreenRectEdges[] {
  const boxes = rects
    .filter((rect) => rect.right - rect.left > 0.5 && rect.bottom - rect.top > 0.5)
    .map((rect) => ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }))
    .sort((a, b) => (a.top + a.bottom) / 2 - (b.top + b.bottom) / 2 || a.left - b.left);

  const lines: ScreenRectEdges[][] = [];
  for (const box of boxes) {
    const centre = (box.top + box.bottom) / 2;
    const line = lines[lines.length - 1];
    const band = line && line.reduce((acc, item) => ({
      top: Math.min(acc.top, item.top), bottom: Math.max(acc.bottom, item.bottom),
    }), { top: Infinity, bottom: -Infinity });
    const lineCentre = band ? (band.top + band.bottom) / 2 : 0;
    const height = Math.min(box.bottom - box.top, band ? band.bottom - band.top : Infinity);
    if (line && Math.abs(centre - lineCentre) <= height / 2) line.push(box);
    else lines.push([box]);
  }

  // One band per line from the most common glyph height and centre, so a
  // tall element box cannot stretch the line.
  const bands = lines.map((line) => {
    const heights = line.map((box) => box.bottom - box.top).sort((a, b) => a - b);
    const centres = line.map((box) => (box.top + box.bottom) / 2).sort((a, b) => a - b);
    const height = heights[Math.floor(heights.length / 2)];
    const centre = centres[Math.floor(centres.length / 2)];
    return { top: centre - height / 2, bottom: centre + height / 2, height };
  });
  // Neighbouring lines that still overlap are split at the midpoint.
  for (let i = 1; i < bands.length; i++) {
    const above = bands[i - 1];
    const below = bands[i];
    if (below.top < above.bottom) {
      const middle = (above.bottom + below.top) / 2;
      above.bottom = middle;
      below.top = middle;
    }
  }

  const runs: ScreenRectEdges[] = [];
  lines.forEach((line, index) => {
    const band = bands[index];
    let run: ScreenRectEdges | null = null;
    for (const box of [...line].sort((a, b) => a.left - b.left)) {
      if (run && box.left <= run.right + band.height * 2) {
        run.right = Math.max(run.right, box.right);
      } else {
        if (run) runs.push(run);
        run = { left: box.left, right: box.right, top: band.top, bottom: band.bottom };
      }
    }
    if (run) runs.push(run);
  });
  return runs;
}

/** Client rects of the text a range covers, without boxes of whole elements. */
export function rangeTextRects(range: Range): ScreenRectEdges[] {
  const root = range.commonAncestorContainer;
  const rects: ScreenRectEdges[] = [];
  const addNode = (node: Text) => {
    if (!node.textContent || !range.intersectsNode(node)) return;
    const part = document.createRange();
    part.selectNodeContents(node);
    if (node === range.startContainer) part.setStart(node, range.startOffset);
    if (node === range.endContainer) part.setEnd(node, range.endOffset);
    for (const rect of Array.from(part.getClientRects())) rects.push(rect);
  };
  if (root.nodeType === Node.TEXT_NODE) {
    addNode(root as Text);
    return rects;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) addNode(node as Text);
  return rects;
}

/** Convert a DOM Range rect (relative to page) to a PDF Quad. */
export function rectToQuad(
  g: PageGeom,
  left: number,
  top: number,
  right: number,
  bottom: number,
): Quad {
  const tl = screenToPdf(g, left, top);
  const tr = screenToPdf(g, right, top);
  const bl = screenToPdf(g, left, bottom);
  const br = screenToPdf(g, right, bottom);
  // QuadPoints order used by Acrobat, PDF.js and PDFium when they draw
  // markup: top-left, top-right, bottom-left, bottom-right. Underline sits on
  // the (x3,y3)-(x4,y4) edge, so the old bottom-first order put it above text.
  return { x1: tl.x, y1: tl.y, x2: tr.x, y2: tr.y, x3: bl.x, y3: bl.y, x4: br.x, y4: br.y };
}

export interface Quad {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x3: number;
  y3: number;
  x4: number;
  y4: number;
}

/** Bounding rect from a list of quads (in PDF coords). */
export function quadsBounds(quads: Quad[]): { left: number; right: number; bottom: number; top: number } | null {
  if (quads.length === 0) return null;
  let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
  for (const q of quads) {
    left = Math.min(left, q.x1, q.x3);
    right = Math.max(right, q.x2, q.x4);
    bottom = Math.min(bottom, q.y1, q.y2);
    top = Math.max(top, q.y3, q.y4);
  }
  return { left, right, bottom, top };
}
