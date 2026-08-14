import type { PDFDocumentProxy } from "pdfjs-dist";
import type { OutlineNode } from "./types";

/** Resolve a PDF outline destination to a 0-based page index, or null. */
export async function destToPageIndex(
  doc: PDFDocumentProxy,
  dest: string | unknown[] | null,
): Promise<number | null> {
  if (!dest) return null;
  try {
    const explicit = typeof dest === "string" ? await doc.getDestination(dest) : dest;
    if (!explicit || !Array.isArray(explicit) || !explicit[0]) return null;
    // dest[0] is a page ref object.
    return await doc.getPageIndex(explicit[0] as never);
  } catch {
    return null;
  }
}

/** Flatten the outline tree into a list for rendering. */
export function flattenOutline(nodes: OutlineNode[], depth = 0): { node: OutlineNode; depth: number }[] {
  const out: { node: OutlineNode; depth: number }[] = [];
  for (const n of nodes) {
    out.push({ node: n, depth });
    if (n.items?.length) out.push(...flattenOutline(n.items, depth + 1));
  }
  return out;
}
