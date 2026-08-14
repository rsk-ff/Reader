import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PDFDocumentProxy } from "pdfjs-dist";

import { pdfjsLib } from "./pdfjs";

interface UsePdfDocumentResult {
  doc: PDFDocumentProxy | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Loads a PDF from a filesystem path via the Rust `read_file_bytes` command and
 * hands the raw bytes to `pdfjs.getDocument`. The whole file is read into memory
 * once; pdfjs then owns parsing/range serving internally (§4, §24).
 */
export function usePdfDocument(path: string | null): UsePdfDocumentResult {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!path) {
      setDoc(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | null = null;

    setLoading(true);
    setError(null);
    setDoc(null);

    (async () => {
      try {
        const buf = await invoke<ArrayBuffer | Uint8Array>("read_file_bytes", {
          path,
        });
        const data =
          buf instanceof Uint8Array ? buf : new Uint8Array(buf);
        // pdfjs transfers/owns the data; copy to be safe against the IPC buffer
        // being detached by the worker.
        loadingTask = pdfjsLib.getDocument({ data: data.slice(0) });
        const loaded = await loadingTask.promise;
        if (cancelled) {
          loaded.cleanup();
          return;
        }
        setDoc(loaded);
      } catch (e) {
        if (!cancelled) setError(String(e instanceof Error ? e.message : e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (loadingTask) loadingTask.destroy();
    };
  }, [path, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { doc, loading, error, reload };
}
