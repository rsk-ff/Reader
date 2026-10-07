import React from "react";
import { createRoot } from "react-dom/client";
import { MarkdownEditor } from "../../src/documents/markdown/MarkdownEditor";
import "../../src/styles.css";

const params = new URLSearchParams(location.search);
const level = Number(params.get("level") || 1);
const prefix = params.has("intro") ? "An opening paragraph.\n\n" : "";
const markdown = `${prefix}${"#".repeat(level)} Selection stability\n\n` +
  Array.from({ length: 40 }, (_, index) =>
    `Paragraph ${index + 1}: Select these words without shifting the page. 中文内容用于编辑验证。`,
  ).join("\n\n");

// Only the native file boundary is mocked: the real React container, Crepe,
// ProseMirror, fixed tool rail, virtual cursor and application CSS all run.
window.__readerInvocations = [];
window.__TAURI_INTERNALS__ = {
  invoke: async (command, args) => {
    window.__readerInvocations.push({ command, args });
    return command === "read_file_text" ? markdown : null;
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
