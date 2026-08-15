import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import { usePdfDocument } from "./usePdfDocument";
import { PdfPage } from "./PdfPage";
import { PdfToolbar } from "./PdfToolbar";
import { PdfSidebar } from "./PdfSidebar";
import type { PdfAnnotation } from "./annotation-types";
import type { AnnotationTool } from "./PdfAnnotationLayer";

const PAGE_GAP = 8;
const RENDER_BUFFER = 2;

interface PdfViewerProps {
  path: string;
  active: boolean;
}

export function PdfViewer({ path, active }: PdfViewerProps) {
  const { pageInfos, loading, error, reload: reloadDoc } = usePdfDocument(path);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [zoomMode, setZoomMode] = useState<"fit-width" | "fit-page" | "manual">("fit-width");
  const [currentPage, setCurrentPage] = useState(1);
  const [visibleRange, setVisibleRange] = useState<[number, number]>([1, 1]);
  const [sidebarMode, setSidebarMode] = useState<"thumbnails" | "outline" | null>(null);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [searchHits, setSearchHits] = useState(0);
  const [searchIdx, setSearchIdx] = useState(0);
  const [searching, setSearching] = useState(false);
  const annotationsByPage = useRef<Record<number, PdfAnnotation[]>>({});
  const [annotTool, setAnnotTool] = useState<AnnotationTool>("select");
  const [dirty, setDirty] = useState(false);
  const documentsById = useWorkspaceDocuments(path);

  const totalPages = pageInfos.length;
  const maxPageWidth = useMemo(() => pageInfos.reduce((m, p) => Math.max(m, p.w1), 0) || 1, [pageInfos]);
  const maxPageHeight = useMemo(() => pageInfos.reduce((m, p) => Math.max(m, p.h1), 0) || 1, [pageInfos]);

  // ---- zoom ----
  const recomputeScale = useCallback(() => {
    const el = scrollRef.current;
    if (!el || pageInfos.length === 0) return;
    const availW = el.clientWidth - PAGE_GAP * 2;
    const availH = el.clientHeight - PAGE_GAP * 2;
    let next = scale;
    if (zoomMode === "fit-width") next = availW / maxPageWidth;
    else if (zoomMode === "fit-page") next = Math.min(availW / maxPageWidth, availH / maxPageHeight);
    if (Math.abs(next - scale) > 0.001) setScale(next);
  }, [pageInfos, maxPageWidth, maxPageHeight, zoomMode, scale]);

  useEffect(() => { recomputeScale(); }, [recomputeScale]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver(() => { if (t) clearTimeout(t); t = setTimeout(recomputeScale, 60); });
    ro.observe(el);
    return () => { ro.disconnect(); if (t) clearTimeout(t); };
  }, [recomputeScale]);

  const zoomIn = useCallback(() => { setZoomMode("manual"); setScale(s => Math.min(s * 1.1, 8)); }, []);
  const zoomOut = useCallback(() => { setZoomMode("manual"); setScale(s => Math.max(s / 1.1, 0.1)); }, []);
  const setFit = useCallback((m: "fit-width" | "fit-page" | "manual") => { if (m !== "manual") setZoomMode(m); }, []);

  // ---- virtualization ----
  const cumulativeTops = useMemo(() => {
    const tops: number[] = [];
    let acc = 0;
    for (const p of pageInfos) { tops.push(acc); acc += Math.round(p.h1 * scale) + PAGE_GAP; }
    return tops;
  }, [pageInfos, scale]);

  const scrollToPage = useCallback((n: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.max(0, Math.min(pageInfos.length - 1, n - 1));
    el.scrollTo({ top: cumulativeTops[idx] ?? 0, behavior: "smooth" });
  }, [cumulativeTops, pageInfos.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || pageInfos.length === 0) return;
    const obs = new IntersectionObserver((entries) => {
      let first = Infinity, last = -1, best = { page: currentPage, ratio: 0 };
      for (const e of entries) {
        const n = Number((e.target as HTMLElement).dataset.pageNumber);
        if (!n) continue;
        if (e.isIntersecting) {
          first = Math.min(first, n); last = Math.max(last, n);
          if (e.intersectionRatio > best.ratio) best = { page: n, ratio: e.intersectionRatio };
        }
      }
      if (last === -1) return;
      setVisibleRange([Math.max(1, first - RENDER_BUFFER), Math.min(pageInfos.length, last + RENDER_BUFFER)]);
      setCurrentPage(best.page);
    }, { root: el, threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] });
    el.querySelectorAll<HTMLElement>(".pdf-page-wrapper").forEach(w => obs.observe(w));
    return () => obs.disconnect();
  }, [pageInfos, scale, currentPage]);

  // ---- search (client-side scan of PDFium text per visible page) ----
  const runSearch = useCallback(async (query: string) => {
    if (!query.trim()) { setSearchQuery(null); setSearchHits(0); return; }
    setSearching(true);
    try {
      const q = query.trim().toLowerCase();
      let hits = 0;
      for (let i = 1; i <= totalPages; i++) {
        try {
          const segs = await invoke<Array<{ text: string }>>("get_page_text", { path, pageIndex: i - 1 });
          if (segs.some(s => s.text.toLowerCase().includes(q))) hits++;
        } catch { /* skip */ }
      }
      setSearchQuery(q);
      setSearchHits(hits);
      setSearchIdx(0);
    } finally { setSearching(false); }
  }, [path, totalPages]);

  const gotoSearchHit = useCallback((dir: 1 | -1) => {
    if (searchHits === 0) return;
    setSearchIdx(i => { const n = (i + dir + searchHits) % searchHits; return n; });
  }, [searchHits]);

  // ---- annotations ----
  const loadAnnotations = useCallback(async (_n: number) => {
    // DISABLED: PDFium annotation reading crashes on Acrobat-annotated PDFs.
    // Will be re-enabled with a safe annotation reader.
  }, []);

  useEffect(() => { if (totalPages > 0) loadAnnotations(currentPage); }, [currentPage, totalPages, loadAnnotations]);
  const onAnnotationsChanged = useCallback((n: number) => loadAnnotations(n), [loadAnnotations]);
  const onAnnotationCreated = useCallback((_ann: PdfAnnotation) => {}, []);

  // ---- save ----
  const saveDocument = useCallback(async () => {
    try { await invoke("save_document", { path }); setDirty(false); } catch (e) { console.warn("save", e); }
  }, [path]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === "s" || e.key === "S") { e.preventDefault(); void saveDocument(); }
      else if (e.key === "p" || e.key === "P") { e.preventDefault(); void print(); }
      else if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomIn(); }
      else if (e.key === "-") { e.preventDefault(); zoomOut(); }
      else if (e.key === "0") { e.preventDefault(); setFit("fit-width"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, saveDocument, zoomIn, zoomOut, setFit]);

  useEffect(() => {
    const doc = documentsById[Object.keys(documentsById).find(k => documentsById[k].path === path) ?? ""];
    if (doc) setDirty(doc.dirty);
  }, [documentsById, path]);

  // ---- print ----
  const print = useCallback(async () => {
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.write("<!doctype html><html><head><title>Print</title><style>body{margin:0;background:#fff}img{display:block;width:100%;height:auto;page-break-after:always}</style></head><body></body></html>");
    win.document.close();
    for (let i = 1; i <= totalPages; i++) {
      try {
        const bytes = await invoke<ArrayBuffer | Uint8Array>("render_page", { path, pageIndex: i - 1, scale: 1.5 });
        const blob = new Blob([bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)], { type: "image/png" });
        const img = win.document.createElement("img");
        img.src = URL.createObjectURL(blob);
        win.document.body.appendChild(img);
      } catch (e) { console.warn("print p", i, e); }
    }
    win.focus(); win.print();
  }, [path, totalPages]);

  if (loading) return <div className="pdf-status">opening PDF…</div>;
  if (error) return <div className="pdf-status pdf-status-error">failed to open PDF: {error}</div>;
  if (totalPages === 0) return <div className="pdf-status">no pages</div>;

  const totalHeight = pageInfos.length > 0
    ? (cumulativeTops[cumulativeTops.length - 1] ?? 0) + Math.round(pageInfos[pageInfos.length - 1].h1 * scale) + PAGE_GAP
    : 0;

  return (
    <div className="pdf-root">
      <PdfToolbar
        currentPage={currentPage}
        totalPages={totalPages}
        scale={scale}
        zoomMode={zoomMode}
        sidebarMode={sidebarMode}
        hasOutline={false}
        searchHits={searchHits}
        searchIdx={searchIdx}
        searching={searching}
        annotTool={annotTool}
        dirty={dirty}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onFit={setFit}
        onSidebarToggle={(m) => setSidebarMode(cur => cur === m ? null : m)}
        onSearch={runSearch}
        onSearchNav={gotoSearchHit}
        onPrint={print}
        onJumpPage={scrollToPage}
        onAnnotTool={setAnnotTool}
        onSave={saveDocument}
        onInsertBlankBefore={() => { void invoke("insert_blank_page", { path, index: currentPage - 1, size: "Same", referencePageIndex: currentPage - 1 }).then(() => reloadDoc()); }}
        onInsertBlankAfter={() => { void invoke("insert_blank_page", { path, index: currentPage, size: "Same", referencePageIndex: currentPage - 1 }).then(() => reloadDoc()); }}
        onDeletePage={async () => { if (totalPages > 1 && confirm(`Delete page ${currentPage}?`)) { await invoke("delete_page", { path, index: currentPage - 1 }); reloadDoc(); } }}
      />
      <div className="pdf-body">
        {sidebarMode === "thumbnails" && (
          <PdfSidebar mode="thumbnails" path={path} pageInfos={pageInfos.map(p => ({ pageNumber: p.page_number, w1: p.w1, h1: p.h1, rotation: p.rotation }))} outline={[]} currentPage={currentPage} onOutlineClick={() => {}} onThumbClick={scrollToPage} />
        )}
        <div className="pdf-scroll" ref={scrollRef}>
          <div className="pdf-pages" style={{ height: totalHeight, position: "relative" }}>
            {pageInfos.map((p) => {
              const idx = p.page_number - 1;
              const top = cumulativeTops[idx] ?? 0;
              const h = Math.round(p.h1 * scale);
              const inRange = p.page_number >= visibleRange[0] && p.page_number <= visibleRange[1];
              if (!inRange) {
                return <div key={p.page_number} className="pdf-page-spacer" data-page-number={p.page_number}
                  style={{ position: "absolute", top, left: 0, right: 0, height: h }} />;
              }
              return (
                <div key={p.page_number} className="pdf-page-wrapper-outer" data-page-number={p.page_number}
                  style={{ position: "absolute", top, left: 0, right: 0 }}>
                  <PdfPage
                    path={path}
                    pageNumber={p.page_number}
                    w1={p.w1}
                    h1={p.h1}
                    scale={scale}
                    active={true}
                    searchQuery={searchQuery}
                    annotations={annotationsByPage.current[p.page_number] ?? []}
                    annotTool={annotTool}
                    onAnnotationsChanged={onAnnotationsChanged}
                    onAnnotationCreated={onAnnotationCreated}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// helper to avoid circular import: read workspace documents for dirty tracking
import { useWorkspace } from "../../workspace/store";
function useWorkspaceDocuments(_path: string) {
  return useWorkspace((s) => s.documentsById);
}
