import { Crepe } from "@milkdown/crepe";
import { getHTML } from "@milkdown/kit/utils";

const printStyles = `
  @page { margin: 18mm; }
  html, body { margin: 0; height: auto; overflow: visible; background: white; color: #222; user-select: text; }
  body { font: 11pt/1.65 "Segoe UI", sans-serif; }
  h1, h2, h3, h4, h5, h6 { line-height: 1.3; break-after: avoid; }
  h1 { font-size: 24pt; } h2 { font-size: 19pt; } h3 { font-size: 15pt; }
  h4, h5, h6 { font-size: 12pt; }
  p, ul, ol, pre, blockquote, table { margin: 0 0 1em; }
  img, svg { max-width: 100%; } img { height: auto; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; padding: 12px; background: #f5f5f5; }
  code { font-family: Consolas, monospace; font-size: .9em; }
  blockquote { margin-left: 0; padding-left: 16px; border-left: 2px solid #ccc; }
  table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #ccc; padding: 6px 10px; }
  a { color: inherit; text-decoration: underline; } .katex { font-size: 1.1em; }
`;

/** Render a snapshot, including source edits, without touching the live editor. */
export async function printMarkdown(markdown: string, title: string): Promise<void> {
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
  } finally {
    try { await renderer.destroy(); } finally { source.remove(); }
  }

  const frame = document.createElement("iframe");
  frame.className = "markdown-print-frame";
  frame.title = "Markdown 打印";
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;left:-100000px";
  document.body.appendChild(frame);
  try {
    const printWindow = frame.contentWindow;
    const printDocument = frame.contentDocument;
    if (!printWindow || !printDocument) throw new Error("无法创建打印页面");
    printDocument.open();
    printDocument.write("<!doctype html><html><head></head><body></body></html>");
    printDocument.close();
    printDocument.title = title;
    // KaTeX and any local document fonts use the already loaded app stylesheet.
    const base = printDocument.createElement("base");
    base.href = document.baseURI;
    printDocument.head.appendChild(base);
    const stylesLoaded: Promise<unknown>[] = [];
    document.querySelectorAll<HTMLLinkElement | HTMLStyleElement>("link[rel='stylesheet'], style")
      .forEach((element) => {
        const copy = element.cloneNode(true) as HTMLLinkElement | HTMLStyleElement;
        if (copy instanceof HTMLLinkElement) stylesLoaded.push(new Promise<void>((resolve) => {
          copy.onload = () => resolve();
          copy.onerror = () => resolve();
        }));
        printDocument.head.appendChild(copy);
      });
    const style = printDocument.createElement("style");
    style.textContent = printStyles;
    printDocument.head.appendChild(style);
    printDocument.body.innerHTML = html;
    await Promise.all(stylesLoaded);
    await printDocument.fonts.ready;
    await Promise.all([...printDocument.images].map((image) => image.decode().catch(() => {})));
    printWindow.addEventListener("afterprint", () => {
      frame.remove();
      if (focused?.isConnected) focused.focus({ preventScroll: true });
    }, { once: true });
    printWindow.focus();
    printWindow.print();
  } catch (error) {
    frame.remove();
    throw error;
  }
}
