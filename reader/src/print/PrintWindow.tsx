import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { WindowTitleBar } from "../components/WindowTitleBar";
import { useWindowDragRegion } from "../components/windowDrag";
import { PrintPanel, type PrintSource } from "./PrintPanel";

/** Root of a print window: the app title bar, then the print panel. */
export function PrintWindow() {
  const [source, setSource] = useState<PrintSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const win = useMemo(() => getCurrentWindow(), []);
  const drag = useWindowDragRegion();
  const close = useCallback(() => { void win.close().catch(() => undefined); }, [win]);

  useEffect(() => {
    invoke<PrintSource>("print_window_source")
      .then((next) => {
        setSource(next);
        document.title = `打印 - ${next.title}`;
      })
      .catch((reason: unknown) => setError(String(reason)));
  }, []);

  return (
    <div className="app-shell print-window">
      <WindowTitleBar>
        <div className="print-window-title" onMouseDown={(event: MouseEvent) => drag.onMouseDown(event)}>
          {source ? `打印 - ${source.title}` : "打印"}
        </div>
      </WindowTitleBar>
      {source
        ? <PrintPanel source={source} onClose={close} />
        : <div className="print-window-status">{error ?? ""}</div>}
    </div>
  );
}
