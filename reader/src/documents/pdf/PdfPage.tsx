import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, PDFPageProxy, PageViewport, RenderTask } from "pdfjs-dist";
import { TextLayer } from "pdfjs-dist";
import { AnnotationOverlay } from "./PdfAnnotationLayer";
import type { AnnotationTool } from "./PdfAnnotationLayer";
import type { PdfAnnotation } from "./annotation-types";

interface PdfPageProps {
  doc: PDFDocumentProxy;
  /** file path (for annotation commands) */
  path: string;
  pageNumber: number;
  /** unscaled width (scale=1) */
  w1: number;
  /** unscaled height (scale=1) */
  h1: number;
  scale: number;
  /** true when this page is within the render buffer (visible ± N) */
  active: boolean;
  /** search highlight term (lowercased) or null */
  searchQuery: string | null;
  /** annotations for this page */
  annotations: PdfAnnotation[];
  /** active annotation tool */
  annotTool: AnnotationTool;
  onAnnotationsChanged: (pageNumber: number) => void;
  onAnnotationCreated: (ann: PdfAnnotation) => void;
  /** called when the page becomes visible (for current-page tracking) */
  onVisible?: (pageNumber: number, ratio: number) => void;
}

/**
 * Renders a single PDF page: a high-DPI canvas + a pdfjs TextLayer for selection
 * and search. When `active` is false the last bitmap is kept as a snapshot and
 * the space is reserved so scroll position stays stable (§9, §27).
 */
export function PdfPage({
  doc,
  path,
  pageNumber,
  w1,
  h1,
  scale,
  active,
  searchQuery,
  annotations,
  annotTool,
  onAnnotationsChanged,
  onAnnotationCreated,
  onVisible,
}: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const textLayerRef = useRef<TextLayer | null>(null);
  const pageRef = useRef<PDFPageProxy | null>(null);
  const [rendered, setRendered] = useState(false);

  const cssWidth = Math.round(w1 * scale);
  const cssHeight = Math.round(h1 * scale);

  // Render canvas + text layer when active and inputs change.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    async function render() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        // getPage caches the proxy internally; cheap to call repeatedly.
        const page = pageRef.current ?? (await doc.getPage(pageNumber));
        if (cancelled) return;
        pageRef.current = page;

        const viewport: PageViewport = page.getViewport({ scale });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) return;

        // Cancel any in-flight render before starting a new one.
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
          renderTaskRef.current = null;
        }
        const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined;
        const task = page.render({
          canvas,
          canvasContext: ctx,
          viewport,
          transform,
        });
        renderTaskRef.current = task;
        await task.promise;
        if (cancelled) return;
        setRendered(true);

        // Text layer for selection + search.
        if (textRef.current) {
          if (textLayerRef.current) {
            textLayerRef.current.cancel();
            textLayerRef.current = null;
          }
          textRef.current.innerHTML = "";
          const textContent = await page.getTextContent();
          if (cancelled) return;
          const tl = new TextLayer({
            textContentSource: textContent,
            container: textRef.current,
            viewport,
          });
          textLayerRef.current = tl;
          await tl.render();
          if (cancelled) return;
          applySearchHighlight();
        }
      } catch (e) {
        // RenderingCancelledException is expected on rapid scroll/zoom.
        const name = (e as { name?: string })?.name;
        if (name !== "RenderingCancelledException") {
          // eslint-disable-next-line no-console
          console.warn(`page ${pageNumber} render failed:`, e);
        }
      }
    }

    void render();
    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
      if (textLayerRef.current) {
        textLayerRef.current.cancel();
        textLayerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, pageNumber, scale, active]);

  // Re-apply search highlight without re-rendering the canvas/text layer.
  useEffect(() => {
    applySearchHighlight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, rendered]);

  function applySearchHighlight() {
    const container = textRef.current;
    if (!container) return;
    const spans = container.querySelectorAll<HTMLElement>("span[role=presentation]");
    if (!searchQuery) {
      spans.forEach((s) => s.classList.remove("search-hit"));
      return;
    }
    spans.forEach((s) => {
      if (s.textContent && s.textContent.toLowerCase().includes(searchQuery)) {
        s.classList.add("search-hit");
      } else {
        s.classList.remove("search-hit");
      }
    });
  }

  // Visibility reporting for current-page tracking.
  useEffect(() => {
    if (!active || !onVisible || !wrapperRef.current) return;
    const el = wrapperRef.current;
    const root = el.closest(".pdf-scroll") as Element | null;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) onVisible(pageNumber, e.intersectionRatio);
        }
      },
      { root, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [active, onVisible, pageNumber]);

  return (
    <div
      ref={wrapperRef}
      className="pdf-page-wrapper"
      data-page-number={pageNumber}
      style={{ width: cssWidth, height: cssHeight }}
    >
      <div className="pdf-page-shadow" style={{ width: cssWidth, height: cssHeight }}>
        {!rendered && <div className="pdf-page-placeholder">page {pageNumber}</div>}
        <canvas ref={canvasRef} className="pdf-canvas" />
        <div ref={textRef} className="pdf-text-layer" />
        <AnnotationOverlay
          doc={doc}
          path={path}
          pageNumber={pageNumber}
          geom={{ w1, h1, scale }}
          annotations={annotations}
          tool={annotTool}
          onAnnotationsChanged={onAnnotationsChanged}
          onAnnotationCreated={onAnnotationCreated}
        />
      </div>
    </div>
  );
}
