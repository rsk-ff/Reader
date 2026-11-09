import type { RecentFile } from "./recentFiles";
import type { DocumentSession, TabId } from "./types";

/**
 * A file opened from a new tab replaces that tab in place. For a short time
 * afterwards, and only while the file is untouched, the mouse back button
 * turns the tab back into the new tab it came from.
 */
export const NEW_TAB_RETURN_MS = 10_000;

/** Where the new-tab page was when the file was opened. */
export interface NewTabPlace {
  history: { paths: string[]; index: number };
  selected: string | null;
}

export interface NewTabReturn {
  documentId: string;
  path: string;
  openedAt: number;
  place: NewTabPlace;
  /** The recent-files entry for this path before the open, if it had one. */
  recentBefore: { file: RecentFile; index: number } | null;
}

const returns = new Map<TabId, NewTabReturn>();
/** Places waiting for the next new-tab page mounted in that tab. */
const places = new Map<TabId, NewTabPlace>();

export function rememberNewTabReturn(tabId: TabId, entry: NewTabReturn) {
  returns.set(tabId, entry);
}

export function forgetNewTabReturn(tabId: TabId) {
  returns.delete(tabId);
}

export function peekNewTabReturn(tabId: TabId): NewTabReturn | undefined {
  return returns.get(tabId);
}

/** The pure eligibility rule, kept separate so it can be tested. */
export function canReturnToNewTab(
  entry: NewTabReturn | undefined,
  documentId: string | null,
  document: Pick<DocumentSession, "dirty" | "revision"> | undefined,
  now: number,
): boolean {
  if (!entry || !document || documentId !== entry.documentId) return false;
  if (now - entry.openedAt > NEW_TAB_RETURN_MS) return false;
  return !document.dirty && document.revision === 1;
}

export function stashNewTabPlace(tabId: TabId, place: NewTabPlace) {
  places.set(tabId, place);
}

export function peekNewTabPlace(tabId: TabId | undefined): NewTabPlace | undefined {
  return tabId ? places.get(tabId) : undefined;
}

export function clearNewTabPlace(tabId: TabId | undefined) {
  if (tabId) places.delete(tabId);
}

/**
 * Undo the recent-files change of a mistaken open: drop the entry it added,
 * or put the earlier entry back where it was.
 */
export function restoreRecentEntry(
  files: RecentFile[],
  identity: (path: string) => string,
  path: string,
  before: NewTabReturn["recentBefore"],
): RecentFile[] {
  const key = identity(path);
  const rest = files.filter((file) => identity(file.path) !== key);
  if (!before) return rest;
  const index = Math.min(before.index, rest.length);
  return [...rest.slice(0, index), before.file, ...rest.slice(index)];
}
