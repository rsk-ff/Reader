import React from "react";
import { createRoot } from "react-dom/client";
import { NewTabPage } from "../../src/components/NewTabPage";
import { WindowTitleBar } from "../../src/components/WindowTitleBar";
import { useWorkspace } from "../../src/workspace/store";
import "../../src/styles.css";

const longPath = `C:/Notes/${"long folder ".repeat(14)}/A very long document name for checking truncation.md`;
const known = { path: longPath, file_name: "A very long document name for checking truncation.md", doc_type: "markdown", opened_at: new Date(2026, 9, 7, 12, 35).getTime(), file_size: 12345 };
const legacy = { path: "C:/Notes/old.pdf", file_name: "old.pdf", doc_type: "pdf" };
const recentFiles = new URLSearchParams(location.search).has("many")
  ? [known, ...Array.from({ length: 39 }, (_, index) => ({ ...legacy, path: `C:/Notes/old-${index}.pdf`, file_name: `old-${index}.pdf` }))]
  : [known, legacy];
window.__readerReopened = null;
window.__TAURI_INTERNALS__ = {
  metadata: { currentWindow: { label: "main" } },
  transformCallback: () => 1,
  invoke: async () => 0,
};
const documents = [known, legacy].map((file, index) => ({ ...file, id: `document-${index}`, dirty: false }));
const tabs = documents.map((document, index) => ({ id: `tab-${index}`, window_id: "main",
  document_id: document.id, title: document.file_name, position: index, active: false }));
tabs.push({ id: "home", window_id: "main", document_id: null, title: "新标签页", position: 2, active: true });
useWorkspace.setState({ recentFiles, tabs, active_tab_id: "home", myWindowId: "main",
  documentsById: Object.fromEntries(documents.map((document) => [document.id, document])),
  openDocument: async (path) => { window.__readerReopened = path; } });
createRoot(document.getElementById("root")).render(<div className="app-shell"><WindowTitleBar /><main className="content-area"><NewTabPage /></main></div>);
