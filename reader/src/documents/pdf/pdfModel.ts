/** Convert the one-based page number used by the UI to PDFium's zero-based index. */
export function toPdfPageIndex(pageNumber: number): number {
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    throw new RangeError(`invalid PDF page number: ${pageNumber}`);
  }
  return pageNumber - 1;
}

/** Build the workspace-scoped Range URL consumed by PDF.js. */
export function pdfFileUrl(path: string, revision: number): string {
  if (!path) throw new RangeError("missing PDF path");
  if (!Number.isFinite(revision) || revision < 0) {
    throw new RangeError(`invalid PDF revision: ${revision}`);
  }
  return `http://reader-file.localhost/${encodeURIComponent(path)}?rev=${revision}`;
}

/** Tauri/serde expects the lowercase PageSize wire value (`same`). */
export function blankPageInsertArgs(
  currentPage: number,
  position: "before" | "after",
): { index: number; size: "same"; referencePageIndex: number } {
  const referencePageIndex = toPdfPageIndex(currentPage);
  return {
    index: position === "before" ? referencePageIndex : referencePageIndex + 1,
    size: "same",
    referencePageIndex,
  };
}
