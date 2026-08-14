import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import type { TabId, WorkspaceSnapshot } from "./types";

interface WorkspaceState extends WorkspaceSnapshot {
  ready: boolean;
  documentsById: Record<string, import("./types").DocumentSession>;
  /** Called once on boot: pull the current state and subscribe to changes. */
  init: () => Promise<void>;
  /** Frontend File→Open path (also used by drag-in later). */
  openDocument: (path: string) => Promise<void>;
  focusTab: (id: TabId) => Promise<void>;
  closeTab: (id: TabId) => Promise<void>;
}

function indexDocuments(snapshot: WorkspaceSnapshot) {
  const documentsById: Record<string, import("./types").DocumentSession> = {};
  for (const d of snapshot.documents) documentsById[d.id] = d;
  return documentsById;
}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  window_id: "main",
  tabs: [],
  documents: [],
  active_tab_id: null,
  documentsById: {},
  ready: false,

  init: async () => {
    if (get().ready) return;
    // Subscribe first so we never miss a change that races between the
    // initial pull and the listener attaching.
    await listen<WorkspaceSnapshot>("workspace://changed", (event) => {
      const snap = event.payload;
      set({ ...snap, documentsById: indexDocuments(snap), ready: true });
    });
    const snap = await invoke<WorkspaceSnapshot>("get_workspace");
    set({ ...snap, documentsById: indexDocuments(snap), ready: true });
  },

  openDocument: async (path) => {
    await invoke<string>("open_document_command", { path });
  },

  focusTab: async (id) => {
    await invoke("focus_tab", { tabId: id });
  },

  closeTab: async (id) => {
    await invoke("close_tab", { tabId: id });
  },
}));
