import { describe, expect, it } from "vitest";
import { fixedFolders, folderIdentity, frecency, frequentFolders, parentFolder, parseFolderLocations,
  recordFolderVisit, useFolderLocations, VISIT_INTERVAL_MS, type FolderVisit } from "./folderLocations";

const now = new Date("2026-10-11T12:00:00Z").getTime();
const hour = 60 * 60 * 1000;
const visit = (path: string, count: number, age = 0): FolderVisit =>
  ({ path, name: path.split("/").pop()!, count, rank: count, last_opened: now - age });

function reset() { useFolderLocations.setState(parseFolderLocations(null)); }

describe("folder locations", () => {
  it("unifies Windows paths and keeps drive and UNC parents", () => {
    expect(folderIdentity("\\\\?\\C:\\Notes\\")).toBe(folderIdentity("c:/notes"));
    expect(parentFolder("C:\\a.pdf")).toBe("C:\\");
    expect(parentFolder("\\\\?\\UNC\\server\\share\\a.md")).toBe("\\\\server\\share");
    expect(parentFolder("/notes/a.md")).toBe("/notes");
    expect(parentFolder("a.md")).toBeNull();
  });

  it("preserves old pins but does not trust arbitrary old navigation counts", () => {
    expect(parseFolderLocations("broken")).toEqual(parseFolderLocations(null));
    const old = parseFolderLocations(JSON.stringify({
      pinned: [{ path: "C:\\Notes", name: "Notes" }, { path: "c:/notes/", name: "Notes" }, {}],
      visits: [{ path: "D:/Work", name: "Work", count: 100, last_opened: now }],
    }));
    expect(old.pinned).toHaveLength(1);
    expect(old.visits).toHaveLength(0);
    const current = parseFolderLocations(JSON.stringify({ ...old, version: 2,
      visits: [visit("D:/Work", 3), { ...visit("E:/Bad", 3), rank: -1 }] }));
    expect(current.visits).toEqual([visit("D:/Work", 3)]);
  });

  it("merges default and custom pins, and persists unpinning default folders", () => {
    reset();
    const defaults = [{ path: "C:/Desktop", name: "桌面" }, { path: "C:/Downloads", name: "下载" }];
    const state = useFolderLocations.getState();
    state.setPinned(defaults[0], false, true);
    state.setPinned({ path: "D:/Work", name: "Work" }, true, false);
    state.setPinned({ path: "d:\\work", name: "Work" }, true, false);
    expect(fixedFolders(defaults, useFolderLocations.getState()).map((folder) => folder.name)).toEqual(["下载", "Work"]);
    const reloaded = parseFolderLocations(JSON.stringify(useFolderLocations.getState()));
    expect(fixedFolders(defaults, reloaded).map((folder) => folder.name)).toEqual(["下载", "Work"]);
    state.setPinned(defaults[0], true, true);
    expect(fixedFolders(defaults, useFolderLocations.getState())).toHaveLength(3);
  });

  it("requires three independent visits and excludes roots, fixed and very old folders", () => {
    const folders = frequentFolders([
      visit("D:/Once", 1), visit("D:/Twice", 2), visit("D:/Work", 3), visit("C:/", 100),
      visit("D:/Pinned", 100), visit("D:/Old", 100, 91 * 24 * hour),
    ], [{ path: "D:/Pinned", name: "Pinned" }], now);
    expect(folders.map((folder) => folder.path)).toEqual(["D:/Work"]);
    expect(recordFolderVisit([], "C:/", now)).toEqual([]);
    expect(recordFolderVisit([], "\\\\server\\share", now)).toEqual([]);
  });

  it("uses the zoxide recency weights with exact time boundaries", () => {
    expect(frecency(visit("D:/Work", 4), now)).toBe(16);
    expect(frecency(visit("D:/Work", 4, hour), now)).toBe(8);
    expect(frecency(visit("D:/Work", 4, 24 * hour), now)).toBe(2);
    expect(frecency(visit("D:/Work", 4, 7 * 24 * hour), now)).toBe(1);
    expect(frequentFolders([visit("D:/Old", 10, 8 * 24 * hour), visit("D:/Recent", 3)], [], now)[0].name).toBe("Recent");
  });

  it("debounces repeated file and browse events rather than just updating last use", () => {
    const first = recordFolderVisit([], "D:/Work", now);
    expect(recordFolderVisit(first, "d:\\work", now + VISIT_INTERVAL_MS - 1)).toBe(first);
    const second = recordFolderVisit(first, "D:/Work", now + VISIT_INTERVAL_MS);
    expect(second[0].count).toBe(2);
    const third = recordFolderVisit(second, "D:/Work", now + 2 * VISIT_INTERVAL_MS);
    expect(frequentFolders(third, [], now + 2 * VISIT_INTERVAL_MS)).toHaveLength(1);
  });

  it("ages scores to the budget and drops insignificant entries", () => {
    const value = recordFolderVisit([visit("D:/Work", 2000), visit("D:/Rare", 1)], "D:/Other", now);
    expect(value.reduce((sum, folder) => sum + folder.rank, 0)).toBeLessThanOrEqual(1800);
    expect(value.map((folder) => folder.name)).toEqual(["Work"]);
  });

  it("seeds only dated successful opens and collapses one burst of many files", () => {
    reset();
    const state = useFolderLocations.getState();
    const recent = [0, 1, 2].map((index) => ({ path: `D:/Work/${index}.pdf`, file_name: `${index}.pdf`,
      doc_type: "pdf" as const, opened_at: Date.now() - (3 - index) * hour }));
    recent.push(...[0, 1, 2, 3, 4].map((index) => ({ path: `D:/Burst/${index}.pdf`, file_name: `${index}.pdf`,
      doc_type: "pdf" as const, opened_at: Date.now() - hour + index })));
    state.seedRecentFiles(recent);
    expect(frequentFolders(useFolderLocations.getState().visits, []).map((folder) => folder.name)).toEqual(["Work"]);
    const visits = useFolderLocations.getState().visits;
    state.seedRecentFiles(recent);
    expect(useFolderLocations.getState().visits).toBe(visits);
  });

  it("limits the sidebar without throwing away eligible visits", () => {
    const visits = Array.from({ length: 20 }, (_, index) => visit(`D:/Folder${index}`, 3));
    expect(frequentFolders(visits, [], now)).toHaveLength(8);
    expect(visits).toHaveLength(20);
  });
});
