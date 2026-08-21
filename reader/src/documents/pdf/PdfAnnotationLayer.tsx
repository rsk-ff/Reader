import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import { clipScreenRect, pageCssSize, pdfRectToScreen, pdfToScreen, quadsBounds, rectToQuad, screenToPdf } from "./coordinates";
import type { PageGeom, Point, Quad } from "./coordinates";
import type { PdfAnnotation } from "./annotation-types";
import { toPdfPageIndex } from "./pdfModel";

interface AnnotationOverlayProps {
  doc?: unknown;
  path: string;
  pageNumber: number;
  geom: PageGeom;
  annotations: PdfAnnotation[];
  /** current tool: null = select; otherwise create mode */
  tool: AnnotationTool;
  renderVisuals: boolean;
  onAnnotationsChanged: (pageNumber: number, deletedId?: string) => void;
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
 * SVG/DOM overlay sitting above PDF.js (§5). PDF.js owns rendering and its text
 * layer owns selection; this overlay only captures mutation gestures and sends
 * them to the Rust `create_annotation` command.
 */
export function AnnotationOverlay(props: AnnotationOverlayProps) {
  const { doc, path, pageNumber, geom, annotations, tool, renderVisuals, onAnnotationsChanged, onAnnotationCreated } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const [draftInk, setDraftInk] = useState<Point[]>([]);

  const { w: cssW, h: cssH } = pageCssSize(geom);
  const isTextMarkupTool = tool === "highlight" || tool === "underline" || tool === "strikeout";
  const capturesPointer = tool === "note" || tool === "freetext" || tool === "ink";

  // Highlight creation: when a text-markup tool is active, listen for selection
  // changes inside the sibling text layer and convert the range to quads.
  useEffect(() => {
    if (tool !== "highlight" && tool !== "underline" && tool !== "strikeout") return;
    const host = svgRef.current?.parentElement;
    const pageElement = host?.parentElement;
    if (!host || !pageElement) return;

    const onMouseUp = async () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      const range = sel.getRangeAt(0);
      const pageRect = host.getBoundingClientRect();
      const clientRects = range.getClientRects();
      const quads: Quad[] = [];
      for (let i = 0; i < clientRects.length; i++) {
        const clipped = clipScreenRect(clientRects[i], pageRect);
        if (!clipped) continue;
        quads.push(
          rectToQuad(
            geom,
            clipped.left - pageRect.left,
            clipped.top - pageRect.top,
            clipped.right - pageRect.left,
            clipped.bottom - pageRect.top,
          ),
        );
      }
      sel.removeAllRanges();
      if (quads.length === 0) return;
      const bounds = quadsBounds(quads)!;
      const ann: PdfAnnotation = {
        id: `page:${pageNumber}:new:${Date.now()}`,
        page_index: toPdfPageIndex(pageNumber),
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

    // The PDF.js text layer is a sibling of our host. Listen on their shared
    // page element so a selection mouseup bubbles into this handler.
    pageElement.addEventListener("mouseup", onMouseUp);
    return () => pageElement.removeEventListener("mouseup", onMouseUp);
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
      const text = window.prompt(tool === "freetext" ? "Free text" : "Note text", "");
      if (text == null) return;
      const ann: PdfAnnotation = {
        id: `page:${pageNumber}:new:${Date.now()}`,
        page_index: toPdfPageIndex(pageNumber),
        annotation_type: tool,
        rect: { left: p.x, right: p.x + size, bottom: p.y - size, top: p.y },
        quad_points: [],
        ink_paths: [],
        color: defaultColor(tool),
        opacity: 1,
        text,
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
    let pointerId: number | null = null;

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      drawing = true;
      pointerId = e.pointerId;
      currentPath = [];
      const rect = svg.getBoundingClientRect();
      currentPath.push(screenToPdf(geom, e.clientX - rect.left, e.clientY - rect.top));
      setDraftInk([...currentPath]);
      svg.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!drawing || e.pointerId !== pointerId) return;
      const rect = svg.getBoundingClientRect();
      currentPath.push(screenToPdf(geom, e.clientX - rect.left, e.clientY - rect.top));
      setDraftInk([...currentPath]);
    };
    const onUp = async (e: PointerEvent) => {
      if (!drawing || e.pointerId !== pointerId) return;
      drawing = false;
      pointerId = null;
      if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
      const finishedPath = currentPath;
      currentPath = [];
      if (finishedPath.length < 2) {
        setDraftInk([]);
        return;
      }
      let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
      for (const p of finishedPath) {
        left = Math.min(left, p.x);
        right = Math.max(right, p.x);
        bottom = Math.min(bottom, p.y);
        top = Math.max(top, p.y);
      }
      const ann: PdfAnnotation = {
        id: `page:${pageNumber}:new:${Date.now()}`,
        page_index: toPdfPageIndex(pageNumber),
        annotation_type: "ink",
        rect: { left, right, bottom, top },
        quad_points: [],
        ink_paths: [finishedPath],
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
      } finally {
        setDraftInk([]);
      }
    };

    const onCancel = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      drawing = false;
      pointerId = null;
      currentPath = [];
      setDraftInk([]);
    };

    svg.addEventListener("pointerdown", onDown);
    svg.addEventListener("pointermove", onMove);
    svg.addEventListener("pointerup", onUp);
    svg.addEventListener("pointercancel", onCancel);
    return () => {
      svg.removeEventListener("pointerdown", onDown);
      svg.removeEventListener("pointermove", onMove);
      svg.removeEventListener("pointerup", onUp);
      svg.removeEventListener("pointercancel", onCancel);
      setDraftInk([]);
    };
  }, [tool, doc, path, pageNumber, geom, onAnnotationsChanged, onAnnotationCreated]);

