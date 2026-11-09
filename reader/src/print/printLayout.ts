/**
 * Where each document page lands on each printed sheet. The preview draws
 * these placements and the print job sends the same ones to the printer, so
 * what the dialog shows is what comes out.
 *
 * Units: page sizes in PDF points (rotation applied), everything on the
 * sheet in millimetres from the paper's top-left corner.
 */

export type Orientation = "auto" | "portrait" | "landscape";
export type ScaleMode = "fit" | "actual";
export type PagesPerSheet = 1 | 2 | 4 | 6 | 9 | 16;
export const PAGES_PER_SHEET: readonly PagesPerSheet[] = [1, 2, 4, 6, 9, 16];

export interface PageSize {
  width: number;
  height: number;
}

/** Paper and printable area in mm, in the sheet's orientation. */
export interface SheetArea {
  paperWidth: number;
  paperHeight: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Placement {
  /** 0-based page index. */
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Extra clockwise quarter turns on top of the page's own rotation. */
  rotate: 0 | 1;
}

const MM_PER_POINT = 25.4 / 72;
/** Space between pages when several share a sheet. */
export const CELL_GAP_MM = 4;

export type RangeResult = { pages: number[] } | { error: string };

/**
 * Parse "1-5, 8, 10-" into sorted, unique 0-based page indexes. Accepts
 * Chinese commas and dashes; an open end runs to the last page.
 */
export function parsePageRange(text: string, total: number): RangeResult {
  const parts = text.replace(/\s*([-–—~～])\s*/g, "$1").split(/[,，、;；\s]+/).filter(Boolean);
  if (parts.length === 0) return { error: "请输入页码，例如 1-5, 8" };
  const pages = new Set<number>();
  for (const part of parts) {
    const match = /^(\d*)\s*[-–—~～]\s*(\d*)$/.exec(part) ?? /^(\d+)$/.exec(part);
    if (!match) return { error: `看不懂“${part}”，例如 1-5, 8` };
    const single = match.length === 2;
    const from = match[1] ? Number(match[1]) : 1;
    const to = single ? from : match[2] ? Number(match[2]) : total;
    if (from < 1 || to < 1 || from > total || to > total) {
      return { error: `页码超出范围，共 ${total} 页` };
    }
    if (from > to) return { error: `“${part}”起始页大于结束页` };
    for (let page = from; page <= to; page += 1) pages.add(page - 1);
  }
  return { pages: [...pages].sort((a, b) => a - b) };
}

/** Columns × rows for N pages per sheet; the longer side gets more pages. */
export function gridFor(pagesPerSheet: PagesPerSheet, landscapeSheet: boolean): { cols: number; rows: number } {
  const [short, long] = ({ 1: [1, 1], 2: [1, 2], 4: [2, 2], 6: [2, 3], 9: [3, 3], 16: [4, 4] } as const)[pagesPerSheet];
  return landscapeSheet ? { cols: long, rows: short } : { cols: short, rows: long };
}

function cellsOf(area: SheetArea, pagesPerSheet: PagesPerSheet) {
  const { cols, rows } = gridFor(pagesPerSheet, area.width > area.height);
  const gap = pagesPerSheet === 1 ? 0 : CELL_GAP_MM;
  const width = (area.width - gap * (cols - 1)) / cols;
  const height = (area.height - gap * (rows - 1)) / rows;
  const cells: { x: number; y: number; width: number; height: number }[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      cells.push({ x: area.left + col * (width + gap), y: area.top + row * (height + gap), width, height });
    }
  }
  return cells;
}

function fitScale(page: PageSize, width: number, height: number, rotate: boolean): number {
  const w = (rotate ? page.height : page.width) * MM_PER_POINT;
  const h = (rotate ? page.width : page.height) * MM_PER_POINT;
  return Math.min(width / w, height / h);
}

/**
 * Sheet orientation. "auto" follows the first printed page: one page per
 * sheet takes the page's own orientation; several per sheet take whichever
 * orientation shows that page larger.
 */
export function resolveLandscape(
  orientation: Orientation,
  pagesPerSheet: PagesPerSheet,
  firstPage: PageSize | undefined,
  paper: { width: number; height: number },
): boolean {
  if (orientation !== "auto") return orientation === "landscape";
  if (!firstPage) return false;
  if (pagesPerSheet === 1) return firstPage.width > firstPage.height;
  const short = Math.min(paper.width, paper.height);
  const long = Math.max(paper.width, paper.height);
  const scaleFor = (landscape: boolean) => {
    const { cols, rows } = gridFor(pagesPerSheet, landscape);
    const width = (landscape ? long : short) / cols;
    const height = (landscape ? short : long) / rows;
    return fitScale(firstPage, width, height, false);
  };
  return scaleFor(true) > scaleFor(false) * 1.001;
}

/**
 * Place the selected pages on sheets. "fit" scales each page into its cell
 * (turning it a quarter if that shows it larger); "actual" keeps 100% and
 * centres the page on the paper, which only applies to one page per sheet.
 */
export function layoutSheets(
  pages: readonly number[],
  sizeOf: (page: number) => PageSize,
  area: SheetArea,
  pagesPerSheet: PagesPerSheet,
  scale: ScaleMode,
): Placement[][] {
  const sheets: Placement[][] = [];
  if (pagesPerSheet === 1 && scale === "actual") {
    for (const page of pages) {
      const size = sizeOf(page);
      const width = size.width * MM_PER_POINT;
      const height = size.height * MM_PER_POINT;
      sheets.push([{
        page,
        x: (area.paperWidth - width) / 2,
        y: (area.paperHeight - height) / 2,
        width,
        height,
        rotate: 0,
      }]);
    }
    return sheets;
  }
  const cells = cellsOf(area, pagesPerSheet);
  for (let index = 0; index < pages.length; index += pagesPerSheet) {
    sheets.push(pages.slice(index, index + pagesPerSheet).map((page, slot) => {
      const cell = cells[slot];
      const size = sizeOf(page);
      const upright = fitScale(size, cell.width, cell.height, false);
      const turned = fitScale(size, cell.width, cell.height, true);
      const rotate = turned > upright * 1.01 ? 1 : 0;
      const factor = (rotate ? turned : upright) * MM_PER_POINT;
      const width = (rotate ? size.height : size.width) * factor;
      const height = (rotate ? size.width : size.height) * factor;
      return {
        page,
        x: cell.x + (cell.width - width) / 2,
        y: cell.y + (cell.height - height) / 2,
        width,
        height,
        rotate,
      };
    }));
  }
  return sheets;
}

/** Sheets of paper the job uses. */
export function paperCount(sheets: number, copies: number, duplex: boolean): number {
  return (duplex ? Math.ceil(sheets / 2) : sheets) * Math.max(1, copies);
}
