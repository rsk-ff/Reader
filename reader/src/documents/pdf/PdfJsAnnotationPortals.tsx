import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import type { PdfAnnotation } from "./annotation-types";
import { AnnotationOverlay } from "./PdfAnnotationLayer";
import type { AnnotationTool } from "./PdfAnnotationLayer";
import type { PageInfo } from "./types";

interface AnnotationHost {
  pageNumber: number;
  element: HTMLDivElement;
  scale: number;
}

interface PdfJsAnnotationPortalsProps {
  viewerElement: HTMLDivElement | null;
  epoch: number;
  path: string;
  pageInfos: Record<number, PageInfo>;
  annotationsByPage: Record<number, PdfAnnotation[]>;
  tool: AnnotationTool;
  onAnnotationsChanged: (pageNumber: number, deletedId?: string) => void;
  onAnnotationCreated: (annotation: PdfAnnotation) => void;
}

export function PdfJsAnnotationPortals(props: PdfJsAnnotationPortalsProps) {
  const {
    viewerElement,
    epoch,
    path,
    pageInfos,
    annotationsByPage,
    tool,
    onAnnotationsChanged,
    onAnnotationCreated,
  } = props;
  const [hosts, setHosts] = useState<AnnotationHost[]>([]);

  useEffect(() => {
    if (!viewerElement || Object.keys(pageInfos).length === 0) {
      setHosts([]);
      return;
    }

    const frame = requestAnimationFrame(() => {
      const next: AnnotationHost[] = [];
      for (const pageElement of viewerElement.querySelectorAll<HTMLElement>(".page[data-page-number]")) {
        const pageNumber = Number(pageElement.dataset.pageNumber);
        const info = pageInfos[pageNumber];
        if (!info || !Number.isFinite(pageNumber)) continue;

        let host = pageElement.querySelector<HTMLDivElement>(":scope > .reader-annotation-host");
        if (!host) {
          host = window.document.createElement("div");
          host.className = "reader-annotation-host";
          pageElement.append(host);
        }
        const scale = pageElement.clientWidth / Math.max(info.w1, 1);
        next.push({ pageNumber, element: host, scale });
      }
      setHosts(next);
    });

    return () => cancelAnimationFrame(frame);
  }, [viewerElement, epoch, pageInfos]);

  useEffect(() => () => {
    viewerElement
      ?.querySelectorAll(":scope > .page > .reader-annotation-host")
      .forEach((host) => host.remove());
  }, [viewerElement]);

  return hosts.map(({ pageNumber, element, scale }) => {
    const info = pageInfos[pageNumber];
    if (!info) return null;
    return createPortal(
      <AnnotationOverlay
        path={path}
        pageNumber={pageNumber}
        geom={{
          w1: info.w1,
          h1: info.h1,
          rotation: info.rotation,
          transform: info.transform,
          scale,
        }}
        annotations={annotationsByPage[pageNumber] ?? []}
        tool={tool}
          renderVisuals
        onAnnotationsChanged={onAnnotationsChanged}
        onAnnotationCreated={onAnnotationCreated}
      />,
      element,
      `annotation-${pageNumber}`,
    );
  });
}
