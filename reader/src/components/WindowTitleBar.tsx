import { useEffect, useMemo, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { brandIcons } from "./brandIcons";
import { TabStrip } from "./TabStrip";
import { useWindowDragRegion } from "./windowDrag";
import {
  snapPhaseClass,
  snapPhaseReducer,
  type SnapEventKind,
  type SnapPhase,
} from "./snapInteraction";

/**
 * Custom title bar that merges the application icon, the tab strip, and
 * native-style window controls into a single compact row.
 *
 * - The native title bar is disabled (`decorations: false` in tauri.conf.json
 *   and `.decorations(false)` on every dynamically created window).
 * - The far-left icon is the canonical application SVG in a 24px canvas with no
 *   visible product-name text beside it.
 * - The flexible middle holds the existing `TabStrip` (reorder/detach/close
 *   logic untouched); its blank spacer is a window drag region.
 * - The right side exposes minimize / toggle-maximize / close controls. Close
 *   routes through the Tauri `close()` API so App.tsx's unsaved-change handler
 *   remains authoritative (it never calls `destroy()` directly here).
 *
 * On Windows 11, `tauri-plugin-frame` installs a native Snap Layout overlay over
 * the maximize button. The overlay owns the non-client mouse input there, so
 * the webview's own `:hover`/`:active`/`click` never fire while it is active.
 * The plugin emits five events on the current window; we subscribe to them
 * here to render equivalent hover/pressed classes and to call `toggleMaximize`
 * on the native click. The React `onClick` remains as the fallback on platforms
 * without the overlay, and the container is marked so the plugin does not
 * inject duplicate controls.
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

/** The native snap overlay events emitted by `tauri-plugin-frame`. */
const SNAP_EVENTS: SnapEventKind[] = [
  "mouseenter",
  "mouseleave",
  "mousedown",
  "mouseup",
  "click",
];

export function WindowTitleBar() {
  const drag = useWindowDragRegion();
  const win = useMemo(() => getCurrentWindow(), []);
  const controls = useMemo(() => makeControls(win), [win]);

  const [snapPhase, setSnapPhase] = useState<SnapPhase>("idle");

  useEffect(() => {
    let cancelled = false;
    const unlisteners: UnlistenFn[] = [];

    const register = async () => {
      for (const ev of SNAP_EVENTS) {
        try {
          const un = await win.listen(`tauri-frame://snap/${ev}`, (event) => {
            const kind = event.event.replace("tauri-frame://snap/", "") as SnapEventKind;
            if (kind === "click") {
              // The native child HWND owns this pointer event, so it cannot
              // also reach the React button underneath.
              controls.toggleMaximize();
            } else {
              setSnapPhase((prev) => snapPhaseReducer(prev, kind));
            }
          });
          if (cancelled) {
            un();
          } else {
            unlisteners.push(un);
          }
        } catch {
          // A failed listener registration must not crash the title bar; the
          // React onClick fallback still covers platforms without the overlay.
        }
      }
    };

    void register().catch(() => {});

    return () => {
      cancelled = true;
      for (const un of unlisteners) {
        try {
          un();
        } catch {
          // ignore
        }
      }
    };
  }, [controls, win]);

  const snapClass = snapPhaseClass(snapPhase);

  return (
    <div className="window-titlebar" role="banner">
      <div
        className="titlebar-icon"
        aria-hidden="true"
        onMouseDown={drag.onMouseDown}
      >
        <img src={brandIcons.reader} alt="" draggable={false} />
      </div>
      <TabStrip />
      <div
        className="titlebar-controls"
        role="group"
        aria-label="Window controls"
        data-tauri-frame-tb
      >
        <button
          type="button"
          id="frame-tb-minimize"
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
          id="frame-tb-maximize"
          className={"winctl winctl-maximize" + (snapClass ? " " + snapClass : "")}
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
          id="frame-tb-close"
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
