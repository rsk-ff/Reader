import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/nord.css";

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
    });

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown, prevMarkdown) => {
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
      void crepe.destroy();
      crepeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <div ref={rootRef} className="milkdown-root" />;
}
