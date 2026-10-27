/** Convert the one-based page number used by the UI to PDFium's zero-based index. */
export function toPdfPageIndex(pageNumber: number): number {
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    throw new RangeError(`invalid PDF page number: ${pageNumber}`);
  }
  return pageNumber - 1;
}

/** Build the workspace-scoped Range URL consumed by PDF.js. */
export function pdfFileUrl(path: string, loadToken: string): string {
  if (!path) throw new RangeError("missing PDF path");
  if (!/^[A-Za-z0-9-]+$/.test(loadToken)) {
    throw new RangeError(`invalid PDF load token: ${loadToken}`);
  }
  return `http://reader-file.localhost/${encodeURIComponent(path)}?rev=${loadToken}`;
}

/**
 * A token unique to one PDF.js load. Rust pins the file bytes on the token's
 * first request, so later PDFium writes cannot change an in-flight load.
 */
export function pdfLoadToken(viewerSession: string, reloadVersion: number): string {
  if (!Number.isInteger(reloadVersion) || reloadVersion < 0) {
    throw new RangeError(`invalid PDF reload version: ${reloadVersion}`);
  }
  return `${viewerSession}-${reloadVersion}`;
}

/** Random per-viewer prefix so a remounted viewer never reuses an old pin. */
export function newPdfViewerSession(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
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
