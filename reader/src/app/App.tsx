import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useWorkspace } from "../workspace/store";
import { TabStrip } from "../components/TabStrip";
import { EmptyState } from "../components/EmptyState";
import { DocumentView } from "../documents/DocumentView";
import "../styles.css";

export default function App() {
  const ready = useWorkspace((s) => s.ready);
  const init = useWorkspace((s) => s.init);
  const tabs = useWorkspace((s) => s.tabs);
  const activeTabId = useWorkspace((s) => s.active_tab_id);
  const focusTab = useWorkspace((s) => s.focusTab);
  const closeTab = useWorkspace((s) => s.closeTab);
  const myWindowId = useWorkspace((s) => s.myWindowId);

  useEffect(() => {
    void init();
  }, [init]);

  // Report window destruction to the backend so it can drop tab slots (§26).
  useEffect(() => {
    const win = getCurrentWindow();
    const unlistenP = win.onCloseRequested(async () => {
      // Non-main windows: let the backend remove_window clean up.
      await import("@tauri-apps/api/core").then(({ invoke }) =>
        invoke("remove_window", { windowId: myWindowId }).catch(() => {}),
      );
    });
    return () => {
      void unlistenP.then((un) => un());
    };
  }, [myWindowId]);

  // Keyboard navigation (§17): Ctrl+W close, Ctrl+Tab / Ctrl+Shift+Tab cycle.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === "w" || e.key === "W") {
        e.preventDefault();
        if (activeTabId) void closeTab(activeTabId);
      } else if (e.key === "Tab") {
        e.preventDefault();
        if (tabs.length < 2) return;
        const idx = tabs.findIndex((t) => t.id === activeTabId);
        const next = e.shiftKey
          ? (idx - 1 + tabs.length) % tabs.length
          : (idx + 1) % tabs.length;
        void focusTab(tabs[next].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tabs, activeTabId, focusTab, closeTab]);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  return (
    <div className="app-shell">
      <TabStrip />
      <div className="content-area">
        {!ready ? (
          <div className="boot">loading…</div>
        ) : activeTab ? (
          // §10: switching tabs must not unmount the viewer. Render every tab's
          // document and hide the inactive ones — scroll/zoom state survives.
          <div className="tab-stack">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={"tab-pane" + (tab.id === activeTabId ? " tab-pane-active" : "")}
                aria-hidden={tab.id !== activeTabId}
              >
                <DocumentView tab={tab} active={tab.id === activeTabId} />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}
