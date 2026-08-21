import { useRef, useState } from "react";
import { useWorkspace } from "../workspace/store";
import type { TabId, WindowTab } from "../workspace/types";
import { useWindowDragRegion } from "./windowDrag";
import {
  buildReorderedOrder,
  computeInsertionIndex,
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
  const detachTab = useWorkspace((s) => s.detachTab);

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

  interface DragSession {
    tabId: TabId;
    pointerId: number;
    startX: number;
    startY: number;
    started: boolean;
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
  }

  function onPointerDown(e: React.PointerEvent, tab: WindowTab) {
    // Only a primary pointer can start a possible drag. Middle-click close is
    // preserved via onMouseDown/onAuxClick below; other buttons are inert.
    if (e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    // Focus immediately on primary down so a plain click still selects the tab.
    void focusTab(tab.id).catch(() => {});
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
    }
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
    const el = s.el;
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
      return;
    }
    if (isOutsideStripBounds(e.clientX, e.clientY, stripRect)) {
      clearSession();
      void detachTab(tabId).catch((error: unknown) => {
        // Preserve the user-visible detach error reporting.
        window.alert(error instanceof Error ? error.message : String(error));
      });
      return;
    }
    const ids = tabsRef.current.map((t) => t.id);
    const rects = readTabRects();
    const idx = computeInsertionIndex(rects, e.clientX);
    const next = buildReorderedOrder(ids, tabId, idx);
    clearSession();
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
    clearSession();
  }

  function onLostPointerCapture(e: React.PointerEvent) {
    // Unexpected capture loss (e.g. the window losing focus mid-drag): clean
    // up without reordering or detaching.
    const s = sessionRef.current;
    if (s && s.pointerId === e.pointerId) {
      clearSession();
    }
  }

  const dropBeforeIndex =
    dropIndicator && !dropIndicator.after ? dropIndicator.index : -1;
  const dropAfterLast = dropIndicator?.after ?? false;

  return (
    <div
      className="tabstrip"
      role="tablist"
      ref={stripRef}
    >
      {tabs.map((tab, i) => {
        const dirty = documentsById[tab.document_id]?.dirty ?? false;
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
              }
            }}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                void closeTab(tab.id);
              }
            }}
            title={tab.title}
          >
            <span className="tab-icon">{dirty ? "●" : ""}</span>
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
            >
              {dirty ? "●" : "✕"}
            </span>
          </button>
        );
      })}
      <div className="tabstrip-spacer" onMouseDown={drag.onMouseDown} />
    </div>
  );
}
