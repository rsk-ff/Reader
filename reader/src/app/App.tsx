import { useEffect } from "react";
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

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div className="app-shell">
      <TabStrip />
      <div className="content-area">
        {!ready ? (
          <div className="boot">loading…</div>
        ) : tabs.length === 0 ? (
          <EmptyState />
        ) : (
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
        )}
      </div>
    </div>
  );
}