  return (
    <svg
      ref={svgRef}
      className={
        "pdf-annotation-layer" +
        (capturesPointer ? " pdf-annot-tool" : "") +
        (isTextMarkupTool ? " pdf-annot-text-tool" : "")
      }
      width={cssW}
      height={cssH}
      viewBox={`0 0 ${cssW} ${cssH}`}
    >
      {annotations.map((ann) => renderAnnotation(ann, geom, path, pageNumber, renderVisuals, onAnnotationsChanged))}
      {draftInk.length > 1 && (
        <path
          d={draftInk
            .map((point, index) => {
              const screenPoint = pdfToScreen(geom, point.x, point.y);
              return `${index === 0 ? "M" : "L"} ${screenPoint.x} ${screenPoint.y}`;
            })
            .join(" ")}
          fill="none"
          stroke="#e06c75"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

function renderAnnotation(
  ann: PdfAnnotation,
  geom: PageGeom,
  path: string,
  pageNumber: number,
  renderVisuals: boolean,
  onAnnotationsChanged: (n: number, deletedId?: string) => void,
) {
  const del = async () => {
    try {
      await invoke("delete_annotation", { path, pageIndex: toPdfPageIndex(pageNumber), id: ann.id });
      onAnnotationsChanged(pageNumber, ann.id);
    } catch (e) {
      console.warn("delete annotation failed", e);
    }
  };

  if (ann.annotation_type === "highlight" || ann.annotation_type === "underline" || ann.annotation_type === "strikeout") {
    return (
      <g key={ann.id} opacity={renderVisuals ? 1 : 0} onDoubleClick={del}>
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
  const box = pdfRectToScreen(geom, ann.rect);
  if (ann.annotation_type === "note") {
    return (
      <g key={ann.id} opacity={renderVisuals ? 1 : 0} onDoubleClick={del}>
        <rect
          x={box.x}
          y={box.y}
          width={Math.max(box.width, 18)}
          height={Math.max(box.height, 18)}
          rx={3}
          fill={ann.color}
          fillOpacity={ann.opacity}
          stroke="#00000033"
          strokeWidth={0.5}
        />
        {ann.text && (
          <text x={box.x + 4} y={box.y + 12} fontSize={9} fill="#333">
            {ann.text.slice(0, 20)}
          </text>
        )}
      </g>
    );
  }
  if (ann.annotation_type === "freetext") {
    return (
      <g key={ann.id} opacity={renderVisuals ? 1 : 0} onDoubleClick={del}>
        <rect
          x={box.x}
          y={box.y}
          width={box.width}
          height={box.height}
          fill={ann.color}
          fillOpacity={0.15}
          stroke={ann.color}
          strokeWidth={1}
        />
        <text x={box.x + 4} y={box.y + 14} fontSize={11} fill={ann.color}>
          {ann.text ?? ""}
        </text>
      </g>
    );
  }
  if (ann.annotation_type === "ink") {
    return (
      <g key={ann.id} opacity={renderVisuals ? 1 : 0} onDoubleClick={del}>
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
