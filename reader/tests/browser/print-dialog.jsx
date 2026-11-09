import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { PrintPanel } from "../../src/print/PrintPanel";
import "../../src/styles.css";

// Only the native print commands are mocked: the dialog, PDF.js preview and
// layout are real. `?kind=markdown` opens a Markdown source; the mock "lays
// it out" as the fixture PDF.
const params = new URLSearchParams(location.search);
const kind = params.get("kind") ?? "pdf";
const fixture = params.get("pdf") ?? "text-3.pdf";

window.__readerInvocations = [];
window.__readerPrints = [];
window.__TAURI_INTERNALS__ = {
  invoke: async (command, args) => {
    window.__readerInvocations.push({ command, args });
    switch (command) {
      case "print_list_printers":
        return [
          { name: "Microsoft Print to PDF", isDefault: false },
          { name: "HP LaserJet M227", isDefault: true },
        ];
      case "print_printer_capabilities":
        return {
          papers: [
            { id: 9, name: "A4", widthMm: 210, heightMm: 297 },
            { id: 1, name: "Letter", widthMm: 215.9, heightMm: 279.4 },
            { id: 11, name: "A5", widthMm: 148, heightMm: 210 },
          ],
          duplex: args.printer !== "Microsoft Print to PDF",
          color: true,
          collate: true,
          maxCopies: 999,
          defaults: { paperId: 9, landscape: false, duplex: "none", color: true, copies: 1, collate: true },
        };
      case "print_page_area": {
        const sizes = { 9: [210, 297], 1: [215.9, 279.4], 11: [148, 210] }[args.paperId];
        const [w, h] = args.landscape ? [sizes[1], sizes[0]] : sizes;
        return { paperWidthMm: w, paperHeightMm: h, printableLeftMm: 4, printableTopMm: 4, printableWidthMm: w - 8, printableHeightMm: h - 8 };
      }
      case "print_snapshot_pdf":
        return "print-1-1-1.pdf";
      case "print_markdown_pdf": {
        const root = document.getElementById("reader-print-root");
        window.__readerPrints.push({ html: root.innerHTML, page: args.page });
        return "print-1-1-1.pdf";
      }
      case "print_read_snapshot":
        return (await fetch(`/tests/fixtures/${fixture}`)).arrayBuffer();
      case "print_printer_properties":
        return null;
      default:
        return null;
    }
  },
};

function App() {
  const [open, setOpen] = useState(true);
  const source = kind === "markdown"
    ? { kind: "markdown", title: "notes.md", markdown: "# 标题\n\n**粗体**\n\n```js\nconst n = 2;\n```\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n$x^2$\n" }
    : { kind: "pdf", title: fixture, path: fixture, currentPage: 2 };
  const [stable] = useState(source);
  return <div className="app-shell print-window">
    {open ? <PrintPanel source={stable} onClose={() => { window.__printClosed = true; setOpen(false); }} />
      : <button onClick={() => setOpen(true)}>reopen</button>}
  </div>;
}

createRoot(document.getElementById("root")).render(<App />);
