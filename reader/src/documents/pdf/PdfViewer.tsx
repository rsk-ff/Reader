import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  AnnotationMode,
  GlobalWorkerOptions,
  PasswordResponses,
  getDocument,
} from "pdfjs-dist";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFPageProxy,
} from "pdfjs-dist";
import {
  EventBus,
  FindState,
  LinkTarget,
  PDFFindController,
  PDFLinkService,
} from "pdfjs-dist/web/pdf_viewer.mjs";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import { useWorkspace } from "../../workspace/store";
import { registerDocumentLifecycle } from "../../workspace/documentLifecycle";
import type { PdfAnnotation } from "./annotation-types";
import { PdfJsAnnotationPortals } from "./PdfJsAnnotationPortals";
import type { AnnotationTool } from "./PdfAnnotationLayer";
import { blankPageInsertArgs, pdfFileUrl } from "./pdfModel";
import { flattenOutline } from "./pdfOutline";
import { installPdfMarginSelection } from "./pdfMarginSelection";
import { SelectionPreservingPdfViewer as PdfJsViewer } from "./SelectionPreservingPdfViewer";
import { shouldLoadPdf, shouldRefit, type Size } from "./pdfViewerPolicy";
import { PdfSidebar } from "./PdfSidebar";
import { PdfToolbar, PdfTools } from "./PdfToolbar";
import { PdfDeleteDialog } from "./PdfDeleteDialog";
import type { OutlineNode, PageInfo, ZoomMode } from "./types";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfViewerProps {
  path: string;
  docId: string;
  active: boolean;
}

interface FindRequest {
  query: string;
  type: "" | "again";
  caseSensitive: boolean;
  entireWord: boolean;
  highlightAll: boolean;
  findPrevious: boolean;
  matchDiacritics: boolean;
}

interface FindCountEvent {
  matchesCount?: { current?: number; total?: number };
}

function pdfAssetUrl(directory: string): string {
  return new URL(`${import.meta.env.BASE_URL}pdfjs/${directory}/`, window.location.href).href;
}

async function printPdfDocument(pdfDocument: PDFDocumentProxy): Promise<void> {
  const frame = window.document.createElement("iframe");
  frame.className = "pdf-print-frame";
  frame.setAttribute("aria-hidden", "true");
  window.document.body.append(frame);

  const printDocument = frame.contentDocument;
  const printWindow = frame.contentWindow;
  if (!printDocument || !printWindow) {
    frame.remove();
    throw new Error("print frame is unavailable");
  }

  const objectUrls: string[] = [];
  const cleanup = () => {
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    frame.remove();
  };

  try {
    printDocument.open();
    printDocument.write(
      "<!doctype html><html><head><style>" +
      "@page{margin:0}html,body{margin:0;background:#fff}" +
      ".page{break-after:page;display:flex;justify-content:center}" +
      "img{display:block;max-width:100%;width:100%;height:auto}" +
      "</style></head><body></body></html>",
    );
    printDocument.close();

    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 150 / 72 });
      const canvas = window.document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      await page.render({ canvas, viewport, background: "#ffffff" }).promise;

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error("encode print page")), "image/png");
      });
      const objectUrl = URL.createObjectURL(blob);
      objectUrls.push(objectUrl);
      const wrapper = printDocument.createElement("div");
      wrapper.className = "page";
      const image = printDocument.createElement("img");
      image.src = objectUrl;
      image.alt = `Page ${pageNumber}`;
      wrapper.append(image);
      printDocument.body.append(wrapper);
    }

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    printWindow.addEventListener("afterprint", cleanup, { once: true });
    printWindow.focus();
    printWindow.print();
    window.setTimeout(cleanup, 60_000);
  } catch (error) {
    cleanup();
    throw error;
  }
}

