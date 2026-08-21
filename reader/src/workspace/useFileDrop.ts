import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";
import { useWorkspace } from "./store";
import {
  formatOpenFailures,
  openDroppedFiles,
  type OpenFailure,
} from "./openDroppedFiles";

/** Open files dropped onto the window (OS-level drop gives real paths). */
export function useFileDrop() {
  const openDocument = useWorkspace((s) => s.openDocument);
  useEffect(() => {
    const win = getCurrentWindow();
    const unlistenP = win.onDragDropEvent((event) => {
      if (event.payload.type !== "drop") return;
      void openDroppedFiles(event.payload.paths, openDocument).then(
        reportFailures,
      );
    });
    return () => {
      void unlistenP.then((un) => un());
    };
  }, [openDocument]);
}

/**
 * Surface a failed drop batch as a single alert. Successful paths remain open
 * because the helper already attempted them all before reaching here.
 */
function reportFailures(failures: OpenFailure[]): void {
  if (failures.length === 0) return;
  window.alert(formatOpenFailures(failures));
}
