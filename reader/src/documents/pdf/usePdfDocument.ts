import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface PdfPageInfo {
  page_number: number;
  w1: number;
  h1: number;
  rotation: number;
}

interface UsePdfDocumentResult {
  pageInfos: PdfPageInfo[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Loads PDF page metadata via PDFium (Rust). No pdf.js — PDFium is Chrome's
 * engine and renders every PDF without crashing. Page bitmaps + text layers
 * are fetched per-page by `PdfPage` on demand.
 */
export function usePdfDocument(path: string | null): UsePdfDocumentResult {
  const [pageInfos, setPageInfos] = useState<PdfPageInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!path) {
      setPageInfos([]);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPageInfos([]);
    (async () => {
      try {
        const infos = await invoke<PdfPageInfo[]>("get_page_infos", { path });
        if (!cancelled) setPageInfos(infos);
      } catch (e) {
        if (!cancelled) setError(String(e instanceof Error ? e.message : e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [path, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  return { pageInfos, loading, error, reload };
}
