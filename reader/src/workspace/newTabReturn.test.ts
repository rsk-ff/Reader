import { describe, expect, it } from "vitest";
import { canReturnToNewTab, NEW_TAB_RETURN_MS, peekNewTabReturn, pruneNewTabReturns, rememberNewTabReturn, restoreRecentEntry, type NewTabReturn } from "./newTabReturn";
import type { RecentFile } from "./recentFiles";

const entry: NewTabReturn = {
  documentId: "doc-a",
  path: "C:\\docs\\a.pdf",
  openedAt: 1_000,
  place: { history: { paths: ["home", "C:\\docs"], index: 1 }, selected: "C:\\docs\\a.pdf" },
  recentBefore: null,
};
const clean = { dirty: false, revision: 1 };

describe("canReturnToNewTab", () => {
  it("allows an untouched file within the time window", () => {
    expect(canReturnToNewTab(entry, "doc-a", clean, 1_000 + NEW_TAB_RETURN_MS)).toBe(true);
  });
  it("stops once the time window has passed", () => {
    expect(canReturnToNewTab(entry, "doc-a", clean, 1_001 + NEW_TAB_RETURN_MS)).toBe(false);
  });
  it("stops after any edit, even one that was saved", () => {
    expect(canReturnToNewTab(entry, "doc-a", { dirty: true, revision: 2 }, 2_000)).toBe(false);
    expect(canReturnToNewTab(entry, "doc-a", { dirty: false, revision: 2 }, 2_000)).toBe(false);
  });
  it("ignores a tab now showing another document or none", () => {
    expect(canReturnToNewTab(entry, "doc-b", clean, 2_000)).toBe(false);
    expect(canReturnToNewTab(entry, null, clean, 2_000)).toBe(false);
    expect(canReturnToNewTab(undefined, "doc-a", clean, 2_000)).toBe(false);
  });
});

describe("restoreRecentEntry", () => {
  const file = (path: string, opened_at: number): RecentFile => ({ path, file_name: path, doc_type: "pdf", opened_at });
  const identity = (path: string) => path.toLowerCase();

  it("drops an entry the mistaken open added", () => {
    const files = [file("A.pdf", 3), file("b.pdf", 2)];
    expect(restoreRecentEntry(files, identity, "a.pdf", null)).toEqual([file("b.pdf", 2)]);
  });
  it("puts an earlier entry back in its old place", () => {
    const files = [file("c.pdf", 9), file("a.pdf", 8), file("b.pdf", 2)];
    const restored = restoreRecentEntry(files, identity, "c.pdf", { file: file("c.pdf", 1), index: 2 });
    expect(restored).toEqual([file("a.pdf", 8), file("b.pdf", 2), file("c.pdf", 1)]);
  });
});

describe("pruneNewTabReturns", () => {
  it("keeps the active tab and drops a tab that was switched away from", () => {
    rememberNewTabReturn("tab-1", entry);
    pruneNewTabReturns("tab-1");
    expect(peekNewTabReturn("tab-1")).toBe(entry);
    pruneNewTabReturns("tab-2");
    expect(peekNewTabReturn("tab-1")).toBeUndefined();
    // Switching back does not bring it back.
    pruneNewTabReturns("tab-1");
    expect(peekNewTabReturn("tab-1")).toBeUndefined();
  });
});
