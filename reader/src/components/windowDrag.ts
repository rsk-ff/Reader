import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Window-drag region support for the custom title bar (Task: merge tabs into
 * the top window bar).
 *
 * The native title bar is removed (`decorations: false`), so blank regions of
 * the custom chrome must drive the OS move loop via the Tauri `startDragging`
 * command, and double-clicking a blank region toggles maximize/restore.
 *
 * Both actions are handled inside a single primary `mousedown` handler, per
 * the official Tauri v2 window-customization guidance for a manual drag
 * region: when the primary button is down, `event.detail === 2` (the second
 * click of a double-click) calls `toggleMaximize()`; otherwise it calls
 * `startDragging()`. Relying on the browser's separate `dblclick` event is
 * unreliable because the native move loop started by `startDragging()` on the
 * first `mousedown` consumes the pointer sequence, so the `dblclick` may never
 * fire.
 *
 * Interactive elements (tabs, window controls) are *not* drag regions: they are
 * separate elements without these handlers, and any draggable child glyph uses
 * `pointer-events: none` so the mousedown lands on the drag region itself.
 */

/** A minimal view of the Tauri window the drag handlers need. */
export type DragWindow = {
  startDragging: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
};

/** The shape of the pointer events the handlers consume. */
export interface DragPointerEvent {
  button: number;
  /** The click count, as exposed by `MouseEvent.detail`. 1 = single click,
   * 2 = the second click of a double-click, etc. */
  detail: number;
  target: unknown;
  currentTarget: unknown;
  preventDefault: () => void;
}

export interface WindowDragHandlers {
  /** Attach to `onMouseDown` of a drag region element. */
  onMouseDown: (event: DragPointerEvent) => void;
  /** Start the native move loop directly (used by a single-tab titlebar). */
  startDragging: () => Promise<void>;
  /** Toggle maximize/restore directly (used by a single-tab titlebar). */
  toggleMaximize: () => Promise<void>;
}

/**
 * True when the pointer event originated on an interactive descendant of the
 * drag region rather than the blank region itself. Drag regions intentionally
 * have no interactive children (decorative glyphs use `pointer-events: none`),
 * but this guard keeps a stray descendant from starting an OS move loop.
 */
export function isInteractiveTarget(event: {
  target: unknown;
  currentTarget: unknown;
}): boolean {
  return event.target !== event.currentTarget;
}

/**
 * Build drag-region handlers bound to a specific window. Factored out so it can
 * be unit-tested with a fake window without touching the Tauri API.
 *
 * Every ignored promise gets an explicit rejection handler so no unhandled
 * rejection is introduced if the window action fails.
 */
export function createWindowDragHandlers(win: DragWindow): WindowDragHandlers {
  const onMouseDown: WindowDragHandlers["onMouseDown"] = (event) => {
    if (event.button !== 0) return;
    if (isInteractiveTarget(event)) return;
    event.preventDefault();
    if (event.detail === 2) {
      // Second click of a double-click: toggle maximize/restore *without*
      // starting a drag, which would otherwise fight the toggle.
      win.toggleMaximize().catch(() => {
        // A failed maximize toggle is non-fatal.
      });
      return;
    }
    win.startDragging().catch(() => {
      // A failed drag is non-fatal: the window simply will not move.
    });
  };
  return {
    onMouseDown,
    startDragging: () => win.startDragging(),
    toggleMaximize: () => win.toggleMaximize(),
  };
}

/** React hook: drag handlers for the current window. */
export function useWindowDragRegion(): WindowDragHandlers {
  // Resolve at call time so the hook never depends on a module-eval window.
  return createWindowDragHandlers(getCurrentWindow());
}
