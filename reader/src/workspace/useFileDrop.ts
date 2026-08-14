import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";
import { useWorkspace } from "./store";

/** Open files dropped onto the window (OS-level drop gives real paths). */
export function useFileDrop() {
  const openDocument = useWorkspace((s) => s.openDocument);
  useEffect(() => {
    const win = getCurrentWindow();
    const unlistenP = win.onDragDropEvent((event) => {
      if (event.payload.type === "drop") {
        for (const path of event.payload.paths) {
          void openDocument(path);
        }
      }
    });
    return () => {
      void unlistenP.then((un) => un());
    };
  }, [openDocument]);
}
