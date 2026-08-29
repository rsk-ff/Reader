import { describe, expect, it } from "vitest";

import {
  MAX_RECENT_FILES,
  mergeRecentFilesFromSnapshot,
  parseRecentFiles,
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

  it("deduplicates Windows path spellings and caps the list", () => {
    let files = [recentFileFromPath("C:\\Notes\\Draft.md")!];
    files = rememberRecentFile(files, recentFileFromPath("c:/notes/draft.md")!);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("c:/notes/draft.md");

    for (let index = 0; index < MAX_RECENT_FILES + 3; index += 1) {
      files = rememberRecentFile(files, recentFileFromPath(`C:\\Notes\\${index}.pdf`)!);
    }
    expect(files).toHaveLength(MAX_RECENT_FILES);
    expect(files[0].file_name).toBe(`${MAX_RECENT_FILES + 2}.pdf`);
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

    expect(mergeRecentFilesFromSnapshot([], [], snapshot)).toEqual([
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
