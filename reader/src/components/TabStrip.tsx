import { useState } from "react";
import { useWorkspace } from "../workspace/store";
import type { TabId, WindowTab } from "../workspace/types";

/**
 * Tab strip with drag-to-reorder and drag-out-to-detach (§17, §18, Test 9/10).
 *
 * Reorder uses HTML5 drag-and-drop within this window's tab strip. Detach is
 * detected on `dragend`: if the pointer landed outside the strip bounds, the
 * tab is torn off into a new native window via `detach_tab` (the backend keeps
 * the DocumentSession alive — Test 10).
 */
export function TabStrip() {
  const tabs = useWorkspace((s) => s.tabs);
  const documentsById = useWorkspace((s) => s.documentsById);
  const activeTabId = useWorkspace((s) => s.active_tab_id);
  const focusTab = useWorkspace((s) => s.focusTab);
  const closeTab = useWorkspace((s) => s.closeTab);
  const reorderTabs = useWorkspace((s) => s.reorderTabs);
  const detachTab = useWorkspace((s) => s.detachTab);

  const [draggingId, setDraggingId] = useState<TabId | null>(null);
  const [dragOverId, setDragOverId] = useState<TabId | null>(null);

  function onDragStart(e: React.DragEvent, tab: WindowTab) {
    setDraggingId(tab.id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", tab.id);
  }

  function onDragOver(e: React.DragEvent, tab: WindowTab) {
    e.preventDefault();
    if (draggingId && draggingId !== tab.id) {
      setDragOverId(tab.id);
    }
  }

  function onDrop(e: React.DragEvent, target: WindowTab) {
    e.preventDefault();
    const src = draggingId;
    setDraggingId(null);
    setDragOverId(null);
    if (!src || src === target.id) return;
    // Reorder: move src to target's position.
    const ordered = tabs.map((t) => t.id);
    const from = ordered.indexOf(src);
    const to = ordered.indexOf(target.id);
    if (from < 0 || to < 0) return;
    ordered.splice(from, 1);
    ordered.splice(to, 0, src);
    void reorderTabs(ordered);
  }

  async function onDragEnd(e: React.DragEvent, tab: WindowTab, stripEl: HTMLElement | null) {
    setDraggingId(null);
    setDragOverId(null);
    // Detach detection: did the drop land outside the tab strip?
    if (!stripEl) return;
    const r = stripEl.getBoundingClientRect();
    const outside =
      e.clientX < r.left - 8 ||
      e.clientX > r.right + 8 ||
      e.clientY < r.top - 8 ||
      e.clientY > r.bottom + 40; // allow a little downward leeway
    if (outside) {
      await detachTab(tab.id);
    }
  }

  return (
    <div
      className="tabstrip"
      role="tablist"
      ref={(el) => {
        // keep ref for dragend bounds check via a data attribute on each tab
        if (el) (el as HTMLElement & { _strip?: HTMLElement })._strip = el;
      }}
    >
      {tabs.map((tab) => {
        const dirty = documentsById[tab.document_id]?.dirty ?? false;
        const active = tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            draggable
            onDragStart={(e) => onDragStart(e, tab)}
            onDragOver={(e) => onDragOver(e, tab)}
            onDrop={(e) => onDrop(e, tab)}
            onDragEnd={(e) => {
              const strip = (e.currentTarget.parentElement as HTMLElement & { _strip?: HTMLElement })?._strip;
              void onDragEnd(e, tab, strip ?? null);
            }}
            className={
              "tab" +
              (active ? " tab-active" : "") +
              (draggingId === tab.id ? " tab-dragging" : "") +
              (dragOverId === tab.id ? " tab-drag-over" : "")
            }
            onMouseDown={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                void closeTab(tab.id);
                return;
              }
              if (e.button === 0) void focusTab(tab.id);
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
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                void closeTab(tab.id);
              }}
            >
              {dirty ? "●" : "✕"}
            </span>
          </button>
        );
      })}
      <div className="tabstrip-spacer" />
    </div>
  );
}
