import React from "react";
import { createRoot } from "react-dom/client";
import { PdfViewer } from "../../src/documents/pdf/PdfViewer";
import "pdfjs-dist/web/pdf_viewer.css";
import "../../src/styles.css";

// Only native file/mutation boundaries are mocked. PDF.js, React, the text
// layer, selection handlers, annotation overlays and application CSS are real.
window.createdAnnotations = [];
window.__TAURI_INTERNALS__ = {
  invoke: async (command, args) => {
    if (command === "create_annotation") {
      window.createdAnnotations.push(args.annotation);
      return args.annotation;
    }
    return null;
  },
};

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <div className="app-shell">
      <div className="window-titlebar">PDF selection regression fixture</div>
      <main className="content-area">
        <div className="tab-stack"><div className="tab-pane tab-pane-active">
          <PdfViewer path="text-3.pdf" docId="fixture" active />
        </div></div>
      </main>
    </div>
  </React.StrictMode>,
);