export function PdfViewer({ path, docId, active }: PdfViewerProps) {
  const [containerElement, setContainerElement] = useState<HTMLDivElement | null>(null);
  const [viewerElement, setViewerElement] = useState<HTMLDivElement | null>(null);
  const viewerRef = useRef<PdfJsViewer | null>(null);
  const eventBusRef = useRef<EventBus | null>(null);
  const linkServiceRef = useRef<PDFLinkService | null>(null);
  const findControllerRef = useRef<PDFFindController | null>(null);
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const saveInFlightRef = useRef<Promise<void> | null>(null);
  const zoomModeRef = useRef<ZoomMode>("fit-width");
  const findRequestRef = useRef<FindRequest | null>(null);
  const pendingPageRef = useRef<number | null>(null);

  const [viewerGeneration, setViewerGeneration] = useState(0);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [overlayEpoch, setOverlayEpoch] = useState(0);
  // Sticky activation flag: a tab loads only after it has been active once.
  // Initialized from `active` so a tab that mounts active loads exactly once
  // instead of loading, tearing down, and reloading under StrictMode.
  const [hasActivated, setHasActivated] = useState(() => active);
  // Last measured container size, used to suppress no-op ResizeObserver work.
  const lastSizeRef = useRef<Size>({ width: 0, height: 0 });
  const activeRef = useRef(active);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageToDelete, setPageToDelete] = useState<number | null>(null);
  const [scale, setScale] = useState(1);
  const [zoomMode, setZoomMode] = useState<ZoomMode>("fit-width");
  const [sidebarMode, setSidebarMode] = useState<"thumbnails" | "outline" | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(168);
  const [outline, setOutline] = useState<{ node: OutlineNode; depth: number }[]>([]);
  const [searchHits, setSearchHits] = useState(0);
  const [searchIdx, setSearchIdx] = useState(0);
  const [searching, setSearching] = useState(false);
  const [annotTool, setAnnotTool] = useState<AnnotationTool>("select");
  const [annotationsByPage, setAnnotationsByPage] = useState<Record<number, PdfAnnotation[]>>({});
  const [pageInfos, setPageInfos] = useState<Record<number, PageInfo>>({});
  const [localDirty, setLocalDirty] = useState(false);

  const documentsById = useWorkspace((state) => state.documentsById);
  const workspaceDocument = useMemo(
    () => Object.values(documentsById).find((candidate) => candidate.path === path),
    [documentsById, path],
  );
  // Workspace revision changes for every annotation. Structural reloads are
  // explicit so a completed annotation never tears down the whole PDF.js view.
  const sourceRevision = reloadVersion;
  const dirty = localDirty || Boolean(workspaceDocument?.dirty);

  const resizeSidebar = useCallback((width: number) => {
    setSidebarWidth(Math.max(168, Math.min(560, Math.round(width))));
  }, []);

  useEffect(() => {
    zoomModeRef.current = zoomMode;
  }, [zoomMode]);

  useEffect(() => {
    activeRef.current = active;
    if (active) setHasActivated(true);
  }, [active]);

  useEffect(() => {
    if (!containerElement || !active) return;
    return installPdfMarginSelection(containerElement);
  }, [containerElement, active]);

  useEffect(() => {
    setLocalDirty(false);
    setAnnotationsByPage({});
    setPageInfos({});
    setCurrentPage(1);
    setZoomMode("fit-width");
    setSearchHits(0);
    setSearchIdx(0);
    findRequestRef.current = null;
  }, [path]);

  useEffect(() => {
    if (!containerElement || !viewerElement) return;

    const eventBus = new EventBus();
    const linkService = new PDFLinkService({
      eventBus,
      externalLinkTarget: LinkTarget.BLANK,
      ignoreDestinationZoom: false,
    });
    const findController = new PDFFindController({
      eventBus,
      linkService,
      updateMatchesCountOnProgress: true,
    });
    const viewer = new PdfJsViewer({
      container: containerElement,
      viewer: viewerElement,
      eventBus,
      linkService,
      findController,
      annotationMode: AnnotationMode.ENABLE_FORMS,
      imageResourcesPath: pdfAssetUrl("images"),
      supportsPinchToZoom: true,
      maxCanvasPixels: 32 * 1024 * 1024,
    });
    linkService.setViewer(viewer);

    viewerRef.current = viewer;
    eventBusRef.current = eventBus;
    linkServiceRef.current = linkService;
    findControllerRef.current = findController;

    const onPagesInit = () => {
      setTotalPages(viewer.pagesCount);
      viewer.currentScaleValue = zoomModeRef.current === "fit-page" ? "page-fit" : "page-width";
      if (pendingPageRef.current != null) {
        const target = Math.max(1, Math.min(pendingPageRef.current, viewer.pagesCount));
        pendingPageRef.current = null;
        viewer.currentPageNumber = target;
        setCurrentPage(target);
      }
      setOverlayEpoch((value) => value + 1);
    };
    const onPageChanging = (event: unknown) => {
      const pageNumber = Number((event as { pageNumber?: number }).pageNumber);
      if (Number.isFinite(pageNumber)) setCurrentPage(pageNumber);
    };
    const onScaleChanging = (event: unknown) => {
      const detail = event as { scale?: number; presetValue?: string };
      if (typeof detail.scale === "number" && Number.isFinite(detail.scale)) {
        setScale(detail.scale);
      }
      if (detail.presetValue === "page-width") setZoomMode("fit-width");
      else if (detail.presetValue === "page-fit") setZoomMode("fit-page");
      else setZoomMode("manual");
      setOverlayEpoch((value) => value + 1);
    };
    const onPageRendered = (event: unknown) => {
      const detail = event as { pageNumber?: number; source?: { pdfPage?: PDFPageProxy } };
      const pageNumber = Number(detail.pageNumber);
      const pdfPage = detail.source?.pdfPage;
      if (Number.isInteger(pageNumber) && pageNumber > 0 && pdfPage) {
        const viewport = pdfPage.getViewport({ scale: 1 });
        const transform = viewport.transform;
        const next: PageInfo = {
          pageNumber,
          w1: viewport.width,
          h1: viewport.height,
          rotation: viewport.rotation,
          transform: [
            transform[0],
            transform[1],
            transform[2],
            transform[3],
            transform[4],
            transform[5],
          ],
        };
        setPageInfos((current) => {
          const previous = current[pageNumber];
          if (
            previous &&
            previous.w1 === next.w1 &&
            previous.h1 === next.h1 &&
            previous.rotation === next.rotation &&
            previous.transform.every((value, index) => value === next.transform[index])
          ) {
            return current;
          }
          return { ...current, [pageNumber]: next };
        });
      }
      setOverlayEpoch((value) => value + 1);
    };
    const onMatchesCount = (event: unknown) => {
      const count = (event as FindCountEvent).matchesCount;
      setSearchHits(count?.total ?? 0);
      setSearchIdx(Math.max(0, (count?.current ?? 1) - 1));
    };
    const onFindState = (event: unknown) => {
      const detail = event as FindCountEvent & { state?: number };
      setSearching(detail.state === FindState.PENDING);
      const count = detail.matchesCount;
      if (count) {
        setSearchHits(count.total ?? 0);
        setSearchIdx(Math.max(0, (count.current ?? 1) - 1));
      }
    };

    eventBus.on("pagesinit", onPagesInit);
    eventBus.on("pagechanging", onPageChanging);
    eventBus.on("scalechanging", onScaleChanging);
    eventBus.on("pagerendered", onPageRendered);
    eventBus.on("updatefindmatchescount", onMatchesCount);
    eventBus.on("updatefindcontrolstate", onFindState);
    setViewerGeneration((value) => value + 1);

    return () => {
      eventBus.off("pagesinit", onPagesInit);
      eventBus.off("pagechanging", onPageChanging);
      eventBus.off("scalechanging", onScaleChanging);
      eventBus.off("pagerendered", onPageRendered);
      eventBus.off("updatefindmatchescount", onMatchesCount);
      eventBus.off("updatefindcontrolstate", onFindState);
      viewer.disposeSelectionPreservation();
      viewer.cleanup();
      if (viewerRef.current === viewer) {
        viewerRef.current = null;
        eventBusRef.current = null;
        linkServiceRef.current = null;
        findControllerRef.current = null;
      }
    };
  }, [containerElement, viewerElement]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const linkService = linkServiceRef.current;
    const findController = findControllerRef.current;
    if (!viewer || !linkService || !findController || viewerGeneration === 0) return;

    // A tab that has never been active must not start getDocument. Once it has
    // been active it stays loaded while inactive; toggling `active` does not
    // appear in the dependency array, so switching away/back never reloads.
    if (!shouldLoadPdf(active, hasActivated)) {
      setLoading(false);
      return;
    }

    let disposed = false;
    setLoading(true);
    setLoadError(null);
    setPdfDocument(null);
    setPageInfos({});
    setOutline([]);
    setSearchHits(0);
    setSearchIdx(0);
    setSearching(false);

    const loadingTask = getDocument({
      url: pdfFileUrl(path, sourceRevision),
      cMapUrl: pdfAssetUrl("cmaps"),
      cMapPacked: true,
      iccUrl: pdfAssetUrl("iccs"),
      standardFontDataUrl: pdfAssetUrl("standard_fonts"),
      wasmUrl: pdfAssetUrl("wasm"),
      enableXfa: true,
      disableStream: true,
      disableAutoFetch: false,
      rangeChunkSize: 256 * 1024,
    });
    loadingTaskRef.current = loadingTask;
    loadingTask.onPassword = (updatePassword: (password: string) => void, reason: number) => {
      const label = reason === PasswordResponses.INCORRECT_PASSWORD
        ? "Incorrect password. Enter the PDF password:"
        : "Enter the PDF password:";
      const password = window.prompt(label);
      if (password === null) void loadingTask.destroy();
      else updatePassword(password);
    };

    void loadingTask.promise.then(async (documentProxy) => {
      if (disposed) {
        return;
      }
      linkService.setDocument(documentProxy);
      findController.setDocument(documentProxy);
      viewer.setDocument(documentProxy);
      setPdfDocument(documentProxy);
      setTotalPages(documentProxy.numPages);

      const rawOutline = await documentProxy.getOutline();
      if (!disposed) {
        const nodes = (rawOutline ?? []) as unknown as OutlineNode[];
        setOutline(flattenOutline(nodes));
      }
    }).catch((error: unknown) => {
      if (!disposed) {
        setLoadError(error instanceof Error ? error.message : String(error));
      }
    }).finally(() => {
      if (!disposed) setLoading(false);
    });

    return () => {
      disposed = true;
      if (loadingTaskRef.current === loadingTask) loadingTaskRef.current = null;
      void loadingTask.destroy();
      linkService.setDocument(null);
      findController.setDocument(null as unknown as PDFDocumentProxy);
      viewer.setDocument(null as unknown as PDFDocumentProxy);
    };
  }, [path, sourceRevision, viewerGeneration, hasActivated]);

  useEffect(() => {
    if (!containerElement || viewerGeneration === 0) return;
    // Reset the size baseline whenever a new viewer/container is bound so the
    // first positive observation is treated as a change.
    lastSizeRef.current = { width: 0, height: 0 };
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const viewer = viewerRef.current;
        if (!viewer) return;
        const next: Size = {
          width: containerElement.clientWidth,
          height: containerElement.clientHeight,
        };
        if (!shouldRefit(activeRef.current, lastSizeRef.current, next)) return;
        lastSizeRef.current = next;
        if (zoomModeRef.current === "fit-width") viewer.currentScaleValue = "page-width";
        else if (zoomModeRef.current === "fit-page") viewer.currentScaleValue = "page-fit";
        else viewer.update();
      });
    });
    observer.observe(containerElement);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [containerElement, viewerGeneration]);

  useEffect(() => {
    if (!active) return;
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.update();
    if (zoomMode === "fit-width") viewer.currentScaleValue = "page-width";
    else if (zoomMode === "fit-page") viewer.currentScaleValue = "page-fit";
  }, [active, zoomMode, viewerGeneration]);

  const zoomIn = useCallback(() => {
    setZoomMode("manual");
    viewerRef.current?.increaseScale({ steps: 1, drawingDelay: 180 });
  }, []);

  const zoomOut = useCallback(() => {
    setZoomMode("manual");
    viewerRef.current?.decreaseScale({ steps: 1, drawingDelay: 180 });
  }, []);

  const setFit = useCallback((mode: "fit-width" | "fit-page") => {
    setZoomMode(mode);
    const viewer = viewerRef.current;
    if (viewer) viewer.currentScaleValue = mode === "fit-page" ? "page-fit" : "page-width";
  }, []);

  const scrollToPage = useCallback((pageNumber: number) => {
    const viewer = viewerRef.current;
    if (!viewer || totalPages === 0) return;
    viewer.currentPageNumber = Math.min(Math.max(Math.trunc(pageNumber), 1), totalPages);
  }, [totalPages]);

  const runSearch = useCallback((query: string) => {
    const eventBus = eventBusRef.current;
    if (!eventBus) return;
    const normalized = query.trim();
    if (!normalized) {
      findRequestRef.current = null;
      setSearchHits(0);
      setSearchIdx(0);
      setSearching(false);
      eventBus.dispatch("findbarclose", { source: "reader" });
      return;
    }

    const request: FindRequest = {
      query: normalized,
      type: "",
      caseSensitive: false,
      entireWord: false,
      highlightAll: true,
      findPrevious: false,
      matchDiacritics: false,
    };
    findRequestRef.current = request;
    setSearching(true);
    eventBus.dispatch("find", request);
  }, []);

  const navigateSearch = useCallback((direction: 1 | -1) => {
    const eventBus = eventBusRef.current;
    const previous = findRequestRef.current;
    if (!eventBus || !previous) return;
    const request: FindRequest = {
      ...previous,
      type: "again",
      findPrevious: direction === -1,
    };
    findRequestRef.current = request;
    eventBus.dispatch("find", request);
  }, []);

  const reloadAfterPdfiumWrite = useCallback(() => {
    setLocalDirty(true);
    setReloadVersion((value) => value + 1);
    setOverlayEpoch((value) => value + 1);
  }, []);

  const markAnnotationWrite = useCallback(() => {
    setLocalDirty(true);
    setOverlayEpoch((value) => value + 1);
  }, []);

  const onAnnotationCreated = useCallback((annotation: PdfAnnotation) => {
    setAnnotationsByPage((current) => {
      const pageNumber = annotation.page_index + 1;
      const pageAnnotations = current[pageNumber] ?? [];
      return {
        ...current,
        [pageNumber]: [
          ...pageAnnotations.filter((candidate) => candidate.id !== annotation.id),
          annotation,
        ],
      };
    });
  }, []);

  const onAnnotationsChanged = useCallback((pageNumber: number, deletedId?: string) => {
    if (deletedId) {
      setAnnotationsByPage((current) => ({
        ...current,
        [pageNumber]: (current[pageNumber] ?? []).filter((annotation) => annotation.id !== deletedId),
      }));
    }
    markAnnotationWrite();
  }, [markAnnotationWrite]);

  const mutatePages = useCallback(async (command: string, args: Record<string, unknown>) => {
    try {
      const result = await invoke<unknown>(command, { path, ...args });
      if (command === "insert_blank_page" && typeof result === "number") {
        pendingPageRef.current = result + 1;
      } else if (command === "delete_page") {
        pendingPageRef.current = Math.max(1, Math.min(currentPage, totalPages - 1));
      }
      setAnnotTool("select");
      setAnnotationsByPage({});
      findRequestRef.current = null;
      setSearchHits(0);
      setSearchIdx(0);
      reloadAfterPdfiumWrite();
    } catch (error) {
      window.alert(`PDF operation failed: ${String(error)}`);
    }
  }, [currentPage, path, reloadAfterPdfiumWrite, totalPages]);

  const saveDocument = useCallback((): Promise<void> => {
    if (saveInFlightRef.current) return saveInFlightRef.current;
    const operation = invoke("save_document", { path }).then(() => {
      setLocalDirty(false);
    });
    saveInFlightRef.current = operation;
    void operation.then(
      () => {
        if (saveInFlightRef.current === operation) saveInFlightRef.current = null;
      },
      () => {
        if (saveInFlightRef.current === operation) saveInFlightRef.current = null;
      },
    );
    return operation;
  }, [path]);

  const discardDocument = useCallback(async () => {
    await saveInFlightRef.current?.catch(() => {});
    await invoke("discard_pdf_changes", { path });
    setLocalDirty(false);
    setAnnotationsByPage({});
    pendingPageRef.current = currentPage;
    setReloadVersion((value) => value + 1);
    setOverlayEpoch((value) => value + 1);
  }, [currentPage, path]);

  useEffect(
    () => registerDocumentLifecycle(docId, { save: saveDocument, discard: discardDocument }),
    [docId, saveDocument, discardDocument],
  );

  const saveFromViewer = useCallback(() => {
    void saveDocument().catch((error: unknown) => {
      window.alert(`Save failed: ${String(error)}`);
    });
  }, [saveDocument]);

  const printDocument = useCallback(() => {
    if (!pdfDocument) return;
    void printPdfDocument(pdfDocument).catch((error: unknown) => {
      window.alert(`Print failed: ${String(error)}`);
    });
  }, [pdfDocument]);

  const activateOutline = useCallback((node: OutlineNode) => {
    if (node.dest) {
      void linkServiceRef.current?.goToDestination(node.dest);
    } else if (node.url) {
      void openUrl(node.url).catch((error: unknown) => {
        console.error("open PDF outline URL", error);
      });
    }
  }, []);

  useEffect(() => {
    if (!active || !containerElement) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const viewer = viewerRef.current;
      if (!viewer) return;
      setZoomMode("manual");
      viewer.updateScale({
        scaleFactor: Math.exp(-event.deltaY * 0.002),
        drawingDelay: 180,
        origin: [event.clientX, event.clientY],
      });
    };
    containerElement.addEventListener("wheel", onWheel, { passive: false });
    return () => containerElement.removeEventListener("wheel", onWheel);
  }, [active, containerElement]);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && (event.key === "+" || event.key === "=")) {
        event.preventDefault();
        zoomIn();
      } else if (modifier && event.key === "-") {
        event.preventDefault();
        zoomOut();
      } else if (modifier && event.key === "0") {
        event.preventDefault();
        setFit("fit-width");
      } else if (modifier && event.key.toLowerCase() === "f") {
        event.preventDefault();
        window.document.querySelector<HTMLInputElement>(".pdf-search-input")?.focus();
      } else if (modifier && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveFromViewer();
      } else if (modifier && event.key.toLowerCase() === "p") {
        event.preventDefault();
        printDocument();
      } else if (event.key === "Escape") {
        setAnnotTool("select");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, printDocument, saveFromViewer, setFit, zoomIn, zoomOut]);

  useEffect(() => {
    if (!containerElement) return;
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) return;
      const url = anchor.href;
      if (!/^https?:|^mailto:/i.test(url)) return;
      event.preventDefault();
      void openUrl(url).catch((error: unknown) => console.error("open PDF link", error));
    };
    containerElement.addEventListener("click", onClick);
    return () => containerElement.removeEventListener("click", onClick);
  }, [containerElement]);

  const visibleError = loadError;

  return (
    <div className="pdf-root pdfjs-root">
      <PdfToolbar
        currentPage={currentPage}
        totalPages={totalPages}
        scale={scale}
        zoomMode={zoomMode}
        sidebarMode={sidebarMode}
        hasOutline={outline.length > 0}
        searchHits={searchHits}
        searchIdx={searchIdx}
        searching={searching}
        dirty={dirty}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onFit={setFit}
        onSidebarToggle={(mode) => setSidebarMode((current) => current === mode ? null : mode)}
        onSearch={runSearch}
        onSearchNav={navigateSearch}
        onPrint={printDocument}
        onJumpPage={scrollToPage}
        onSave={saveFromViewer}
      />
      <div className="pdf-body">
        {sidebarMode && (
          <PdfSidebar
            mode={sidebarMode}
            pdfDocument={pdfDocument}
            totalPages={totalPages}
            outline={outline}
             currentPage={currentPage}
             width={sidebarWidth}
             onWidthChange={resizeSidebar}
             onOutlineClick={activateOutline}
            onThumbClick={scrollToPage}
          />
        )}
        <div className="pdf-stage">
          <div className="pdf-scroll pdfjs-viewer-container" ref={setContainerElement}>
            <div className="pdfViewer" ref={setViewerElement} />
          </div>
          {loading && !visibleError && (
            <div className="pdf-loading-overlay">Loading PDF…</div>
          )}
          {visibleError && (
            <div className="pdf-error-overlay" role="alert">
              <strong>Unable to open PDF</strong>
              <span>{visibleError}</span>
            </div>
          )}
        </div>
        <PdfTools annotTool={annotTool} canDelete={totalPages > 1}
          onAnnotTool={setAnnotTool}
          onInsertBlankBefore={() => {
            void mutatePages("insert_blank_page", blankPageInsertArgs(currentPage, "before"));
          }}
          onInsertBlankAfter={() => {
            void mutatePages("insert_blank_page", blankPageInsertArgs(currentPage, "after"));
          }}
          onDeletePage={() => { if (totalPages > 1) setPageToDelete(currentPage); }}
        />
      </div>
      {pageToDelete !== null && <PdfDeleteDialog pageNumber={pageToDelete}
        onCancel={() => setPageToDelete(null)}
        onConfirm={() => {
          setPageToDelete(null);
          if (totalPages > 1 && pageToDelete <= totalPages) {
            void mutatePages("delete_page", { index: pageToDelete - 1 });
          }
        }} />}
      <PdfJsAnnotationPortals
        viewerElement={viewerElement}
        epoch={overlayEpoch}
        path={path}
        pageInfos={pageInfos}
        annotationsByPage={annotationsByPage}
        tool={annotTool}
        active={active}
        onAnnotationsChanged={onAnnotationsChanged}
        onAnnotationCreated={onAnnotationCreated}
      />
    </div>
  );
}
