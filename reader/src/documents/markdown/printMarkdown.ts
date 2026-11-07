import { Crepe } from "@milkdown/crepe";
import { rewriteImageSources } from "./markdownImages";
import { getHTML } from "@milkdown/kit/utils";

/* Printed from the main document: in print media only the print copy shows. */
const printStyles = `
  #reader-print-root { display: none; }
  @media print {
    @page { margin: 18mm; }
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

/** Show the Windows print dialog for this window, or the browser's outside Reader. */
async function showPrintDialog(): Promise<void> {
  const tauri = (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  if (!tauri) {
    window.print();
    return;
  }
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("show_print_dialog");
}

/** Render a snapshot, including source edits, without touching the live editor. */
export async function printMarkdown(markdown: string, title: string, documentPath?: string): Promise<void> {
  const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
  let html: string;
  try {
    await renderer.create();
    html = renderer.editor.action(getHTML());
    if (documentPath) html = rewriteImageSources(html, documentPath);
  } finally {
    try { await renderer.destroy(); } finally { source.remove(); }
  }

  // The previous print copy stays until now: the dialog prints after it closes.
  document.getElementById("reader-print-root")?.remove();
  const root = document.createElement("div");
  root.id = "reader-print-root";
  root.dataset.title = title;
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `<style>${printStyles}</style>${html}`;
  document.body.appendChild(root);
  await document.fonts.ready;
  await Promise.all([...root.querySelectorAll("img")].map((image) => image.decode().catch(() => {})));

  // The print job is named after the page title.
  const previousTitle = document.title;
  document.title = title;
  const restoreTitle = () => { document.title = previousTitle; };
  window.addEventListener("focus", restoreTitle, { once: true });
  window.setTimeout(restoreTitle, 60_000);
  try {
    await showPrintDialog();
  } finally {
    if (focused?.isConnected) focused.focus({ preventScroll: true });
  }
}
