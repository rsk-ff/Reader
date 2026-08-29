import type { DocumentSession, DocumentType, WorkspaceSnapshot } from "./types";

export const RECENT_FILES_STORAGE_KEY = "reader.recent-files.v1";
export const MAX_RECENT_FILES = 8;

export interface RecentFile {
  path: string;
  file_name: string;
  doc_type: Exclude<DocumentType, "unknown">;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): StorageLike | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function normalizedPath(path: string): string {
  const unified = path.replace(/\\/g, "/");
  return /^[a-z]:\//i.test(unified) || unified.startsWith("//")
    ? unified.toLocaleLowerCase()
    : unified;
}

function fileTypeFromPath(path: string): RecentFile["doc_type"] | null {
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  if (extension === "pdf") return "pdf";
  if (extension === "md" || extension === "markdown") return "markdown";
  return null;
}

function fileNameFromPath(path: string): string {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

function isRecentFile(value: unknown): value is RecentFile {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RecentFile>;
  return (
    typeof candidate.path === "string" &&
    candidate.path.length > 0 &&
    typeof candidate.file_name === "string" &&
    candidate.file_name.length > 0 &&
    (candidate.doc_type === "pdf" || candidate.doc_type === "markdown")
  );
}

export function rememberRecentFile(files: RecentFile[], file: RecentFile): RecentFile[] {
  const identity = normalizedPath(file.path);
  return [file, ...files.filter((candidate) => normalizedPath(candidate.path) !== identity)].slice(
    0,
    MAX_RECENT_FILES,
  );
}

export function parseRecentFiles(serialized: string | null): RecentFile[] {
  if (!serialized) return [];
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!Array.isArray(parsed)) return [];
    let files: RecentFile[] = [];
    for (const candidate of parsed.filter(isRecentFile).reverse()) {
      files = rememberRecentFile(files, candidate);
    }
    return files;
  } catch {
    return [];
  }
}

export function loadRecentFiles(storage = browserStorage()): RecentFile[] {
  if (!storage) return [];
  try {
    return parseRecentFiles(storage.getItem(RECENT_FILES_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function persistRecentFiles(
  files: RecentFile[],
  storage = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(RECENT_FILES_STORAGE_KEY, JSON.stringify(files));
  } catch {
    // A full or disabled webview store must not block normal file operations.
  }
}

export function recentFileFromPath(path: string): RecentFile | null {
  const doc_type = fileTypeFromPath(path);
  if (!doc_type) return null;
  return { path, file_name: fileNameFromPath(path), doc_type };
}

export function recentFileFromDocument(document: DocumentSession): RecentFile | null {
  if (document.untitled || !document.path || document.doc_type === "unknown") return null;
  return {
    path: document.path,
    file_name: document.file_name,
    doc_type: document.doc_type,
  };
}

/** Add only documents that appeared or gained a path since the prior snapshot. */
export function mergeRecentFilesFromSnapshot(
  files: RecentFile[],
  previousDocuments: DocumentSession[],
  snapshot: WorkspaceSnapshot,
): RecentFile[] {
  const previousPaths = new Map(
    previousDocuments.map((document) => [document.id, document.path]),
  );
  const activeDocumentId = snapshot.tabs.find(
    (tab) => tab.id === snapshot.active_tab_id,
  )?.document_id;
  const additions = snapshot.documents
    .filter((document) => previousPaths.get(document.id) !== document.path)
    .map(recentFileFromDocument)
    .filter((file): file is RecentFile => file !== null)
    .sort((left, right) => {
      const leftActive = snapshot.documents.some(
        (document) => document.id === activeDocumentId && document.path === left.path,
      );
      const rightActive = snapshot.documents.some(
        (document) => document.id === activeDocumentId && document.path === right.path,
      );
      return Number(leftActive) - Number(rightActive);
    });

  return additions.reduce(rememberRecentFile, files);
}
