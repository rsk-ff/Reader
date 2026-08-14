import type { PDFDocumentProxy } from "pdfjs-dist";
import type { SearchHit } from "./types";

/**
 * Scan the document for occurrences of `query`. Page text is fetched lazily
 * (cached) so repeated next/prev only walks already-loaded pages. The scan is
 * chunked across microtasks so a 1000-page document doesn't block the UI
 * thread (§9, §27).
 */
export interface SearchSession {
  hits: SearchHit[];
  /** page numbers that contain at least one hit, in document order */
  pages: number[];
}

export async function runSearch(
  doc: PDFDocumentProxy,
  query: string,
  onProgress?: (scannedPages: number, totalPages: number) => void,
): Promise<SearchSession> {
  const q = query.trim().toLowerCase();
  const session: SearchSession = { hits: [], pages: [] };
  if (!q) return session;

  const total = doc.numPages;
  for (let i = 1; i <= total; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    content.items.forEach((item, idx) => {
      const str = "str" in item ? (item as { str: string }).str : "";
      if (!str) return;
      const lower = str.toLowerCase();
      let from = 0;
      let at = lower.indexOf(q, from);
      while (at !== -1) {
        session.hits.push({ pageNumber: i, itemIndex: idx, offset: at, length: q.length });
        if (!session.pages.includes(i)) session.pages.push(i);
        from = at + q.length;
        at = lower.indexOf(q, from);
      }
    });
    if (onProgress && i % 10 === 0) onProgress(i, total);
    // Yield to the event loop every page so the UI can paint / cancel.
    await new Promise((r) => setTimeout(r, 0));
  }
  return session;
}
