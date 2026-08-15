import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PageInfo } from "./types";
import type { OutlineNode } from "./types";

interface PdfSidebarProps {
  mode: "thumbnails" | "outline";
  path: string;
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
      path={props.path}
      pageInfos={props.pageInfos}
      currentPage={props.currentPage}
      onThumbClick={props.onThumbClick}
    />
  );
}

function ThumbnailList({ path, pageInfos, currentPage, onThumbClick }: {
  path: string;
  pageInfos: PageInfo[];
  currentPage: number;
  onThumbClick: (n: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState<Set<number>>(new Set());

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      setVisible(prev => {
        const next = new Set(prev);
        for (const e of entries) {
          const n = Number((e.target as HTMLElement).dataset.pageNumber);
          if (n && e.isIntersecting) next.add(n);
        }
        return next;
      });
    }, { root: el, rootMargin: "200px" });
    el.querySelectorAll<HTMLElement>(".thumb-item").forEach(n => obs.observe(n));
    return () => obs.disconnect();
  }, [pageInfos]);

  return (
    <div className="pdf-sidebar pdf-sidebar-thumbs" ref={containerRef}>
      {pageInfos.map(p => (
        <Thumbnail key={p.pageNumber} path={path} info={p} active={p.pageNumber === currentPage} visible={visible.has(p.pageNumber)} onClick={() => onThumbClick(p.pageNumber)} />
      ))}
    </div>
  );
}

function Thumbnail({ path, info, active, visible, onClick }: {
  path: string; info: PageInfo; active: boolean; visible: boolean; onClick: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!visible || done) return;
    let cancelled = false;
    let url: string | null = null;
    (async () => {
      try {
        const scale = 130 / info.w1;
        const bytes = await invoke<ArrayBuffer | Uint8Array>("render_page", { path, pageIndex: info.pageNumber - 1, scale });
        if (cancelled) return;
        const blob = new Blob([bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)], { type: "image/png" });
        url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          const canvas = canvasRef.current;
          if (canvas && !cancelled) {
            canvas.width = img.width; canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            if (ctx) { ctx.drawImage(img, 0, 0); setDone(true); }
          }
        };
        img.src = url;
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [path, info, visible, done]);

  return (
    <button className={"thumb-item" + (active ? " thumb-active" : "")} data-page-number={info.pageNumber} onClick={onClick} title={`page ${info.pageNumber}`}>
      <div className="thumb-canvas-wrap" style={{ aspectRatio: `${info.w1} / ${info.h1}` }}>
        <canvas ref={canvasRef} className="thumb-canvas" />
        {!done && <div className="thumb-placeholder" />}
      </div>
      <span className="thumb-label">{info.pageNumber}</span>
    </button>
  );
}

function OutlineList({ outline, onClick }: { outline: { node: OutlineNode; depth: number }[]; onClick: (n: OutlineNode) => void }) {
  if (outline.length === 0) return <div className="pdf-sidebar pdf-sidebar-empty">No outline.</div>;
  return (
    <div className="pdf-sidebar pdf-sidebar-outline">
      {outline.map((entry, i) => (
        <button key={i} className="outline-item" style={{ paddingLeft: 8 + entry.depth * 14 }} onClick={() => onClick(entry.node)} title={entry.node.title}>{entry.node.title}</button>
      ))}
    </div>
  );
}
