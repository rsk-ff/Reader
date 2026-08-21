/**
 * Pure state mapping for the native Windows Snap Layout overlay events emitted
 * by `tauri-plugin-frame`.
 *
 * The plugin installs a native child HWND over the custom maximize button that
 * returns `HTMAXBUTTON`, so it owns the non-client mouse input there and the
 * webview's own `:hover`/`:active`/`click` never fire while the overlay is
 * active. The plugin emits five events on the current window; this reducer maps
 * `mouseenter`/`mouseleave`/`mousedown`/`mouseup` to a hover/pressed phase so
 * the React-rendered button can render equivalent feedback classes. The
 * `click` event is handled separately (it toggles maximize) and does not
 * change the phase, which keeps a stray `click` after `mouseleave` from
 * leaving the button stuck in a hover state.
 */

export type SnapPhase = "idle" | "hover" | "pressed";

export type SnapEventKind =
  | "mouseenter"
  | "mouseleave"
  | "mousedown"
  | "mouseup"
  | "click";

/** Translate snap events into a hover/pressed phase. */
export function snapPhaseReducer(state: SnapPhase, event: SnapEventKind): SnapPhase {
  switch (event) {
    case "mouseenter":
      return "hover";
    case "mousedown":
      return "pressed";
    case "mouseup":
      return "hover";
    case "mouseleave":
      return "idle";
    case "click":
      return state;
    default:
      return state;
  }
}

/** The extra class name to apply to the maximize button for a given phase. */
export function snapPhaseClass(phase: SnapPhase): string {
  switch (phase) {
    case "hover":
      return "winctl-snap-hover";
    case "pressed":
      return "winctl-snap-pressed";
    default:
      return "";
  }
}
