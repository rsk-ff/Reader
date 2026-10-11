import React from "react";
import { createRoot } from "react-dom/client";
import { NewTabPage } from "../../src/components/NewTabPage";
import { WindowTitleBar } from "../../src/components/WindowTitleBar";
import { useWorkspace } from "../../src/workspace/store";
import { useFolderLocations, parentFolder, parseFolderLocations } from "../../src/workspace/folderLocations";
import "../../src/styles.css";

const longPath = `C:/Notes/${"long folder ".repeat(14)}/A very long document name for checking truncation.md`;
const known = { path: longPath, file_name: "A very long document name for checking truncation.md", doc_type: "markdown", opened_at: new Date(2026, 9, 7, 12, 35).getTime(), file_size: 12345 };
const legacy = { path: "C:/Notes/old.pdf", file_name: "old.pdf", doc_type: "pdf" };
const recentFiles = new URLSearchParams(location.search).has("many")
  ? [known, ...Array.from({ length: 39 }, (_, index) => ({ ...legacy, path: `C:/Notes/old-${index}.pdf`, file_name: `old-${index}.pdf` }))]
  : [known, legacy];
window.__readerReopened = null;
window.__readerCreated = [];
if (new URLSearchParams(location.search).has("frequent")) {
  useFolderLocations.setState({ ...parseFolderLocations(null), seeded: true,
    visits: [{ path: "D:/Work", name: "Work", count: 3, rank: 3, last_opened: Date.now() }] });
}
window.__TAURI_INTERNALS__ = {
  metadata: { currentWindow: { label: "main" } },
  transformCallback: () => 1,
  invoke: async (command, args) => {
    if (command === "create_local_markdown") {
      if (args.fileName === "review.md") throw new Error("同名文件已存在，请换一个名称");
      const name = /\.(md|markdown)$/i.test(args.fileName) ? args.fileName : `${args.fileName}.md`;
      const path = `${args.directory}/${name}`;
      window.__readerCreated.push({ directory: args.directory, fileName: name, path });
      return path;
    }
    if (command === "get_local_locations") return {
      roots: [{ name: "本地磁盘 (C:)", path: "C:/" }, { name: "本地磁盘 (D:)", path: "D:/" }],
      shortcuts: [{ name: "桌面", path: "C:/Desktop" }, { name: "下载", path: "C:/Downloads" }, { name: "文档", path: "C:/Documents" }],
    };
    if (command === "list_local_directory") {
      if (args.path.includes("missing")) throw new Error("无法访问文件夹：路径不存在");
      if (args.path === "C:/Slow") await new Promise((resolve) => setTimeout(resolve, 800));
      return { path: args.path, parent: args.path === "C:/" || args.path === "D:/" ? null : "C:/", skipped: 0,
        entries: args.path === "C:/" ? [
          { name: "Notes", path: "C:/Notes", is_dir: true, file_size: null, modified_at: 1 },
          { name: "Slow", path: "C:/Slow", is_dir: true, file_size: null, modified_at: 1 },
        ] : [
          { name: "nested", path: `${args.path}/nested`, is_dir: true, file_size: null, modified_at: 1 },
          { name: "review.md", path: `${args.path}/review.md`, is_dir: false, file_size: 12345, modified_at: 1 },
          { name: "sample.pdf", path: `${args.path}/sample.pdf`, is_dir: false, file_size: 2048, modified_at: 1 },
        ],
      };
    }
    return 0;
  },
};
const documents = [known, legacy].map((file, index) => ({ ...file, id: `document-${index}`, dirty: false }));
const tabs = documents.map((document, index) => ({ id: `tab-${index}`, window_id: "main",
  document_id: document.id, title: document.file_name, position: index, active: false }));
tabs.push({ id: "home", window_id: "main", document_id: null, title: "新标签页", position: 2, active: true });
useWorkspace.setState({ recentFiles, tabs, active_tab_id: "home", myWindowId: "main",
  documentsById: Object.fromEntries(documents.map((document) => [document.id, document])),
  openDocument: async (path) => {
    window.__readerReopened = path;
    const folder = parentFolder(path);
    if (folder) useFolderLocations.getState().recordVisit(folder);
  } });
function Harness() {
  const [active, setActive] = React.useState(true);
  window.__readerSetActive = setActive;
  return <div className="app-shell"><WindowTitleBar /><main className="content-area" aria-hidden={!active}><NewTabPage active={active} /></main></div>;
}
createRoot(document.getElementById("root")).render(<Harness />);
