import React from "react";
import { createRoot } from "react-dom/client";
import { NewTabPage } from "../../src/components/NewTabPage";
import { useWorkspace } from "../../src/workspace/store";
import "../../src/styles.css";

const longPath = `C:/Notes/${"long folder ".repeat(14)}/A very long document name for checking truncation.md`;
const known = { path: longPath, file_name: "A very long document name for checking truncation.md", doc_type: "markdown", opened_at: new Date(2026, 9, 7, 12, 35).getTime(), file_size: 12345 };
const legacy = { path: "C:/Notes/old.pdf", file_name: "old.pdf", doc_type: "pdf" };
useWorkspace.setState({ recentFiles: [known, legacy], openDocument: async () => {} });
createRoot(document.getElementById("root")).render(<div className="app-shell"><main className="content-area"><NewTabPage /></main></div>);
