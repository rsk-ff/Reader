import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface UseMarkdownTextResult {
  text: string | null;
  loading: boolean;
  error: string | null;
}

/** Loads a Markdown file as UTF-8 text via the Rust `read_file_text` command. */
export function useMarkdownText(path: string | null): UseMarkdownTextResult {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setText(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    invoke<string>("read_file_text", { path })
      .then((t) => {
        if (!cancelled) {
          setText(t);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return { text, loading, error };
}

/**
 * Atomic save (§7). Writes through the Rust `save_file_text` command which
 * does temp-file + fsync + rename. Returns the new revision.
 */
export function useMarkdownSave(
  path: string,
  docId: string,
): { save: (text: string) => Promise<void> } {
  const savingRef = useRef(false);
  return {
    save: async (text: string) => {
      if (savingRef.current) return;
      savingRef.current = true;
      try {
        await invoke("save_file_text", { path, content: text });
        // clear dirty on the workspace so the tab ● disappears (§7).
        await invoke("set_dirty", { documentId: docId, dirty: false });
      } finally {
        savingRef.current = false;
      }
    },
  };
}
