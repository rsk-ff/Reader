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
