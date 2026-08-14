import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

import type { OutlineNode, PageInfo } from "./types";

interface PdfSidebarProps {
  mode: "thumbnails" | "outline";
  doc: PDFDocumentProxy;
  pageInfos: PageInfo[];
  outline: { node: OutlineNode; depth: number }[];
  currentPage: number;
  onOutlineClick: (node: OutlineNode) => void;
  onThumbClick: (pageNumber: number) => void;
}

export function PdfSidebar(props: PdfSidebarProps) {
  if (props.mode === "outline") {
    return <OutlineList outline={props.outline} onClick={props.onOutlineClick} />;
  }
  return (
    <ThumbnailList
      doc={props.doc}
      pageInfos={props.pageInfos}
      currentPage={props.currentPage}
      onThumbClick={props.onThumbClick}
    />
  );
}

function ThumbnailList({
  doc,
  pageInfos,
  currentPage,
  onThumbClick,
}: {
  doc: PDFDocumentProxy;
  pageInfos: PageInfo[];
  currentPage: number;
  onThumbClick: (n: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState<Set<number>>(new Set());

  // Lazy-render thumbnails that intersect the sidebar viewport (§9, §27).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        setVisible((prev) => {
          const next = new Set(prev);
          for (const e of entries) {
            const n = Number((e.target as HTMLElement).dataset.pageNumber);
            if (!n) continue;
            if (e.isIntersecting) next.add(n);
          }
          return next;
        });
      },
      { root: el, rootMargin: "200px" },
    );
    el.querySelectorAll<HTMLElement>(".thumb-item").forEach((n) => obs.observe(n));
    return () => obs.disconnect();
  }, [pageInfos]);

  return (
    <div className="pdf-sidebar pdf-sidebar-thumbs" ref={containerRef}>
      {pageInfos.map((p) => (
        <Thumbnail
          key={p.pageNumber}
          doc={doc}
          info={p}
          active={p.pageNumber === currentPage}
          visible={visible.has(p.pageNumber)}
          onClick={() => onThumbClick(p.pageNumber)}
        />
      ))}
    </div>
  );
}

function Thumbnail({
  doc,
  info,
  active,
  visible,
  onClick,
}: {
  doc: PDFDocumentProxy;
  info: PageInfo;
  active: boolean;
  visible: boolean;
  onClick: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!visible || done) return;
    let cancelled = false;
    (async () => {
      try {
        const page = await doc.getPage(info.pageNumber);
        if (cancelled) return;
        const thumbWidth = 130;
        const scale = thumbWidth / info.w1;
        const vp = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
        if (!cancelled) setDone(true);
      } catch {
        /* ignore cancelled renders */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, info, visible, done]);

  return (
    <button
      className={"thumb-item" + (active ? " thumb-active" : "")}
      data-page-number={info.pageNumber}
      onClick={onClick}
      title={`page ${info.pageNumber}`}
    >
      <div className="thumb-canvas-wrap" style={{ aspectRatio: `${info.w1} / ${info.h1}` }}>
        <canvas ref={canvasRef} className="thumb-canvas" />
        {!done && <div className="thumb-placeholder" />}
      </div>
      <span className="thumb-label">{info.pageNumber}</span>
    </button>
  );
}

function OutlineList({
  outline,
  onClick,
}: {
  outline: { node: OutlineNode; depth: number }[];
  onClick: (node: OutlineNode) => void;
}) {
  if (outline.length === 0) {
    return <div className="pdf-sidebar pdf-sidebar-empty">No outline.</div>;
  }
  return (
    <div className="pdf-sidebar pdf-sidebar-outline">
      {outline.map((entry, i) => (
        <button
          key={i}
          className="outline-item"
          style={{ paddingLeft: 8 + entry.depth * 14 }}
          onClick={() => onClick(entry.node)}
          title={entry.node.title}
        >
          {entry.node.title}
        </button>
      ))}
    </div>
  );
}
