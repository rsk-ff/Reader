import { useWorkspace } from "../workspace/store";
import type { WindowTab } from "../workspace/types";

export function TabStrip() {
  const tabs = useWorkspace((s) => s.tabs);
  const documentsById = useWorkspace((s) => s.documentsById);
  const activeTabId = useWorkspace((s) => s.active_tab_id);
  const focusTab = useWorkspace((s) => s.focusTab);
  const closeTab = useWorkspace((s) => s.closeTab);

  return (
    <div className="tabstrip" role="tablist">
      {tabs.map((tab) => (
        <TabButton
          key={tab.id}
          tab={tab}
          dirty={documentsById[tab.document_id]?.dirty ?? false}
          active={tab.id === activeTabId}
          onFocus={() => void focusTab(tab.id)}
          onClose={() => void closeTab(tab.id)}
        />
      ))}
      <div className="tabstrip-spacer" />
    </div>
  );
}

function TabButton({
  tab,
  dirty,
  active,
  onFocus,
  onClose,
}: {
  tab: WindowTab;
  dirty: boolean;
  active: boolean;
  onFocus: () => void;
  onClose: () => void;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      className={"tab" + (active ? " tab-active" : "")}
      onMouseDown={(e) => {
        // Middle click closes (Chrome/Edge parity).
        if (e.button === 1) {
          e.preventDefault();
          onClose();
          return;
        }
        if (e.button === 0) onFocus();
      }}
      onAuxClick={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          onClose();
        }
      }}
      title={tab.title}
    >
      <span className="tab-icon">{docGlyph(dirty)}</span>
      <span className="tab-title">{tab.title}</span>
      <span
        className="tab-close"
        role="button"
        aria-label="Close tab"
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onClose();
        }}
      >
        {dirty ? "●" : "✕"}
      </span>
    </button>
  );
}

function docGlyph(dirty: boolean): string {
  return dirty ? "●" : "";
}
