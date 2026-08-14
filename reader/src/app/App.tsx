import { useEffect } from "react";
import { useWorkspace } from "../workspace/store";
import { TabStrip } from "../components/TabStrip";
import { PlaceholderView } from "../components/PlaceholderView";
import { EmptyState } from "../components/EmptyState";
import "../styles.css";

export default function App() {
  const ready = useWorkspace((s) => s.ready);
  const init = useWorkspace((s) => s.init);
  const tabs = useWorkspace((s) => s.tabs);
  const activeTabId = useWorkspace((s) => s.active_tab_id);

  useEffect(() => {
    void init();
  }, [init]);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  return (
    <div className="app-shell">
      <TabStrip />
      <div className="content-area">
        {!ready ? (
          <div className="boot">loading…</div>
        ) : activeTab ? (
          <PlaceholderView tab={activeTab} />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}
