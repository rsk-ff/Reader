import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { usePdfDocument } from "./usePdfDocument";
import { PdfPage } from "./PdfPage";
import { PdfToolbar } from "./PdfToolbar";
import { PdfSidebar } from "./PdfSidebar";
import { runSearch } from "./search";
import type { SearchSession } from "./search";
import { destToPageIndex, flattenOutline } from "./outline";
import type { OutlineNode, PageInfo, ZoomMode } from "./types";
import type { PdfAnnotation } from "./annotation-types";
import { invoke } from "@tauri-apps/api/core";
import type { AnnotationTool } from "./PdfAnnotationLayer";
import { useWorkspace } from "../../workspace/store";

const PAGE_GAP = 8;
const RENDER_BUFFER = 2; // pages above/below the viewport to pre-render

interface PdfViewerProps {
  path: string;
  active: boolean;
}

export function PdfViewer({ path, active }: PdfViewerProps) {
  const { doc, loading, error, reload: reloadDoc } = usePdfDocument(path);
  const scrollRef = useRef<HTMLDivElement>(null);
  // track dirty locally (the workspace also tracks it, but we read via the
  // document session to show the ● in the toolbar).
  const [dirty, setDirty] = useState(false);
  const documentsById = useWorkspace((s) => s.documentsById);
  const [pageInfos, setPageInfos] = useState<PageInfo[]>([]);
  const [scale, setScale] = useState(1);
  const [zoomMode, setZoomMode] = useState<ZoomMode>("fit-width");
  const [currentPage, setCurrentPage] = useState(1);
  const [visibleRange, setVisibleRange] = useState<[number, number]>([1, 1]);
  const [sidebarMode, setSidebarMode] = useState<"thumbnails" | "outline" | null>(null);
  const [outline, setOutline] = useState<OutlineNode[]>([]);
  const [search, setSearch] = useState<SearchSession | null>(null);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchIdx, setSearchIdx] = useState(0);
  const [annotationsByPage, setAnnotationsByPage] = useState<Record<number, PdfAnnotation[]>>({});
  const [annotTool, setAnnotTool] = useState<AnnotationTool>("select");

  const maxPageWidth = useMemo(
    () => pageInfos.reduce((m, p) => Math.max(m, p.w1), 0) || 1,
    [pageInfos],
  );
  const maxPageHeight = useMemo(
    () => pageInfos.reduce((m, p) => Math.max(m, p.h1), 0) || 1,
    [pageInfos],
  );

  // ---- load page metadata (cheap: no rendering) ----
  useEffect(() => {
    if (!doc) {
      setPageInfos([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const infos: PageInfo[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const vp = page.getViewport({ scale: 1 });
        infos.push({ pageNumber: i, w1: vp.width, h1: vp.height, rotation: page.rotate ?? 0 });
        if (cancelled) return;
        // Yield periodically so a huge doc doesn't block the UI, but accumulate
        // into a local array and setState once at the end to avoid a render
        // storm (each setState would recompute fit scale + re-render page 1).
        if (i % 200 === 0) await new Promise((r) => setTimeout(r, 0));
      }
      if (!cancelled) setPageInfos(infos);
    })();
    return () => {
      cancelled = true;
    };
  }, [doc]);

  // ---- outline ----
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    doc.getOutline().then((o) => {
      if (!cancelled) setOutline((o ?? []) as OutlineNode[]);
    });
    return () => {
      cancelled = true;
    };
  }, [doc]);

  // ---- compute scale from zoom mode + container size ----
  const recomputeScale = useCallback(() => {
    const el = scrollRef.current;
    if (!el || pageInfos.length === 0) return;
    const availW = el.clientWidth - PAGE_GAP * 2;
    const availH = el.clientHeight - PAGE_GAP * 2;
    let next = scale;
    if (zoomMode === "fit-width") {
      next = availW / maxPageWidth;
    } else if (zoomMode === "fit-page") {
      next = Math.min(availW / maxPageWidth, availH / maxPageHeight);
    }
    // Skip if unchanged to avoid re-render storms during layout settling.
    if (Math.abs(next - scale) > 0.001) {
      setScale(next);
    }
  }, [pageInfos, maxPageWidth, maxPageHeight, zoomMode, scale]);

  useEffect(() => {
    recomputeScale();
  }, [recomputeScale]);

  // Debounced resize: the container fires many ResizeObserver events while the
  // window layout settles; coalesce them so we only recompute once per burst.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => recomputeScale(), 60);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [recomputeScale]);

  // ---- virtualization: visible range + current page via IntersectionObserver ----
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || pageInfos.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        let first = Infinity;
        let last = -1;
        let best = { page: currentPage, ratio: 0 };
        for (const e of entries) {
          const n = Number((e.target as HTMLElement).dataset.pageNumber);
          if (!n) continue;
          if (e.isIntersecting) {
            first = Math.min(first, n);
            last = Math.max(last, n);
            if (e.intersectionRatio > best.ratio) best = { page: n, ratio: e.intersectionRatio };
          }
        }
        if (last === -1) return;
        const bufFirst = Math.max(1, first - RENDER_BUFFER);
        const bufLast = Math.min(pageInfos.length, last + RENDER_BUFFER);
        setVisibleRange([bufFirst, bufLast]);
        setCurrentPage(best.page);
      },
      { root: el, threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] },
    );
    const wrappers = el.querySelectorAll<HTMLElement>(".pdf-page-wrapper");
    wrappers.forEach((w) => obs.observe(w));
    return () => obs.disconnect();
  }, [pageInfos, scale, currentPage]);

  // ---- scroll helpers (cumulative heights → deterministic scroll-to) ----
  const cumulativeTops = useMemo(() => {
    const tops: number[] = [];
    let acc = 0;
    for (const p of pageInfos) {
      tops.push(acc);
      acc += Math.round(p.h1 * scale) + PAGE_GAP;
    }
    return tops;
  }, [pageInfos, scale]);

  const scrollToPage = useCallback(
    (pageNumber: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const idx = Math.max(0, Math.min(pageInfos.length - 1, pageNumber - 1));
      el.scrollTo({ top: cumulativeTops[idx], behavior: "smooth" });
    },
    [cumulativeTops, pageInfos.length],
  );

  // ---- zoom controls ----
  const zoomIn = useCallback(() => {
    setZoomMode("manual");
    setScale((s) => Math.min(s * 1.1, 8));
  }, []);
  const zoomOut = useCallback(() => {
    setZoomMode("manual");
    setScale((s) => Math.max(s / 1.1, 0.1));
  }, []);
  const setFit = useCallback((m: ZoomMode) => {
    setZoomMode(m);
  }, []);

  // ---- search ----
  const runSearchNow = useCallback(
    async (query: string) => {
      if (!doc || !query.trim()) {
        setSearch(null);
        setSearchQuery(null);
        setSearchIdx(0);
        return;
      }
      setSearching(true);
      try {
        const session = await runSearch(doc, query);
        setSearch(session);
        setSearchQuery(query.trim().toLowerCase());
        setSearchIdx(0);
        if (session.pages.length > 0) scrollToPage(session.pages[0]);
      } finally {
        setSearching(false);
      }
    },
    [doc, scrollToPage],
  );

  const gotoSearchHit = useCallback(
    (dir: 1 | -1) => {
      if (!search || search.hits.length === 0) return;
      const next = (searchIdx + dir + search.hits.length) % search.hits.length;
      setSearchIdx(next);
      scrollToPage(search.hits[next].pageNumber);
    },
    [search, searchIdx, scrollToPage],
  );

  // ---- outline click ----
  const onOutlineClick = useCallback(
    async (node: OutlineNode) => {
      if (!doc) return;
      if (node.url) {
        window.open(node.url, "_blank");
        return;
      }
      const idx = await destToPageIndex(doc, node.dest);
      if (idx != null) scrollToPage(idx + 1);
    },
    [doc, scrollToPage],
  );

  // ---- annotations (§5) ----
  const loadAnnotations = useCallback(
    async (pageNumber: number) => {
      if (!doc) return;
      try {
        const anns = await invoke<PdfAnnotation[]>("get_annotations", {
          path,
          pageIndex: pageNumber - 1,
        });
        setAnnotationsByPage((prev) => ({ ...prev, [pageNumber]: anns }));
      } catch (e) {
        // backend may be unavailable (no pdfium) — fail quietly.
        console.warn("get_annotations failed", e);
      }
    },
    [doc, path],
  );

  // Load annotations for visible pages once the doc is ready.
  useEffect(() => {
    if (!doc) return;
    loadAnnotations(currentPage);
  }, [doc, currentPage, loadAnnotations]);

  const onAnnotationsChanged = useCallback(
    (pageNumber: number) => loadAnnotations(pageNumber),
    [loadAnnotations],
  );

  const onAnnotationCreated = useCallback((_ann: PdfAnnotation) => {
    // Already handled by onAnnotationsChanged reload.
  }, []);

  // ---- print (basic: render pages into a print window) ----
  const print = useCallback(async () => {
    if (!doc) return;
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.write(
      "<!doctype html><html><head><title>Print</title><style>" +
        "body{margin:0;background:#fff}canvas{display:block;width:100%;height:auto;page-break-after:always}" +
        "</style></head><body></body></html>",
    );
    win.document.close();
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const vp = page.getViewport({ scale: 1.5 });
      const canvas = win.document.createElement("canvas");
      canvas.width = vp.width;
      canvas.height = vp.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
      win.document.body.appendChild(canvas);
      await new Promise((r) => setTimeout(r, 10));
    }
    win.focus();
    win.print();
  }, [doc]);

  // ---- keyboard shortcuts (only when this viewer's tab is active) ----
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        void print();
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomIn();
      } else if (e.key === "-") {
        e.preventDefault();
        zoomOut();
      } else if (e.key === "0") {
        e.preventDefault();
        setFit("fit-width");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, print, zoomIn, zoomOut, setFit]);

  // ---- save (§7) ----
  const saveDocument = useCallback(async () => {
    try {
      await invoke("save_document", { path });
      setDirty(false);
    } catch (e) {
      console.warn("save failed", e);
    }
  }, [path]);

  // Sync dirty from the workspace (create_annotation sets it there).
  useEffect(() => {
    const doc = documentsById[Object.keys(documentsById).find((k) => documentsById[k].path === path) ?? ""];
    if (doc) setDirty(doc.dirty);
  }, [documentsById, path]);

  // Ctrl+S
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        void saveDocument();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, saveDocument]);

  // ---- page mutation (§6) ----
  const insertBlank = useCallback(
    async (relative: "before" | "after") => {
      if (!doc) return;
      const idx = relative === "before" ? currentPage - 1 : currentPage;
      try {
        await invoke("insert_blank_page", {
          path,
          index: idx,
          size: "Same",
          referencePageIndex: currentPage - 1,
        });
        reloadDoc();
      } catch (e) {
        console.warn("insert page failed", e);
      }
    },
    [doc, currentPage, path, reloadDoc],
  );

  const deleteCurrentPage = useCallback(async () => {
    if (!doc) return;
    if (doc.numPages <= 1) {
      alert("Cannot delete the last page.");
      return;
    }
    if (!confirm(`Delete page ${currentPage}?`)) return;
    try {
      await invoke("delete_page", { path, index: currentPage - 1 });
      reloadDoc();
    } catch (e) {
      console.warn("delete page failed", e);
    }
  }, [doc, currentPage, path, reloadDoc]);

  if (loading) {
    return <div className="pdf-status">opening PDF…</div>;
  }
  if (error) {
    return <div className="pdf-status pdf-status-error">failed to open PDF: {error}</div>;
  }
  if (!doc) {
    return <div className="pdf-status">no document</div>;
  }

  const flatOutline = flattenOutline(outline);
  const totalPages = doc.numPages;
  const renderFirst = visibleRange[0];
  const renderLast = visibleRange[1];

  return (
    <div className="pdf-root">
      <PdfToolbar
        currentPage={currentPage}
        totalPages={totalPages}
        scale={scale}
        zoomMode={zoomMode}
        sidebarMode={sidebarMode}
        hasOutline={outline.length > 0}
        searchHits={search?.hits.length ?? 0}
        searchIdx={searchIdx}
        searching={searching}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onFit={setFit}
        onSidebarToggle={(m) => setSidebarMode((cur) => (cur === m ? null : m))}
        onSearch={runSearchNow}
        onSearchNav={gotoSearchHit}
        onPrint={print}
        onJumpPage={scrollToPage}
        annotTool={annotTool}
        dirty={dirty}
        onAnnotTool={setAnnotTool}
        onSave={saveDocument}
        onInsertBlankBefore={() => void insertBlank("before")}
        onInsertBlankAfter={() => void insertBlank("after")}
        onDeletePage={deleteCurrentPage}
      />
      <div className="pdf-body">
        {sidebarMode && (
          <PdfSidebar
            mode={sidebarMode}
            doc={doc}
            pageInfos={pageInfos}
            outline={flatOutline}
            currentPage={currentPage}
            onOutlineClick={onOutlineClick}
            onThumbClick={scrollToPage}
          />
        )}
        <div className="pdf-scroll" ref={scrollRef}>
          <div className="pdf-pages" style={{ gap: PAGE_GAP }}>
            {pageInfos.map((p) => {
              const active = p.pageNumber >= renderFirst && p.pageNumber <= renderLast;
              return (
                <PdfPage
                  key={p.pageNumber}
                  doc={doc}
                  path={path}
                  pageNumber={p.pageNumber}
                  w1={p.w1}
                  h1={p.h1}
                  scale={scale}
                  active={active}
                  searchQuery={searchQuery}
                  annotations={annotationsByPage[p.pageNumber] ?? []}
                  annotTool={annotTool}
                  onAnnotationsChanged={onAnnotationsChanged}
                  onAnnotationCreated={onAnnotationCreated}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
