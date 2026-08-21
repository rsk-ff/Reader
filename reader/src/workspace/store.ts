import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";

import type { TabId, WindowId, WorkspaceSnapshot } from "./types";
import { prepareDocumentForClose } from "./documentLifecycle";

interface WorkspaceState extends WorkspaceSnapshot {
  ready: boolean;
  myWindowId: WindowId;
  documentsById: Record<string, import("./types").DocumentSession>;
  init: () => Promise<void>;
  openDocument: (path: string) => Promise<void>;
  focusTab: (id: TabId) => Promise<void>;
  closeTab: (id: TabId) => Promise<void>;
  reorderTabs: (tabIds: TabId[]) => Promise<void>;
  detachTab: (id: TabId) => Promise<WindowId>;
  setDocumentDirtyLocal: (documentId: string, dirty: boolean) => void;
  refresh: () => Promise<void>;
}

function indexDocuments(snapshot: WorkspaceSnapshot) {
  const documentsById: Record<string, import("./types").DocumentSession> = {};
  for (const d of snapshot.documents) documentsById[d.id] = d;
  return documentsById;
}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  window_id: "main",
  myWindowId: "main",
  tabs: [],
  documents: [],
  active_tab_id: null,
  documentsById: {},
  ready: false,

  setDocumentDirtyLocal: (documentId, dirty) => {
    set((state) => {
      const document = state.documentsById[documentId];
      if (!document || document.dirty === dirty) return state;
      const updated = { ...document, dirty };
      return {
        documentsById: { ...state.documentsById, [documentId]: updated },
        documents: state.documents.map((candidate) =>
          candidate.id === documentId ? updated : candidate,
        ),
      };
    });
  },

  refresh: async () => {
    const myWindowId = get().myWindowId;
    const snap = await invoke<WorkspaceSnapshot>("get_workspace", {
      windowId: myWindowId,
    });
    set({ ...snap, documentsById: indexDocuments(snap), ready: true });
  },

  init: async () => {
    if (get().ready) return;
    const myWindowId = getCurrentWindow().label;
    set({ myWindowId });
    // Wake-up signal from Rust — re-fetch our own snapshot.
    await listen("workspace://changed", () => {
      void get().refresh();
    });
    await get().refresh();
  },

  openDocument: async (path) => {
    const myWindowId = get().myWindowId;
    await invoke<string>("open_document_command", { path, windowId: myWindowId });
  },

  focusTab: async (id) => {
    await invoke("focus_tab", { tabId: id });
  },

  closeTab: async (id) => {
    const state = get();
    const tab = state.tabs.find((candidate) => candidate.id === id);
    const document = tab ? state.documentsById[tab.document_id] : undefined;
    if (
      document?.dirty &&
      !(await prepareDocumentForClose(document, tab?.title ?? document.file_name))
    ) {
      return;
    }
    await invoke("close_tab", { tabId: id });
  },

  reorderTabs: async (tabIds) => {
    const myWindowId = get().myWindowId;
    // Optimistic: set immediately so the drag feels instant.
    set((s) => {
      const byId: Record<string, import("./types").WindowTab> = {};
      for (const t of s.tabs) byId[t.id] = t;
      const reordered = tabIds
        .map((id, i) => ({ ...byId[id], position: i }))
        .filter(Boolean) as import("./types").WindowTab[];
      return { tabs: reordered };
    });
    await invoke("reorder_tabs", { windowId: myWindowId, tabIds });
  },

  detachTab: async (id) => {
    const state = get();
    const tab = state.tabs.find((candidate) => candidate.id === id);
    const document = tab ? state.documentsById[tab.document_id] : undefined;
    if (document?.dirty && document.doc_type === "markdown") {
      throw new Error("Save Markdown changes before moving this tab to another window.");
    }
    return await invoke<WindowId>("detach_tab", { tabId: id });
  },
}));
