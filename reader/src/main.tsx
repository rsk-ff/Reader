import React from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import App from "./app/App";
import { preventBrowserContextMenu } from "./app/browserGuards";
import { useFileDrop } from "./workspace/useFileDrop";
import "pdfjs-dist/web/pdf_viewer.css";
import "./styles.css";

const launchParams = new URLSearchParams(window.location.search);
const isTabDragPreview = launchParams.get("tab-drag-preview") === "1";
if (isTabDragPreview) {
  document.documentElement.classList.add("tab-drag-preview-document");
}

function ReaderRoot() {
  useFileDrop();
  return (
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

function TabDragPreviewRoot() {
  const title = launchParams.get("title") || "Reader tab";
  const dirty = launchParams.get("dirty") === "1";
  return (
    <div className="native-tab-drag-preview" aria-hidden="true">
      <span className="tab-icon">{dirty ? "●" : ""}</span>
      <span className="tab-title">{title}</span>
      <span className="tab-close">{dirty ? "●" : "✕"}</span>
    </div>
  );
}

function Root() {
  return isTabDragPreview ? <TabDragPreviewRoot /> : <ReaderRoot />;
}

// Forward webview runtime errors to the Rust host so they surface in the dev
// log (the webview devtools console is otherwise invisible to `tauri dev`).
function report(level: string, msg: unknown) {
  const text =
    msg instanceof Error
      ? `${msg.name}: ${msg.message}\n${msg.stack ?? ""}`
      : typeof msg === "string"
        ? msg
        : (() => {
            try {
              return JSON.stringify(msg);
            } catch {
              return String(msg);
            }
          })();
  void invoke("log_frontend", { level, message: text }).catch(() => {});
}


window.addEventListener("error", (e) => {
  report("error", e.error ?? e.message);
});
window.addEventListener("unhandledrejection", (e) => {
  report("error", e.reason);
});
document.addEventListener("contextmenu", preventBrowserContextMenu, {
  capture: true,
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<Root />);
