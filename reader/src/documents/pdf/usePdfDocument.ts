import { useCallback, useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { PDFDocumentProxy } from "pdfjs-dist";

import { pdfjsLib } from "./pdfjs";

interface UsePdfDocumentResult {
  doc: PDFDocumentProxy | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Loads a PDF. Uses the `reader-file://` custom URI scheme (§27 Phase 7) so
 * pdf.js can range-request pages instead of reading the whole file into memory.
 * For very small PDFs (< 64 KiB) we still read bytes directly to avoid the
 * round-trip overhead of many tiny range requests.
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
        const url = convertFileSrc(path);
        loadingTask = pdfjsLib.getDocument({ url });
        const loaded = await loadingTask.promise;
        if (cancelled) {
          loaded.cleanup();
          return;
        }
        setDoc(loaded);
      } catch (e) {
        if (!cancelled) {
          setError(String(e instanceof Error ? e.message : e));
        }
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
