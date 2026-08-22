import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import type { PdfAnnotation } from "./annotation-types";
import { AnnotationOverlay } from "./PdfAnnotationLayer";
import type { AnnotationTool } from "./PdfAnnotationLayer";
import { hostsEqual, shouldRenderPortals } from "./pdfViewerPolicy";
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
  active: boolean;
  onAnnotationsChanged: (pageNumber: number, deletedId?: string) => void;
  onAnnotationCreated: (annotation: PdfAnnotation) => void;
}

// A stable empty array so portals with no annotations don't allocate per render
// and so referential-equality checks downstream stay cheap.
const EMPTY_ANNOTATIONS: readonly PdfAnnotation[] = [];

function removeExistingHosts(viewerElement: HTMLElement | null) {
  viewerElement
    ?.querySelectorAll(":scope > .page > .reader-annotation-host")
    .forEach((host) => host.remove());
}

export function PdfJsAnnotationPortals(props: PdfJsAnnotationPortalsProps) {
  const {
    viewerElement,
    epoch,
    path,
    pageInfos,
    annotationsByPage,
    tool,
    active,
    onAnnotationsChanged,
    onAnnotationCreated,
  } = props;
  const [hosts, setHosts] = useState<AnnotationHost[]>([]);
  const portalsEnabled = shouldRenderPortals(active, tool, annotationsByPage);

  useEffect(() => {
    // When portals are disabled (inactive tab, or active select mode with no
    // annotations), tear down any previously attached hosts and clear state.
    if (!portalsEnabled || !viewerElement || Object.keys(pageInfos).length === 0) {
      if (viewerElement) removeExistingHosts(viewerElement);
      setHosts([]);
      return;
    }

    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      if (cancelled) return;
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
      // Skip the state update when page numbers and scales are unchanged, so
      // an unchanged epoch doesn't re-portal identical overlays.
      setHosts((previous) => (hostsEqual(previous, next) ? previous : next));
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [viewerElement, epoch, pageInfos, portalsEnabled]);

  // Tear down hosts when the component unmounts or the viewer element changes.
  useEffect(() => {
    return () => {
      removeExistingHosts(viewerElement);
    };
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
        annotations={annotationsByPage[pageNumber] ?? EMPTY_ANNOTATIONS}
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
