import { useMemo } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import appIconUrl from "../../src-tauri/icons/32x32.png";
import { TabStrip } from "./TabStrip";
import { useWindowDragRegion } from "./windowDrag";

/**
 * Custom title bar that merges the application icon, the tab strip, and
 * native-style window controls into a single compact row.
 *
 * - The native title bar is disabled (`decorations: false` in tauri.conf.json
 *   and `.decorations(false)` on every dynamically created window).
 * - The far-left icon is the existing `icons/32x32.png`, shown at ~16px with no
 *   visible product-name text beside it.
 * - The flexible middle holds the existing `TabStrip` (reorder/detach/close
 *   logic untouched); its blank spacer is a window drag region.
 * - The right side exposes minimize / toggle-maximize / close controls. Close
 *   routes through the Tauri `close()` API so App.tsx's unsaved-change handler
 *   remains authoritative (it never calls `destroy()` directly here).
 *
 * Every window-action promise gets an explicit rejection handler.
 */

function ignoreRejection(error: unknown) {
  // Window actions failing must not surface as an unhandled rejection. The
  // individual controls are best-effort; a failure leaves the window usable.
  void error;
}

function makeControls(win: ReturnType<typeof getCurrentWindow>) {
  return {
    minimize: () => win.minimize().catch(ignoreRejection),
    toggleMaximize: () => win.toggleMaximize().catch(ignoreRejection),
    close: () => win.close().catch(ignoreRejection),
  };
}

export function WindowTitleBar() {
  const drag = useWindowDragRegion();
  const win = getCurrentWindow();
  const controls = useMemo(() => makeControls(win), [win]);

  return (
    <div className="window-titlebar" role="banner">
      <div
        className="titlebar-icon"
        aria-hidden="true"
        onMouseDown={drag.onMouseDown}
      >
        <img src={appIconUrl} alt="" draggable={false} />
      </div>
      <TabStrip />
      <div className="titlebar-controls" role="group" aria-label="Window controls">
        <button
          type="button"
          className="winctl winctl-minimize"
          aria-label="Minimize"
          title="Minimize"
          onClick={controls.minimize}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
            <rect x="1" y="4.75" width="8" height="1" fill="currentColor" />
          </svg>
        </button>
        <button
          type="button"
          className="winctl winctl-maximize"
          aria-label="Maximize"
          title="Maximize / Restore"
          onClick={controls.toggleMaximize}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
            <rect
              x="1.25"
              y="1.25"
              width="7.5"
              height="7.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
            />
          </svg>
        </button>
        <button
          type="button"
          className="winctl winctl-close"
          aria-label="Close"
          title="Close"
          onClick={controls.close}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
            <path
              d="M1.25 1.25 L8.75 8.75 M8.75 1.25 L1.25 8.75"
              stroke="currentColor"
              strokeWidth="1"
              fill="none"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
