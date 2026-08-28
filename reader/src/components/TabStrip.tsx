import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useWorkspace } from "../workspace/store";
import type { DocumentType, TabId, WindowTab } from "../workspace/types";
import { DocumentTypeIcon } from "./DocumentTypeIcon";
import { useWindowDragRegion } from "./windowDrag";
import {
  buildReorderedOrder,
  computeInsertionIndex,
  dragPreviewPosition,
  isOutsideStripBounds,
  movementExceedsThreshold,
  type TabRect,
} from "./tabPointerDrag";

/**
 * Tab strip with pointer-driven reorder and drag-out-to-detach (§17, §18).
 *
 * Reorder/detach moved off HTML5 drag-and-drop: Tauri's Windows native
 * drag/drop handler replaces WebView2's and Reader must keep it enabled for
 * external OS file drops (`workspace/useFileDrop.ts`). A primary
 * `pointerdown` on a tab body captures the pointer; movement past a small
 * threshold becomes a drag that reorders within the strip, and a release
 * outside the strip detaches the tab into a new native window via
 * `detach_tab` (the backend keeps the DocumentSession alive — Test 10).
 */
export function TabStrip() {
  const tabs = useWorkspace((s) => s.tabs);
  const documentsById = useWorkspace((s) => s.documentsById);
  const activeTabId = useWorkspace((s) => s.active_tab_id);
  const focusTab = useWorkspace((s) => s.focusTab);
  const closeTab = useWorkspace((s) => s.closeTab);
  const reorderTabs = useWorkspace((s) => s.reorderTabs);
  const beginTabDrag = useWorkspace((s) => s.beginTabDrag);
  const cancelTabDrag = useWorkspace((s) => s.cancelTabDrag);
  const completeTabDrag = useWorkspace((s) => s.completeTabDrag);

  const drag = useWindowDragRegion();

  const stripRef = useRef<HTMLDivElement | null>(null);
  // Mirror the latest tab order into a ref so the async pointerup handler reads
  // the order at drag time without depending on a stale closure.
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const [draggingId, setDraggingId] = useState<TabId | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{
    index: number;
    after: boolean;
  } | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    title: string;
    dirty: boolean;
    docType: DocumentType;
    width: number;
    height: number;
    grabOffsetX: number;
    grabOffsetY: number;
    clientX: number;
    clientY: number;
  } | null>(null);

  interface DragSession {
    tabId: TabId;
    pointerId: number;
    startX: number;
    startY: number;
    started: boolean;
    ending: boolean;
    title: string;
    dirty: boolean;
    docType: DocumentType;
    width: number;
    height: number;
    grabOffsetX: number;
    grabOffsetY: number;
    el: HTMLElement;
  }

  const sessionRef = useRef<DragSession | null>(null);

  function readTabRects(): TabRect[] {
    const strip = stripRef.current;
    if (!strip) return [];
    const els = Array.from(
      strip.querySelectorAll<HTMLElement>("[data-tab-id]"),
    );
    return els.map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.dataset.tabId ?? "", left: r.left, right: r.right };
    });
  }

  function clearSession() {
    sessionRef.current = null;
    setDraggingId(null);
    setDropIndicator(null);
    setDragPreview(null);
  }

  function onPointerDown(e: React.PointerEvent, tab: WindowTab) {
    // Only a primary pointer can start a possible drag. Middle-click close is
    // preserved via onMouseDown/onAuxClick below; other buttons are inert.
    if (e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    // Focus immediately on primary down so a plain click still selects the tab.
    void focusTab(tab.id).catch(() => {});
    // A lone tab is part of the native titlebar: its mouse handler below moves
    // the whole window, so it must never enter reorder/detach pointer capture.
    if (tabsRef.current.length === 1) return;
    const rect = el.getBoundingClientRect();
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Without capture, pointerup outside the tab can leave a stuck session.
      return;
    }
    sessionRef.current = {
      tabId: tab.id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      started: false,
      ending: false,
      title: tab.title,
      dirty: documentsById[tab.document_id]?.dirty ?? false,
      docType: documentsById[tab.document_id]?.doc_type ?? "unknown",
      width: rect.width,
      height: rect.height,
      grabOffsetX: e.clientX - rect.left,
      grabOffsetY: e.clientY - rect.top,
      el,
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    const s = sessionRef.current;
    if (!s || s.pointerId !== e.pointerId) return;
    if (!s.started) {
      if (
        !movementExceedsThreshold(e.clientX - s.startX, e.clientY - s.startY)
      ) {
        return;
      }
      s.started = true;
      setDraggingId(s.tabId);
      void beginTabDrag(
        s.tabId,
        true,
        { x: s.grabOffsetX, y: s.grabOffsetY },
        { title: s.title, dirty: s.dirty, width: s.width, height: s.height },
        true,
      ).catch(() => {
        // Pointerup remains a completion fallback if the native monitor fails.
      });
    }
    setDragPreview({
      title: s.title,
      dirty: s.dirty,
      docType: s.docType,
      width: s.width,
      height: s.height,
      grabOffsetX: s.grabOffsetX,
      grabOffsetY: s.grabOffsetY,
      clientX: e.clientX,
      clientY: e.clientY,
    });
    const strip = stripRef.current;
    const stripRect = strip?.getBoundingClientRect();
    if (!stripRect) return;
    if (isOutsideStripBounds(e.clientX, e.clientY, stripRect)) {
      // Pointer left the strip: no in-strip drop indicator while detaching.
      setDropIndicator(null);
      return;
    }
    const rects = readTabRects();
    const idx = computeInsertionIndex(rects, e.clientX);
    setDropIndicator({ index: idx, after: idx >= rects.length });
  }

  function onPointerUp(e: React.PointerEvent) {
    const s = sessionRef.current;
    if (!s || s.pointerId !== e.pointerId) {
      return;
    }
    const started = s.started;
    const tabId = s.tabId;
    const grabOffset = { x: s.grabOffsetX, y: s.grabOffsetY };
    const el = s.el;
    s.ending = true;
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      // Already released or pointer invalid; ignore.
    }
    if (!started) {
      clearSession();
      return;
    }
    const strip = stripRef.current;
    const stripRect = strip?.getBoundingClientRect() ?? null;
    if (!stripRect) {
      clearSession();
      void cancelTabDrag(tabId).catch(() => {});
      return;
    }
    if (isOutsideStripBounds(e.clientX, e.clientY, stripRect)) {
      clearSession();
      void completeTabDrag(tabId, true, grabOffset).catch((error: unknown) => {
        // Preserve the user-visible move/detach error reporting.
        window.alert(error instanceof Error ? error.message : String(error));
      });
      return;
    }
    const ids = tabsRef.current.map((t) => t.id);
    const rects = readTabRects();
    const idx = computeInsertionIndex(rects, e.clientX);
    const next = buildReorderedOrder(ids, tabId, idx);
    clearSession();
    void cancelTabDrag(tabId).catch(() => {});
    const changed =
      next.length !== ids.length || next.some((id, i) => id !== ids[i]);
    if (changed) {
      // reorderTabs is optimistic; a backend failure is corrected on the next
      // workspace refresh. Swallow so no unhandled rejection escapes.
      void reorderTabs(next).catch(() => {});
    }
  }

  function onPointerCancel(e: React.PointerEvent) {
    const s = sessionRef.current;
    if (!s || s.pointerId !== e.pointerId) return;
    try {
      s.el.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    void cancelTabDrag(s.tabId).catch(() => {});
    clearSession();
  }

  function onLostPointerCapture(e: React.PointerEvent) {
    // Unexpected capture loss (e.g. the window losing focus mid-drag): clean
    // up without reordering or detaching.
    const s = sessionRef.current;
    if (s && s.pointerId === e.pointerId && !s.ending) {
      void cancelTabDrag(s.tabId).catch(() => {});
      clearSession();
    }
  }

  const dropBeforeIndex =
    dropIndicator && !dropIndicator.after ? dropIndicator.index : -1;
  const dropAfterLast = dropIndicator?.after ?? false;
  const previewPosition = dragPreview
    ? dragPreviewPosition(
        dragPreview.clientX,
        dragPreview.clientY,
        dragPreview.grabOffsetX,
        dragPreview.grabOffsetY,
      )
    : null;

  return (
    <>
      <div className="tabstrip" role="tablist" ref={stripRef}>
      {tabs.map((tab, i) => {
        const document = documentsById[tab.document_id];
        const dirty = document?.dirty ?? false;
        const docType = document?.doc_type ?? "unknown";
        const active = tab.id === activeTabId;
        const classes =
          "tab" +
          (active ? " tab-active" : "") +
          (draggingId === tab.id ? " tab-dragging" : "") +
          (i === dropBeforeIndex ? " tab-drag-over" : "") +
          (dropAfterLast && i === tabs.length - 1 ? " tab-drag-over-after" : "");
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            data-tab-id={tab.id}
            className={classes}
            onPointerDown={(e) => onPointerDown(e, tab)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onLostPointerCapture={onLostPointerCapture}
            // Middle-click: prevent the default autoscroll. Focus on primary
            // down is handled in onPointerDown above.
            onMouseDown={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                return;
              }
              if (e.button !== 0 || tabsRef.current.length !== 1) return;
              e.preventDefault();
              if (e.detail === 2) {
                void drag.toggleMaximize().catch(() => {});
                return;
              }
              const rect = e.currentTarget.getBoundingClientRect();
              const grabOffset = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
              };
              // startDragging's Promise can resolve before the Windows move
              // loop ends. Arm the native mouse-release monitor first and let
              // its event complete docking at the real drop point.
              void beginTabDrag(tab.id, false, grabOffset, null, false)
                .then(() => drag.startDragging())
                .catch(() => {});
            }}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                void closeTab(tab.id);
              }
            }}
            title={tab.title}
          >
            <DocumentTypeIcon type={docType} />
            <span className="tab-title">{tab.title}</span>
            <span
              className="tab-close"
              role="button"
              aria-label="Close tab"
              // Stop propagation on pointerdown so closing never starts a tab drag.
              onPointerDown={(e) => {
                e.stopPropagation();
                void closeTab(tab.id);
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {dirty ? "●" : "✕"}
            </span>
          </button>
        );
      })}
      <div className="tabstrip-spacer" onMouseDown={drag.onMouseDown} />
      </div>
      {dragPreview
        ? createPortal(
            <div
              className="tab tab-active tab-drag-ghost"
              aria-hidden="true"
              style={{
                left: previewPosition?.left,
                top: previewPosition?.top,
                width: dragPreview.width,
                height: dragPreview.height,
              }}
            >
              <DocumentTypeIcon type={dragPreview.docType} />
              <span className="tab-title">{dragPreview.title}</span>
              <span className="tab-close">{dragPreview.dirty ? "●" : "✕"}</span>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
