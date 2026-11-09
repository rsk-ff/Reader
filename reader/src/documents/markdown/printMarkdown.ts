import { Crepe } from "@milkdown/crepe";
import { rewriteImageSources } from "./markdownImages";
import { getHTML } from "@milkdown/kit/utils";
import { markdownPdf } from "../../print/printApi";

/* Laid out from the main document: in print media only the print copy shows. */
function printStyles(page: MarkdownPrintPage): string {
  return `
  #reader-print-root { display: none; }
  @media print {
    @page { size: ${page.widthMm}mm ${page.heightMm}mm; margin: ${page.marginMm}mm; }
    html, body, #root { height: auto !important; overflow: visible !important; background: white !important; }
    body > :not(#reader-print-root) { display: none !important; }
    #reader-print-root { display: block !important; color: #222; user-select: text;
      font: 11pt/1.65 "Segoe UI", "Noto Sans SC", sans-serif; }
    #reader-print-root :is(h1, h2, h3, h4, h5, h6) { line-height: 1.3; break-after: avoid; }
    #reader-print-root h1 { font-size: 24pt; } #reader-print-root h2 { font-size: 19pt; }
    #reader-print-root h3 { font-size: 15pt; } #reader-print-root :is(h4, h5, h6) { font-size: 12pt; }
    #reader-print-root :is(p, ul, ol, pre, blockquote, table) { margin: 0 0 1em; }
    #reader-print-root :is(img, svg) { max-width: 100%; } #reader-print-root img { height: auto; }
    #reader-print-root pre { white-space: pre-wrap; overflow-wrap: anywhere; padding: 12px; background: #f5f5f5; }
    #reader-print-root code { font-family: Consolas, monospace; font-size: .9em; }
    #reader-print-root blockquote { margin-left: 0; padding-left: 16px; border-left: 2px solid #ccc; }
    #reader-print-root table { border-collapse: collapse; width: 100%; }
    #reader-print-root :is(th, td) { border: 1px solid #ccc; padding: 6px 10px; }
    #reader-print-root a { color: inherit; text-decoration: underline; }
    #reader-print-root .katex { font-size: 1.1em; }
  }
`;
}

export interface MarkdownPrintPage {
  /** Paper size in the chosen orientation. */
  widthMm: number;
  heightMm: number;
  marginMm: number;
}

/** Render a snapshot, including source edits, without touching the live editor. */
export async function renderMarkdownPrintHtml(markdown: string, documentPath?: string): Promise<string> {
  const source = document.createElement("div");
  source.className = "markdown-print-source";
  source.setAttribute("aria-hidden", "true");
  source.style.cssText = "position:fixed;left:-100000px;top:0;width:800px;visibility:hidden";
  document.body.appendChild(source);
  const renderer = new Crepe({ root: source, defaultValue: markdown, features: {
    [Crepe.Feature.Toolbar]: false,
    [Crepe.Feature.TopBar]: false,
    [Crepe.Feature.BlockEdit]: false,
    [Crepe.Feature.AI]: false,
  }, featureConfigs: {
    // LaTeX depends on CodeMirror even though getHTML emits static code blocks.
    [Crepe.Feature.CodeMirror]: { theme: null as never },
  } });
  try {
    await renderer.create();
    const html = renderer.editor.action(getHTML());
    return documentPath ? rewriteImageSources(html, documentPath) : html;
  } finally {
    try { await renderer.destroy(); } finally { source.remove(); }
  }
}

/** Lay printed copies out one at a time; each owns #reader-print-root. */
let layoutQueue: Promise<unknown> = Promise.resolve();

/**
 * Paginate the rendered HTML on the given paper as a PDF snapshot (through
 * WebView2's print engine) and return the snapshot id.
 */
export function layoutMarkdownPdf(html: string, page: MarkdownPrintPage): Promise<string> {
  const job = layoutQueue.catch(() => undefined).then(async () => {
    document.getElementById("reader-print-root")?.remove();
    const root = document.createElement("div");
    root.id = "reader-print-root";
    root.setAttribute("aria-hidden", "true");
    root.innerHTML = `<style>${printStyles(page)}</style>${html}`;
    document.body.appendChild(root);
    try {
      await document.fonts.ready;
      await Promise.all([...root.querySelectorAll("img")].map((image) => image.decode().catch(() => {})));
      return await markdownPdf(page);
    } finally {
      root.remove();
    }
  });
  layoutQueue = job;
  return job;
}
