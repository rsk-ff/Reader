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

/** Error prefix from `save_file_text` when the file changed outside Reader. */
export const EXTERNAL_CHANGE_ERROR = "EXTERNAL_CHANGE:";

export function isExternalChangeError(error: unknown): boolean {
  return String(error).startsWith(EXTERNAL_CHANGE_ERROR);
}

/**
 * Atomic save (§7). Writes through the Rust `save_file_text` command which
 * does temp-file + fsync + rename and keeps the file's BOM and line endings.
 * Without `overwrite`, it fails with EXTERNAL_CHANGE_ERROR when the file was
 * changed on disk since Reader last read or wrote it.
 */
export function useMarkdownSave(
  path: string,
): { save: (text: string, overwrite?: boolean) => Promise<void> } {
  const save = useCallback(async (text: string, overwrite = false) => {
    await invoke("save_file_text", { path, content: text, overwrite });
  }, [path]);
  return { save };
}
