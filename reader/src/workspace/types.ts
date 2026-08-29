// Mirrors src-tauri/src/workspace.rs. Keep in sync when the Rust side changes.

export type TabId = string;
export type DocumentId = string;
export type WindowId = string;

export type DocumentType = "pdf" | "markdown" | "unknown";

export interface DocumentSession {
  id: string;
  path: string;
  file_name: string;
  doc_type: DocumentType;
  dirty: boolean;
  revision: number;
  last_saved_revision: number;
  file_size: number | null;
}

export interface WindowTab {
  id: string;
  window_id: string;
  /** Null identifies a real new tab that is not backed by a document. */
  document_id: string | null;
  title: string;
  position: number;
  active: boolean;
}

/** Per-window snapshot returned by `get_workspace(window_id)`. */
export interface WorkspaceSnapshot {
  window_id: string;
  tabs: WindowTab[];
  documents: DocumentSession[];
  active_tab_id: string | null;
}
