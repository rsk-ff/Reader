import { create } from "zustand";
import { toUserFacingPath, type RecentFile } from "./recentFiles";

export const FOLDER_LOCATIONS_KEY = "reader.folder-locations.v1";
export const VISIT_INTERVAL_MS = 30 * 60 * 1000;
export const BROWSE_DWELL_MS = 30 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TOTAL_RANK = 2000;

export interface FolderLocation { path: string; name: string }
export interface FolderVisit extends FolderLocation {
  count: number;
  rank: number;
  last_opened: number;
}
export interface FolderLocations {
  version: 2;
  pinned: FolderLocation[];
  hiddenDefaults: string[];
  visits: FolderVisit[];
  seeded: boolean;
}

function emptyLocations(): FolderLocations {
  return { version: 2, pinned: [], hiddenDefaults: [], visits: [], seeded: false };
}

export function folderIdentity(path: string): string {
  return toUserFacingPath(path).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

export function folderName(path: string): string {
  const friendly = toUserFacingPath(path);
  return friendly.split(/[\\/]/).filter(Boolean).pop() ?? friendly;
}

export function parentFolder(path: string): string | null {
  const friendly = toUserFacingPath(path).replace(/[\\/]+$/, "");
  const index = Math.max(friendly.lastIndexOf("/"), friendly.lastIndexOf("\\"));
  if (index < 0) return null;
  if (index === 2 && friendly[1] === ":") return friendly.slice(0, 3);
  return index === 0 ? friendly[0] : friendly.slice(0, index);
}

function isRoot(path: string): boolean {
  const identity = folderIdentity(path);
  return !identity || /^[a-z]:$/i.test(identity) || /^\/\/[^/]+\/[^/]+$/.test(identity);
}

export function parseFolderLocations(serialized: string | null): FolderLocations {
  const empty = emptyLocations();
  try {
    const value = JSON.parse(serialized ?? "null");
    if (!value || typeof value !== "object") return empty;
    const valid = (item: unknown): item is FolderLocation => !!item && typeof item === "object"
      && typeof (item as FolderLocation).path === "string" && !!(item as FolderLocation).path.trim()
      && typeof (item as FolderLocation).name === "string";
    const unique = <T extends FolderLocation>(items: T[]): T[] =>
      [...new Map(items.map((item) => [folderIdentity(item.path), { ...item, path: toUserFacingPath(item.path) }])).values()];
    return {
      ...empty,
      pinned: unique(Array.isArray(value.pinned) ? value.pinned.filter(valid) : []),
      // v1 counted every navigation click. These counts cannot prove habitual use.
      visits: value.version === 2 && Array.isArray(value.visits) ? unique(value.visits.filter((item: unknown): item is FolderVisit =>
        valid(item) && Number.isSafeInteger((item as FolderVisit).count) && (item as FolderVisit).count > 0
        && Number.isFinite((item as FolderVisit).rank) && (item as FolderVisit).rank > 0
        && Number.isFinite((item as FolderVisit).last_opened) && (item as FolderVisit).last_opened > 0
        && (item as FolderVisit).last_opened <= 8.64e15)) : [],
      hiddenDefaults: value.version === 2 && Array.isArray(value.hiddenDefaults)
        ? value.hiddenDefaults.filter((path: unknown): path is string => typeof path === "string").map(folderIdentity) : [],
      seeded: value.version === 2 && value.seeded === true,
    };
  } catch { return empty; }
}

function load(): FolderLocations {
  if (typeof window === "undefined") return emptyLocations();
  try { return parseFolderLocations(window.localStorage.getItem(FOLDER_LOCATIONS_KEY)); }
  catch { return emptyLocations(); }
}

function persist(value: FolderLocations) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(FOLDER_LOCATIONS_KEY, JSON.stringify(value)); }
  catch { /* Storage restrictions must not prevent browsing. */ }
}

export function fixedFolders(defaults: FolderLocation[], state: FolderLocations): FolderLocation[] {
  const fixed = new Map<string, FolderLocation>();
  for (const folder of defaults) {
    if (!state.hiddenDefaults.includes(folderIdentity(folder.path))) fixed.set(folderIdentity(folder.path), folder);
  }
  for (const folder of state.pinned) fixed.set(folderIdentity(folder.path), folder);
  return [...fixed.values()];
}

