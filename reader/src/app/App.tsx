import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { useWorkspace } from "../workspace/store";
import { TabStrip } from "../components/TabStrip";
import { EmptyState } from "../components/EmptyState";
import { DocumentView } from "../documents/DocumentView";
import {
  prepareDocumentForClose,
  UnsavedChangesDialog,
} from "../workspace/documentLifecycle";
import "../styles.css";

export default function App() {
  const ready = useWorkspace((s) => s.ready);
  const init = useWorkspace((s) => s.init);
  const tabs = useWorkspace((s) => s.tabs);
  const activeTabId = useWorkspace((s) => s.active_tab_id);
  const focusTab = useWorkspace((s) => s.focusTab);
  const closeTab = useWorkspace((s) => s.closeTab);

  useEffect(() => {
    void init();
  }, [init]);

  // Resolve every dirty document before allowing the native window to close.
  useEffect(() => {
    const win = getCurrentWindow();
    let allowNativeClose = false;
    let closeInProgress = false;
    const unlistenP = win.onCloseRequested(async (event) => {
      if (allowNativeClose) return;
      event.preventDefault();
      if (closeInProgress) return;
      closeInProgress = true;

      const state = useWorkspace.getState();
      const { tabs: currentTabs, documentsById } = state;
      try {
        for (const tab of currentTabs) {
          const document = documentsById[tab.document_id];
          if (document?.dirty && !(await prepareDocumentForClose(document, tab.title))) {
            closeInProgress = false;
            return;
          }
        }
        await invoke("save_session");
        allowNativeClose = true;
        // The decision is complete. Destroy is explicitly permitted by the
        // app capability and avoids issuing a re-entrant close request.
        window.setTimeout(() => {
          void win.destroy().catch((error: unknown) => {
            allowNativeClose = false;
            closeInProgress = false;
            window.alert(`Could not close this window: ${String(error)}`);
          });
        }, 0);
      } catch (error) {
        allowNativeClose = false;
        closeInProgress = false;
        window.alert(`Could not close this window: ${String(error)}`);
      }
    });
    return () => {
      void unlistenP.then((un) => un());
    };
  }, []);

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
      <UnsavedChangesDialog />
    </div>
  );
}
