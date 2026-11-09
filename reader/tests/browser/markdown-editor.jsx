import React from "react";
import { createRoot } from "react-dom/client";
import { MarkdownEditor } from "../../src/documents/markdown/MarkdownEditor";
import "../../src/styles.css";

const params = new URLSearchParams(location.search);
const level = Number(params.get("level") || 1);
const prefix = params.has("intro") ? "An opening paragraph.\n\n" : "";
const markdown = params.has("blocks") ? "# Block spacing\n\n> Quoted text.\n\n```js\nconst value = 1;\nconst second = 2;\n```\n\n$$\nx^2 + y^2\n$$\n\nFinal paragraph." : `${prefix}${"#".repeat(level)} Selection stability\n\n` +
  Array.from({ length: 40 }, (_, index) =>
    `Paragraph ${index + 1}: Select these words without shifting the page. 中文内容用于编辑验证。`,
  ).join("\n\n");

// Only the native file boundary is mocked: the real React container, Crepe,
// ProseMirror, fixed tool rail, virtual cursor and application CSS all run.
window.__readerInvocations = [];
window.__readerPrints = [];
window.__TAURI_INTERNALS__ = {
  invoke: async (command, args) => {
    window.__readerInvocations.push({ command, args });
    if (command === "read_file_text") return markdown;
    // Native print commands: one printer; Markdown layout records the print
    // copy the page laid out and "returns" a fixture PDF.
    if (command === "print_list_printers") return [{ name: "Fixture printer", isDefault: true }];
    if (command === "print_printer_capabilities") return {
      papers: [{ id: 9, name: "A4", widthMm: 210, heightMm: 297 }], duplex: true, color: true, collate: true,
      maxCopies: 99, defaults: { paperId: 9, landscape: false, duplex: "none", color: true, copies: 1, collate: true },
    };
    if (command === "print_page_area") return {
      paperWidthMm: 210, paperHeightMm: 297, printableLeftMm: 4, printableTopMm: 4, printableWidthMm: 202, printableHeightMm: 289,
    };
    if (command === "print_markdown_pdf") {
      const root = document.getElementById("reader-print-root");
      window.__readerPrints.push({ text: root.textContent, html: root.innerHTML, page: args.page });
      return "print-1-1-1.pdf";
    }
    if (command === "print_read_snapshot") return (await fetch("/tests/fixtures/text-3.pdf")).arrayBuffer();
    return null;
  },
};

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <div className="app-shell">
      <div className="window-titlebar">Markdown regression fixture</div>
      <main className="content-area">
        <div className="tab-stack"><div className="tab-pane tab-pane-active">
          <MarkdownEditor path="fixture.md" fileName="fixture.md" docId="fixture" untitled={false} active />
        </div></div>
      </main>
    </div>
  </React.StrictMode>,
);
