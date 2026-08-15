import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnnotationOverlay } from "./PdfAnnotationLayer";
import type { AnnotationTool } from "./PdfAnnotationLayer";
import type { PdfAnnotation } from "./annotation-types";

interface TextSeg {
  text: string;
  left: number;
  bottom: number;
  right: number;
  top: number;
}

interface PdfPageProps {
  path: string;
  pageNumber: number;
  w1: number;
  h1: number;
  scale: number;
  active: boolean;
  searchQuery: string | null;
  annotations: PdfAnnotation[];
  annotTool: AnnotationTool;
  onAnnotationsChanged: (pageNumber: number) => void;
  onAnnotationCreated: (ann: PdfAnnotation) => void;
  onVisible?: (pageNumber: number, ratio: number) => void;
}

/**
 * Renders one PDF page: PDFium rasterizes to PNG (via Rust), displayed as an
 * <img>. A transparent text layer (PDFium text segments with coordinates)
 * sits on top for selection + search highlight. Annotations via SVG overlay.
 *
 * Only renders when `active` (within the visible buffer); far pages are spacers.
 */
export function PdfPage(props: PdfPageProps) {
  const { path, pageNumber, w1, h1, scale, active, searchQuery, annotations,
          annotTool, onAnnotationsChanged, onAnnotationCreated, onVisible } = props;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [pngUrl, setPngUrl] = useState<string | null>(null);
  const [segs, setSegs] = useState<TextSeg[]>([]);

  const cssW = Math.round(w1 * scale);
  const cssH = Math.round(h1 * scale);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let url: string | null = null;
    (async () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      try {
        const bytes = await invoke<ArrayBuffer | Uint8Array>("render_page", {
          path, pageIndex: pageNumber - 1, scale: scale * dpr,
        });
        if (cancelled) return;
        const blob = new Blob(
          [bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)],
          { type: "image/png" },
        );
        url = URL.createObjectURL(blob);
        setPngUrl(url);
      } catch (e) {
        console.warn(`page ${pageNumber} render failed`, e);
      }
      if (segs.length === 0) {
        try {
          const s = await invoke<TextSeg[]>("get_page_text", {
            path, pageIndex: pageNumber - 1,
          });
          if (!cancelled) setSegs(s);
        } catch { /* ignore */ }
      }
    })();
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, pageNumber, scale, active]);

  useEffect(() => {
    if (!active || !onVisible || !wrapperRef.current) return;
    const el = wrapperRef.current;
    const root = el.closest(".pdf-scroll") as Element | null;
    const obs = new IntersectionObserver(
      (es) => { for (const e of es) if (e.isIntersecting) onVisible(pageNumber, e.intersectionRatio); },
      { root, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [active, onVisible, pageNumber]);

  const q = searchQuery?.toLowerCase() ?? "";

  return (
    <div ref={wrapperRef} className="pdf-page-wrapper" data-page-number={pageNumber} style={{ width: cssW, height: cssH }}>
      <div className="pdf-page-shadow" style={{ width: cssW, height: cssH }}>
        {!pngUrl && <div className="pdf-page-placeholder">page {pageNumber}</div>}
        {pngUrl && <img src={pngUrl} className="pdf-page-img" width={cssW} height={cssH} alt={`page ${pageNumber}`} />}
        <div className="pdf-text-layer">
          {segs.map((seg, i) => {
            const left = seg.left * scale;
            const top = (h1 - seg.top) * scale;
            const w = (seg.right - seg.left) * scale;
            const h = (seg.top - seg.bottom) * scale;
            const hit = !!q && seg.text.toLowerCase().includes(q);
            return (
              <span key={i} className={"pdf-text-span" + (hit ? " pdf-text-hit" : "")}
                style={{ left, top, width: w, height: h, position: "absolute" }}>
                {seg.text}
              </span>
            );
          })}
        </div>
        <AnnotationOverlay
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
