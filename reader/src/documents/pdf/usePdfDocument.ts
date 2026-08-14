import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PDFDocumentProxy } from "pdfjs-dist";

import { pdfjsLib } from "./pdfjs";

interface UsePdfDocumentResult {
  doc: PDFDocumentProxy | null;
  loading: boolean;
  error: string | null;
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
        void invoke("log_frontend", {
          level: "info",
          message: `pdf loaded: ${loaded.numPages} pages from ${path}`,
        }).catch(() => {});
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
  }, [path]);

  return { doc, loading, error };
}
