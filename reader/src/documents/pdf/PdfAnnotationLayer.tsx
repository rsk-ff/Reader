import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

import { pageCssSize, pdfToScreen, quadsBounds, rectToQuad, screenToPdf } from "./coordinates";
import type { PageGeom, Point, Quad } from "./coordinates";
import type { PdfAnnotation } from "./annotation-types";

interface AnnotationOverlayProps {
  doc?: unknown;
  path: string;
  pageNumber: number;
  geom: PageGeom;
  annotations: PdfAnnotation[];
  /** current tool: null = select; otherwise create mode */
  tool: AnnotationTool;
  onAnnotationsChanged: (pageNumber: number) => void;
  onAnnotationCreated: (ann: PdfAnnotation) => void;
}

export type AnnotationTool =
  | "select"
  | "highlight"
  | "underline"
  | "strikeout"
  | "note"
  | "freetext"
  | "ink";

/**
 * SVG/DOM overlay sitting above the PDF.js canvas + text layer (§5). Existing
 * annotations render here; new ones are captured via selection (text markup)
 * or pointer drawing (ink / note / freetext) and written through the Rust
 * `create_annotation` command.
 */
export function AnnotationOverlay(props: AnnotationOverlayProps) {
  const { doc, path, pageNumber, geom, annotations, tool, onAnnotationsChanged, onAnnotationCreated } = props;
  const svgRef = useRef<SVGSVGElement>(null);

  const { w: cssW, h: cssH } = pageCssSize(geom);

  // Highlight creation: when a text-markup tool is active, listen for selection
  // changes inside the sibling text layer and convert the range to quads.
  useEffect(() => {
    if (tool !== "highlight" && tool !== "underline" && tool !== "strikeout") return;
    const root = svgRef.current?.parentElement;
    if (!root) return;

    const onMouseUp = async () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      const range = sel.getRangeAt(0);
      const pageEl = root.querySelector(".pdf-page-shadow") as HTMLElement | null;
      if (!pageEl) return;
      const pageRect = pageEl.getBoundingClientRect();
      const clientRects = range.getClientRects();
      const quads: Quad[] = [];
      for (let i = 0; i < clientRects.length; i++) {
        const r = clientRects[i];
        quads.push(
          rectToQuad(
            geom,
            r.left - pageRect.left,
            r.top - pageRect.top,
            r.right - pageRect.left,
            r.bottom - pageRect.top,
          ),
        );
      }
      sel.removeAllRanges();
      if (quads.length === 0) return;
      const bounds = quadsBounds(quads)!;
      const ann: PdfAnnotation = {
        id: `page:${pageNumber}:new:${Date.now()}`,
        page_index: pageNumber,
        annotation_type: tool,
        rect: { left: bounds.left, right: bounds.right, bottom: bounds.bottom, top: bounds.top },
        quad_points: quads,
        ink_paths: [],
        color: defaultColor(tool),
        opacity: 0.4,
        text: null,
        created_at: null,
        modified_at: null,
      };
      try {
        const created = await invoke<PdfAnnotation>("create_annotation", { path, annotation: ann });
        onAnnotationCreated(created);
        onAnnotationsChanged(pageNumber);
      } catch (e) {
        console.warn("create annotation failed", e);
      }
    };

    root.addEventListener("mouseup", onMouseUp);
    return () => root.removeEventListener("mouseup", onMouseUp);
  }, [tool, doc, path, pageNumber, geom, onAnnotationsChanged, onAnnotationCreated]);

  // Note / FreeText creation: click to place.
  useEffect(() => {
    if (tool !== "note" && tool !== "freetext") return;
    const svg = svgRef.current;
    if (!svg) return;
    const onClick = async (e: React.PointerEvent) => {
      const rect = svg.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const p = screenToPdf(geom, sx, sy);
      const size = 24;
      const ann: PdfAnnotation = {
        id: `page:${pageNumber}:new:${Date.now()}`,
        page_index: pageNumber,
        annotation_type: tool,
        rect: { left: p.x, right: p.x + size, bottom: p.y - size, top: p.y },
        quad_points: [],
        ink_paths: [],
        color: defaultColor(tool),
        opacity: 1,
        text: tool === "freetext" ? "text" : tool === "note" ? "" : null,
        created_at: null,
        modified_at: null,
      };
      try {
        const created = await invoke<PdfAnnotation>("create_annotation", { path, annotation: ann });
        onAnnotationCreated(created);
        onAnnotationsChanged(pageNumber);
      } catch (err) {
        console.warn("create annotation failed", err);
      }
    };
    // Attach via a ref-safe listener
    const handler = (e: Event) => onClick(e as unknown as React.PointerEvent);
    svg.addEventListener("click", handler);
    return () => svg.removeEventListener("click", handler);
  }, [tool, doc, path, pageNumber, geom, onAnnotationsChanged, onAnnotationCreated]);

  // Ink drawing: pointer drag draws a path.
  useEffect(() => {
    if (tool !== "ink") return;
    const svg = svgRef.current;
    if (!svg) return;
    let currentPath: Point[] = [];
    let drawing = false;

    const onDown = (e: PointerEvent) => {
      drawing = true;
      currentPath = [];
      const rect = svg.getBoundingClientRect();
      currentPath.push(screenToPdf(geom, e.clientX - rect.left, e.clientY - rect.top));
    };
    const onMove = (e: PointerEvent) => {
      if (!drawing) return;
      const rect = svg.getBoundingClientRect();
      currentPath.push(screenToPdf(geom, e.clientX - rect.left, e.clientY - rect.top));
    };
    const onUp = async () => {
      if (!drawing) return;
      drawing = false;
      if (currentPath.length < 2) return;
      let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
      for (const p of currentPath) {
        left = Math.min(left, p.x);
        right = Math.max(right, p.x);
        bottom = Math.min(bottom, p.y);
        top = Math.max(top, p.y);
      }
      const ann: PdfAnnotation = {
        id: `page:${pageNumber}:new:${Date.now()}`,
        page_index: pageNumber,
        annotation_type: "ink",
        rect: { left, right, bottom, top },
        quad_points: [],
        ink_paths: [currentPath],
        color: "#e06c75",
        opacity: 1,
        text: null,
        created_at: null,
        modified_at: null,
      };
      try {
        const created = await invoke<PdfAnnotation>("create_annotation", { path, annotation: ann });
        onAnnotationCreated(created);
        onAnnotationsChanged(pageNumber);
      } catch (err) {
        console.warn("create ink failed", err);
      }
      currentPath = [];
    };

    svg.addEventListener("pointerdown", onDown);
    svg.addEventListener("pointermove", onMove);
    svg.addEventListener("pointerup", onUp);
    return () => {
      svg.removeEventListener("pointerdown", onDown);
      svg.removeEventListener("pointermove", onMove);
      svg.removeEventListener("pointerup", onUp);
    };
  }, [tool, doc, path, pageNumber, geom, onAnnotationsChanged, onAnnotationCreated]);

  return (
    <svg
      ref={svgRef}
      className={"pdf-annotation-layer" + (tool !== "select" ? " pdf-annot-tool" : "")}
      width={cssW}
      height={cssH}
      viewBox={`0 0 ${cssW} ${cssH}`}
    >
      {annotations.map((ann) => renderAnnotation(ann, geom, path, pageNumber, onAnnotationsChanged))}
    </svg>
  );
}

