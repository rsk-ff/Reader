import { useCallback, useEffect, useState } from "react";
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
): { save: (text: string) => Promise<void> } {
  const save = useCallback(async (text: string) => {
    await invoke("save_file_text", { path, content: text });
  }, [path]);
  return { save };
}