/** Reimplementation of zoxide's documented frecency weights, with Reader admission rules.
 * https://github.com/ajeetdsouza/zoxide/wiki/Algorithm
 * No upstream source is copied. See docs/decisions/0003-frequent-folders.md.
 */
export function frecency(visit: FolderVisit, now: number): number {
  const age = Math.max(0, now - visit.last_opened);
  const weight = age < 60 * 60 * 1000 ? 4 : age < DAY_MS ? 2 : age < 7 * DAY_MS ? 0.5 : 0.25;
  return visit.rank * weight;
}

export function frequentFolders(visits: FolderVisit[], excluded: FolderLocation[], now = Date.now()): FolderVisit[] {
  const identities = new Set(excluded.map((folder) => folderIdentity(folder.path)));
  return visits.filter((visit) => visit.count >= 3 && !isRoot(visit.path)
    && !identities.has(folderIdentity(visit.path)) && now - visit.last_opened <= 90 * DAY_MS)
    .sort((a, b) => frecency(b, now) - frecency(a, now) || b.last_opened - a.last_opened
      || a.path.localeCompare(b.path)).slice(0, 8);
}

export function recordFolderVisit(visits: FolderVisit[], path: string, now = Date.now()): FolderVisit[] {
  if (isRoot(path)) return visits;
  const identity = folderIdentity(path);
  const previous = visits.find((item) => folderIdentity(item.path) === identity);
  if (previous && now - previous.last_opened < VISIT_INTERVAL_MS) return visits;
  const visit = { path: toUserFacingPath(path), name: folderName(path),
    count: Math.min(Number.MAX_SAFE_INTEGER, (previous?.count ?? 0) + 1), rank: (previous?.rank ?? 0) + 1,
    last_opened: now };
  const updated = [visit, ...visits.filter((item) => folderIdentity(item.path) !== identity)];
  const total = updated.reduce((sum, item) => sum + item.rank, 0);
  // zoxide aging: keep the database near 90% of its configured score budget.
  return total > MAX_TOTAL_RANK ? updated.map((item) => ({ ...item, rank: item.rank * MAX_TOTAL_RANK * 0.9 / total }))
    .filter((item) => item.rank >= 1) : updated;
}

interface FolderState extends FolderLocations {
  setPinned: (folder: FolderLocation, pinned: boolean, isDefault: boolean) => void;
  recordVisit: (path: string) => void;
  seedRecentFiles: (files: RecentFile[]) => void;
}

export const useFolderLocations = create<FolderState>((set, get) => ({
  ...load(),
  setPinned: (folder, pinned, isDefault) => {
    const state = get();
    const identity = folderIdentity(folder.path);
    const custom = state.pinned.filter((item) => folderIdentity(item.path) !== identity);
    if (pinned && !isDefault) custom.push({ ...folder, path: toUserFacingPath(folder.path) });
    const hidden = state.hiddenDefaults.filter((path) => path !== identity);
    if (!pinned && isDefault) hidden.push(identity);
    const next = { version: 2 as const, pinned: custom, hiddenDefaults: hidden, visits: state.visits, seeded: state.seeded };
    persist(next);
    set(next);
  },
  recordVisit: (path) => {
    const state = get();
    const visits = recordFolderVisit(state.visits, path);
    if (visits === state.visits) return;
    const next = { version: 2 as const, pinned: state.pinned, hiddenDefaults: state.hiddenDefaults, visits, seeded: state.seeded };
    persist(next);
    set(next);
  },
  seedRecentFiles: (files) => {
    const state = get();
    if (state.seeded) return;
    const now = Date.now();
    const known = files.filter((file) => file.opened_at && file.opened_at <= now
      && now - file.opened_at < 90 * DAY_MS).sort((a, b) => a.opened_at! - b.opened_at!);
    let visits = state.visits;
    for (const file of known) {
      const folder = parentFolder(file.path);
      if (folder) visits = recordFolderVisit(visits, folder, file.opened_at);
    }
    const next = { version: 2 as const, pinned: state.pinned, hiddenDefaults: state.hiddenDefaults, visits, seeded: true };
    persist(next);
    set(next);
  },
}));

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === FOLDER_LOCATIONS_KEY) useFolderLocations.setState(parseFolderLocations(event.newValue));
  });
}