function renderAnnotation(
  ann: PdfAnnotation,
  geom: PageGeom,
  path: string,
  pageNumber: number,
  onAnnotationsChanged: (n: number) => void,
) {
  const del = async () => {
    try {
      await invoke("delete_annotation", { path, pageIndex: pageNumber, id: ann.id });
      onAnnotationsChanged(pageNumber);
    } catch (e) {
      console.warn("delete annotation failed", e);
    }
  };

  if (ann.annotation_type === "highlight" || ann.annotation_type === "underline" || ann.annotation_type === "strikeout") {
    return (
      <g key={ann.id} onDoubleClick={del}>
        {ann.quad_points.map((q, i) => {
          const tl = pdfToScreen(geom, q.x3, q.y3);
          const tr = pdfToScreen(geom, q.x4, q.y4);
          const br = pdfToScreen(geom, q.x2, q.y2);
          const bl = pdfToScreen(geom, q.x1, q.y1);
          const d = `M ${tl.x} ${tl.y} L ${tr.x} ${tr.y} L ${br.x} ${br.y} L ${bl.x} ${bl.y} Z`;
          return (
            <path
              key={i}
              d={d}
              fill={ann.color}
              fillOpacity={ann.opacity}
              stroke={ann.annotation_type === "underline" ? ann.color : "none"}
              strokeWidth={ann.annotation_type === "underline" ? 1.5 : 0}
              strokeOpacity={ann.opacity}
            />
          );
        })}
      </g>
    );
  }

  // note / freetext
  const tl = pdfToScreen(geom, ann.rect.left, ann.rect.top);
  const br = pdfToScreen(geom, ann.rect.right, ann.rect.bottom);
  const w = br.x - tl.x;
  const h = tl.y - br.y;
  if (ann.annotation_type === "note") {
    return (
      <g key={ann.id} onDoubleClick={del}>
        <rect
          x={tl.x}
          y={br.y}
          width={Math.max(w, 18)}
          height={Math.max(h, 18)}
          rx={3}
          fill={ann.color}
          fillOpacity={ann.opacity}
          stroke="#00000033"
          strokeWidth={0.5}
        />
        {ann.text && (
          <text x={tl.x + 4} y={br.y + 12} fontSize={9} fill="#333">
            {ann.text.slice(0, 20)}
          </text>
        )}
      </g>
    );
  }
  if (ann.annotation_type === "freetext") {
    return (
      <g key={ann.id} onDoubleClick={del}>
        <rect
          x={tl.x}
          y={br.y}
          width={w}
          height={h}
          fill={ann.color}
          fillOpacity={0.15}
          stroke={ann.color}
          strokeWidth={1}
        />
        <text x={tl.x + 4} y={br.y + 14} fontSize={11} fill={ann.color}>
          {ann.text ?? ""}
        </text>
      </g>
    );
  }
  if (ann.annotation_type === "ink") {
    return (
      <g key={ann.id} onDoubleClick={del}>
        {ann.ink_paths.map((pathPts, pi) => {
          if (pathPts.length < 2) return null;
          const pts = pathPts.map((p) => pdfToScreen(geom, p.x, p.y));
          const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
          return (
            <path
              key={pi}
              d={d}
              fill="none"
              stroke={ann.color}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={ann.opacity}
            />
          );
        })}
      </g>
    );
  }
  return null;
}

function defaultColor(tool: AnnotationTool): string {
  switch (tool) {
    case "highlight":
      return "#ffd54f";
    case "underline":
      return "#4fc3f7";
    case "strikeout":
      return "#ef5350";
    case "note":
      return "#ffd54f";
    case "freetext":
      return "#333333";
    case "ink":
      return "#e06c75";
    default:
      return "#ffd54f";
  }
}

