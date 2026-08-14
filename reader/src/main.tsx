import React from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import App from "./app/App";
import { useFileDrop } from "./workspace/useFileDrop";
import "./styles.css";

function Root() {
  useFileDrop();
  return (
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
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

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<Root />);
