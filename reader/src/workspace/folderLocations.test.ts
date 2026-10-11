import { describe, expect, it } from "vitest";
import { folderIdentity, frequentFolders, parentFolder, parseFolderLocations, useFolderLocations } from "./folderLocations";

describe("folder locations", () => {
  it("unifies Windows paths and keeps drive and UNC parents", () => {
    expect(folderIdentity("\\\\?\\C:\\Notes\\")).toBe(folderIdentity("c:/notes"));
    expect(parentFolder("C:\\a.pdf")).toBe("C:\\");
    expect(parentFolder("\\\\?\\UNC\\server\\share\\a.md")).toBe("\\\\server\\share");
    expect(parentFolder("/notes/a.md")).toBe("/notes");
    expect(parentFolder("a.md")).toBeNull();
  });

  it("drops corrupt history and deduplicates fixed folders", () => {
    expect(parseFolderLocations("broken")).toEqual({ pinned: [], visits: [] });
    const value = parseFolderLocations(JSON.stringify({
      pinned: [{ path: "C:\\Notes", name: "Notes" }, { path: "c:/notes/", name: "Notes" }, {}],
      visits: [{ path: "C:/Notes", name: "Notes", count: -1, last_opened: 1 },
        { path: "D:/Work", name: "Work", count: 3, last_opened: 12 }],
    }));
    expect(value.pinned).toHaveLength(1);
    expect(value.visits).toHaveLength(1);
    expect(value.visits[0].count).toBe(3);
  });

  it("ranks usage then recency and seeds folders from legacy recent files", () => {
    const value = frequentFolders([
      { path: "c:/notes", name: "Notes", count: 5, last_opened: 100 },
      { path: "D:/Work", name: "Work", count: 5, last_opened: 200 },
    ], [{ path: "C:\\Notes\\a.pdf", file_name: "a.pdf", doc_type: "pdf", opened_at: 300 },
      { path: "E:/Legacy/a.md", file_name: "a.md", doc_type: "markdown" }]);
    expect(value.map((item) => item.name)).toEqual(["Notes", "Work", "Legacy"]);
    expect(value[0].count).toBe(5);
    expect(value[0].last_opened).toBe(300);
    expect(frequentFolders([], Array.from({ length: 20 }, (_, index) => ({ path: `C:/f${index}/a.pdf`, file_name: "a.pdf", doc_type: "pdf" })))).toHaveLength(8);
  });

  it("toggles pins independently of visit counts", () => {
    useFolderLocations.setState({ pinned: [], visits: [] });
    const state = useFolderLocations.getState();
    state.togglePin({ path: "C:/Notes", name: "Notes" });
    state.recordVisit("c:\\notes");
    state.recordVisit("C:/Notes");
    expect(useFolderLocations.getState().visits[0].count).toBe(2);
    state.togglePin({ path: "C:\\Notes", name: "Notes" });
    expect(useFolderLocations.getState().pinned).toEqual([]);
    expect(useFolderLocations.getState().visits).toHaveLength(1);
  });
});
