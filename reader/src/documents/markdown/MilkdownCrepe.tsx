import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import "./milkdownTheme.css";

interface MilkdownCrepeProps {
  /** Initial markdown for this mount. Use a React key to load another value. */
  value: string;
  /** Fired on every user edit with the new markdown string. */
  onChange: (markdown: string) => void;
  /** Fired once the editor is mounted and ready. */
  onReady?: () => void;
}

/**
 * Crepe (Milkdown) WYSIWYG editor wrapper.
 *
 * Lifecycle is managed imperatively: Crepe owns the DOM inside `rootRef`, and
 * we create/destroy it on mount/unmount. Editing echoes updated text through
 * React without replacing the live editor, its selection or undo history.
 * The parent explicitly re-mounts when loading source edits or discarding edits.
 */
export function MilkdownCrepe({ value, onChange, onReady }: MilkdownCrepeProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const initialValueRef = useRef(value);
  const callbacksRef = useRef({ onChange, onReady });
  const lifecycleRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    callbacksRef.current = { onChange, onReady };
  }, [onChange, onReady]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let destroyed = false;
    let hasEditIntent = false;
    let crepe: Crepe | null = null;

    const reportError = (phase: string, error: unknown) => {
      void invoke("log_frontend", {
        level: "error",
        message: `milkdown ${phase} failed: ${error}`,
      }).catch(() => {});
    };

    const markEditIntent = (event: Event) => {
      if (event.isTrusted) hasEditIntent = true;
    };
    const onEditingKey = (event: KeyboardEvent) => {
      if (!event.isTrusted) return;
      const key = event.key.toLowerCase();
      const plainEditingKey =
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        (event.key.length === 1 ||
          ["Enter", "Backspace", "Delete", "Tab"].includes(event.key));
      const editingShortcut =
        (event.ctrlKey || event.metaKey) &&
        ["z", "y", "b", "i", "u", "k", "enter"].includes(key);
      if (event.isComposing || plainEditingKey || editingShortcut) {
        hasEditIntent = true;
      }
    };
    const onEditingControlPointer = (event: PointerEvent) => {
      if (
        !event.isTrusted ||
        event.button !== 0 ||
        !(event.target instanceof Element)
      ) {
        return;
      }
      if (
        event.target.closest(
          "button, input, select, textarea, [role='button'], .label-wrapper",
        )
      ) {
        hasEditIntent = true;
      }
    };

    root.addEventListener("beforeinput", markEditIntent, true);
    root.addEventListener("compositionstart", markEditIntent, true);
    root.addEventListener("paste", markEditIntent, true);
    root.addEventListener("cut", markEditIntent, true);
    root.addEventListener("drop", markEditIntent, true);
    root.addEventListener("keydown", onEditingKey, true);
    root.addEventListener("pointerdown", onEditingControlPointer, true);

    // StrictMode can replay this effect on the same DOM root. Serialize the
    // previous cleanup before starting again, and skip cancelled setup work.
    const created = lifecycleRef.current
      .then(async () => {
        if (destroyed) return;
        crepe = new Crepe({
          root,
          defaultValue: initialValueRef.current,
          features: {
            // Reader keeps inline editing without Notion-style block handles.
            // Its own toolbar supplies document actions; AI stays disabled.
            [Crepe.Feature.TopBar]: false,
            [Crepe.Feature.AI]: false,
            [Crepe.Feature.BlockEdit]: false,
          },
          featureConfigs: {
            // Crepe defaults to oneDark even when the outer editor is light.
            // Null selects CodeMirror's basic light theme; the public type
            // does not expose "none".
            [Crepe.Feature.CodeMirror]: { theme: null as never },
          },
        });

        crepe.on((listener) => {
          listener.markdownUpdated((_ctx, markdown, prevMarkdown) => {
            // Async table/task-list setup can normalize GFM without an edit.
            // Ignore those changes, and ignore events from an obsolete mount.
            if (destroyed || !hasEditIntent) return;
            if (markdown !== prevMarkdown) callbacksRef.current.onChange(markdown);
          });
        });

        await crepe.create();
        if (!destroyed) callbacksRef.current.onReady?.();
      })
      .catch((error: unknown) => reportError("init", error));

    return () => {
      destroyed = true;
      root.removeEventListener("beforeinput", markEditIntent, true);
      root.removeEventListener("compositionstart", markEditIntent, true);
      root.removeEventListener("paste", markEditIntent, true);
      root.removeEventListener("cut", markEditIntent, true);
      root.removeEventListener("drop", markEditIntent, true);
      root.removeEventListener("keydown", onEditingKey, true);
      root.removeEventListener("pointerdown", onEditingControlPointer, true);
      lifecycleRef.current = created
        .then(async () => { await crepe?.destroy(); })
        .catch((error: unknown) => reportError("destroy", error));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={rootRef} className="milkdown-root" />;
}
