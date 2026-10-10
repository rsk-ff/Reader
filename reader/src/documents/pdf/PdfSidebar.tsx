import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

import type { OutlineNode } from "./types";
import { SidebarResizer } from "../../components/SidebarResizer";

interface PdfSidebarProps {
  mode: "thumbnails" | "outline";
  pdfDocument: PDFDocumentProxy | null;
  totalPages: number;
  outline: { node: OutlineNode; depth: number }[];
  currentPage: number;
  onOutlineClick: (node: OutlineNode) => void;
  onThumbClick: (pageNumber: number) => void;
  width: number;
  onWidthChange: (width: number) => void;
  onCollapse: (restoreWidth: number) => void;
}

export function PdfSidebar(props: PdfSidebarProps) {
  const content = props.mode === "outline" ? (
    <OutlineList outline={props.outline} onClick={props.onOutlineClick} />
  ) : (
    <div className="pdf-sidebar pdf-thumbnails" aria-label="Page thumbnails">
      {Array.from({ length: props.totalPages }, (_, index) => {
        const pageNumber = index + 1;
        return (
          <PdfThumbnail
            key={pageNumber}
            pdfDocument={props.pdfDocument}
            pageNumber={pageNumber}
            active={pageNumber === props.currentPage}
            onClick={() => props.onThumbClick(pageNumber)}
          />
        );
      })}
    </div>
  );

  return (
    <aside className="pdf-sidebar-shell" style={{ width: props.width }}>
      <header className="pdf-sidebar-title">{props.mode === "outline" ? "文档目录" : "页面缩略图"}<span>{props.mode === "outline" ? props.outline.length : props.totalPages}</span></header>
      {content}
      <SidebarResizer kind="pdf" label="Resize PDF sidebar" width={props.width}
        onWidthChange={props.onWidthChange} onCollapse={props.onCollapse} />
    </aside>
  );
}

function PdfThumbnail({ pdfDocument, pageNumber, active, onClick }: {
  pdfDocument: PDFDocumentProxy | null;
  pageNumber: number;
  active: boolean;
  onClick: () => void;
}) {
  const itemRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    const item = itemRef.current;
    if (!item) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
      },
      { root: item.closest(".pdf-thumbnails"), rootMargin: "320px 0px" },
    );
    observer.observe(item);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (active) itemRef.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  useEffect(() => {
    setRendered(false);
    if (!visible || !pdfDocument || !canvasRef.current) return;

    let cancelled = false;
    let renderTask: RenderTask | null = null;
    void (async () => {
      const page = await pdfDocument.getPage(pageNumber);
      if (cancelled || !canvasRef.current) return;

      const base = page.getViewport({ scale: 1 });
      const cssScale = 138 / Math.max(base.width, 1);
      const outputScale = Math.min(window.devicePixelRatio || 1, 2);
      const cssViewport = page.getViewport({ scale: cssScale });
      const renderViewport = page.getViewport({ scale: cssScale * outputScale });
      const canvas = canvasRef.current;
      canvas.width = Math.max(1, Math.floor(renderViewport.width));
      canvas.height = Math.max(1, Math.floor(renderViewport.height));
      canvas.style.width = `${Math.floor(cssViewport.width)}px`;
      canvas.style.height = `${Math.floor(cssViewport.height)}px`;

      renderTask = page.render({ canvas, viewport: renderViewport });
      await renderTask.promise;
      if (!cancelled) setRendered(true);
    })().catch((error: unknown) => {
      if (!cancelled && !(error instanceof Error && error.name === "RenderingCancelledException")) {
        console.error(`thumbnail ${pageNumber} failed`, error);
      }
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdfDocument, pageNumber, visible]);

  return (
    <button
      ref={itemRef}
      type="button"
      className={`thumb-item${active ? " active" : ""}`}
      onClick={onClick}
      aria-label={`Go to page ${pageNumber}`}
      aria-current={active ? "page" : undefined}
    >
      <div className="thumb-canvas-wrap">
        <canvas ref={canvasRef} className={`thumb-canvas${rendered ? " rendered" : ""}`} />
        {!rendered && <div className="thumb-placeholder" />}
      </div>
      <span className="thumb-label">{pageNumber}</span>
    </button>
  );
}

function OutlineList({ outline, onClick }: {
  outline: { node: OutlineNode; depth: number }[];
  onClick: (node: OutlineNode) => void;
}) {
  return (
    <div className="pdf-sidebar pdf-outline" aria-label="Document outline">
      {outline.length === 0 ? (
        <div className="pdf-sidebar-empty">此文档没有目录</div>
      ) : outline.map(({ node, depth }, index) => (
        <button
          type="button"
          key={`${node.title}-${index}`}
          className="outline-item"
          style={{ paddingLeft: 10 + depth * 14 }}
          onClick={() => onClick(node)}
          title={node.title}
        >
          {node.title}
        </button>
      ))}
    </div>
  );
}
