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
}

/** CSS pixel width/height of the page at the current scale. */
export function pageCssSize(g: PageGeom): { w: number; h: number } {
  // TODO: handle rotation when PdfPage passes rotation through.
  return { w: Math.round(g.w1 * g.scale), h: Math.round(g.h1 * g.scale) };
}

/** Screen (CSS px, top-left origin) → PDF (points, bottom-left origin). */
export function screenToPdf(g: PageGeom, sx: number, sy: number): Point {
  // Inverse of pdfToScreen: y_pdf = h1 - (sy / scale)
  return {
    x: sx / g.scale,
    y: g.h1 - sy / g.scale,
  };
}

/** PDF (points, bottom-left origin) → Screen (CSS px, top-left origin). */
export function pdfToScreen(g: PageGeom, px: number, py: number): Point {
  return {
    x: px * g.scale,
    y: (g.h1 - py) * g.scale,
  };
}

export interface Point {
  x: number;
  y: number;
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
  // Quad order: bottom-left, bottom-right, top-left, top-right (PDF spec).
  return { x1: bl.x, y1: bl.y, x2: br.x, y2: br.y, x3: tl.x, y3: tl.y, x4: tr.x, y4: tr.y };
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
