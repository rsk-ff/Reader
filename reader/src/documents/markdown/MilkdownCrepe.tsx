import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import "github-markdown-css/github-markdown-light.css";

interface MilkdownCrepeProps {
  /** Initial markdown value. Re-mounts when this string identity changes. */
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
 * we create/destroy it on mount/unmount. Re-mounting on `value` identity change
 * is intentional — it's how source↔WYSIWYG switching reloads content safely.
 */
export function MilkdownCrepe({ value, onChange, onReady }: MilkdownCrepeProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let destroyed = false;
    let hasEditIntent = false;

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

    const crepe = new Crepe({
      root,
      defaultValue: value,
      features: {
        // Disable AI and top-bar (we render our own toolbar). Keep the rest of
        // the Typora-like experience: code-mirror code blocks, link tooltip,
        // image block, table, latex, block-edit, toolbar, cursor, placeholder.
        [Crepe.Feature.TopBar]: false,
        [Crepe.Feature.AI]: false,
      },
      featureConfigs: {
        // Crepe defaults to oneDark even when the outer editor is light. Null
        // deliberately bypasses that default and lets CodeMirror basicSetup use
        // its maintained light theme. The public type does not expose "none".
        [Crepe.Feature.CodeMirror]: { theme: null as never },
      },
    });

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown, prevMarkdown) => {
        // Crepe normalizes valid GFM again as async table/task-list features
        // mount. Only publish changes after a trusted editing gesture so those
        // bootstrap transactions cannot make a freshly opened file dirty.
        if (!hasEditIntent) return;
        // Only fire on actual content change, not selection/attribute updates.
        if (markdown !== prevMarkdown) onChange(markdown);
      });
    });

    crepe
      .create()
      .then(() => {
        if (destroyed) {
          void crepe.destroy();
          return;
        }
        onReady?.();
      })
      .catch((e) => {
        void invoke("log_frontend", {
          level: "error",
          message: `milkdown init failed: ${e}`,
        }).catch(() => {});
      });

    crepeRef.current = crepe;

    return () => {
      destroyed = true;
      root.removeEventListener("beforeinput", markEditIntent, true);
      root.removeEventListener("compositionstart", markEditIntent, true);
      root.removeEventListener("paste", markEditIntent, true);
      root.removeEventListener("cut", markEditIntent, true);
      root.removeEventListener("drop", markEditIntent, true);
      root.removeEventListener("keydown", onEditingKey, true);
      root.removeEventListener("pointerdown", onEditingControlPointer, true);
      void crepe.destroy();
      crepeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <div ref={rootRef} className="milkdown-root markdown-body" />;
}
