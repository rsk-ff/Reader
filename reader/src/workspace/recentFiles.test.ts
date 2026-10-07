import { describe, expect, it } from "vitest";

import {
  mergeRecentFilesFromSnapshot,
  parseRecentFiles,
  loadRecentFiles,
  persistRecentFiles,
  RECENT_FILES_STORAGE_KEY,
  recentFileFromPath,
  rememberRecentFile,
  toUserFacingPath,
} from "./recentFiles";
import type { DocumentSession, WorkspaceSnapshot } from "./types";

function document(
  id: string,
  path: string,
  untitled = false,
): DocumentSession {
  const segments = path.split(/[\\/]/);
  return {
    id,
    path,
    file_name: segments[segments.length - 1] || "未命名.md",
    doc_type: "markdown",
    dirty: untitled,
    revision: 1,
    last_saved_revision: untitled ? 0 : 1,
    file_size: null,
    untitled,
  };
}

describe("recent files", () => {
  it("recovers from malformed persisted data", () => {
    expect(parseRecentFiles("not-json")).toEqual([]);
    expect(parseRecentFiles('{"path":"note.md"}')).toEqual([]);
  });

  it("deduplicates Windows path spellings without truncating older files", () => {
    let files = [recentFileFromPath("C:\\Notes\\Draft.md")!];
    files = rememberRecentFile(files, recentFileFromPath("c:/notes/draft.md")!);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("c:/notes/draft.md");

    for (let index = 0; index < 100; index += 1) {
      files = rememberRecentFile(files, recentFileFromPath(`C:\\Notes\\${index}.pdf`)!);
    }
    expect(files).toHaveLength(101);
    expect(files[0].file_name).toBe("99.pdf");
    expect(files[files.length - 1].file_name).toBe("draft.md");
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); } };
    persistRecentFiles(files, storage);
    expect(values.has(RECENT_FILES_STORAGE_KEY)).toBe(true);
    expect(loadRecentFiles(storage)).toEqual(files);
  });

  it("hides Windows extended-length prefixes and migrates duplicate records", () => {
    const regular = {
      path: "C:\\Notes\\Draft.md",
      file_name: "Draft.md",
      doc_type: "markdown" as const,
    };
    const extended = {
      ...regular,
      path: "\\\\?\\C:\\Notes\\Draft.md",
    };

    expect(toUserFacingPath(extended.path)).toBe(regular.path);
    expect(toUserFacingPath("\\\\?\\UNC\\server\\share\\Draft.md")).toBe(
      "\\\\server\\share\\Draft.md",
    );
    expect(parseRecentFiles(JSON.stringify([regular, extended]))).toEqual([regular]);
  });

  it("keeps the newest duplicate position and fills missing metadata", () => {
    const newest = recentFileFromPath("C:/Notes/first.md", 2000)!;
    const other = recentFileFromPath("C:/Notes/other.pdf", 1500)!;
    const older = { ...recentFileFromPath("c:/notes/FIRST.md", 1000)!, file_size: 4321 };
    expect(parseRecentFiles(JSON.stringify([newest, other, older]))).toEqual([
      { ...newest, file_size: 4321 }, other,
    ]);
  });

  it("preserves legacy entries and validates optional metadata", () => {
    const old = recentFileFromPath("C:/Notes/old.md")!;
    expect(parseRecentFiles(JSON.stringify([old]))).toEqual([old]);
    expect(parseRecentFiles(JSON.stringify([{ ...old, opened_at: "yesterday", file_size: -2 }]))).toEqual([old]);
    const complete = { ...old, opened_at: 1791370800000, file_size: 0 };
    expect(parseRecentFiles(JSON.stringify([complete]))).toEqual([complete]);
    const reopened = rememberRecentFile([complete], recentFileFromPath(old.path, 1791370801000)!);
    expect(reopened[0]).toMatchObject({ opened_at: 1791370801000, file_size: 0 });
  });

  it("refreshes changed snapshot sizes without changing opening time or order", () => {
    const first = { ...recentFileFromPath("C:/Notes/first.md", 1000)!, file_size: 20 };
    const second = { ...recentFileFromPath("C:/Notes/second.md", 2000)!, file_size: 30 };
    const opened = { ...document("doc-1", first.path), file_size: 1234 };
    const snapshot: WorkspaceSnapshot = { window_id: "main", tabs: [], active_tab_id: null, documents: [opened] };
    const files = mergeRecentFilesFromSnapshot([second, first], [opened], snapshot);
    expect(files).toEqual([second, { ...first, file_size: 1234 }]);
    expect(mergeRecentFilesFromSnapshot([first], [], snapshot)[0]).toMatchObject({ opened_at: 1000, file_size: 1234 });
  });

  it("adds saved or newly opened documents and ignores untitled ones", () => {
    const untitled = document("doc-1", "", true);
    const opened = document("doc-2", "C:\\Notes\\opened.md");
    const snapshot: WorkspaceSnapshot = {
      window_id: "main",
      tabs: [
        {
          id: "tab-1",
          window_id: "main",
          document_id: "doc-1",
          title: "未命名.md",
          position: 0,
          active: false,
        },
        {
          id: "tab-2",
          window_id: "main",
          document_id: "doc-2",
          title: "opened.md",
          position: 1,
          active: true,
        },
      ],
      documents: [untitled, opened],
      active_tab_id: "tab-2",
    };

    expect(mergeRecentFilesFromSnapshot([], [], snapshot)).toMatchObject([
      {
        path: opened.path,
        file_name: opened.file_name,
        doc_type: "markdown",
      },
    ]);

    const saved = document("doc-1", "C:\\Notes\\saved.md");
    const afterSave = { ...snapshot, documents: [saved, opened] };
    expect(mergeRecentFilesFromSnapshot([], snapshot.documents, afterSave)[0].path).toBe(
      saved.path,
    );
  });
});
