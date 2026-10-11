import { create } from "zustand";
import { toUserFacingPath, type RecentFile } from "./recentFiles";

export const FOLDER_LOCATIONS_KEY = "reader.folder-locations.v1";
export interface FolderLocation { path: string; name: string }
export interface FolderVisit extends FolderLocation { count: number; last_opened: number }
export interface FolderLocations { pinned: FolderLocation[]; visits: FolderVisit[] }

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

export function parseFolderLocations(serialized: string | null): FolderLocations {
  const empty = { pinned: [], visits: [] };
  try {
    const value = JSON.parse(serialized ?? "null");
    if (!value || typeof value !== "object") return empty;
    const valid = (item: unknown): item is FolderLocation => !!item && typeof item === "object"
      && typeof (item as FolderLocation).path === "string" && !!(item as FolderLocation).path.trim()
      && typeof (item as FolderLocation).name === "string";
    const unique = <T extends FolderLocation>(items: T[]): T[] =>
      [...new Map(items.map((item) => [folderIdentity(item.path), { ...item, path: toUserFacingPath(item.path) }])).values()];
    return {
      pinned: unique(Array.isArray(value.pinned) ? value.pinned.filter(valid) : []),
      visits: unique(Array.isArray(value.visits) ? value.visits.filter((item: unknown): item is FolderVisit =>
        valid(item) && Number.isSafeInteger((item as FolderVisit).count) && (item as FolderVisit).count > 0
        && Number.isFinite((item as FolderVisit).last_opened) && (item as FolderVisit).last_opened > 0) : []),
    };
  } catch { return empty; }
}

function load(): FolderLocations {
  if (typeof window === "undefined") return { pinned: [], visits: [] };
  try { return parseFolderLocations(window.localStorage.getItem(FOLDER_LOCATIONS_KEY)); }
  catch { return { pinned: [], visits: [] }; }
}

function persist(value: FolderLocations) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(FOLDER_LOCATIONS_KEY, JSON.stringify(value)); }
  catch { /* Storage restrictions must not prevent browsing. */ }
}

export function frequentFolders(visits: FolderVisit[], files: RecentFile[]): FolderVisit[] {
  const folders = new Map<string, FolderVisit>();
  for (const file of files) {
    const path = parentFolder(file.path);
    if (!path) continue;
    const identity = folderIdentity(path);
    const previous = folders.get(identity);
    folders.set(identity, { path, name: folderName(path), count: (previous?.count ?? 0) + 1,
      last_opened: Math.max(previous?.last_opened ?? 0, file.opened_at ?? 0) });
  }
  for (const visit of visits) {
    const previous = folders.get(folderIdentity(visit.path));
    folders.set(folderIdentity(visit.path), { ...visit,
      count: Math.max(visit.count, previous?.count ?? 0),
      last_opened: Math.max(visit.last_opened, previous?.last_opened ?? 0) });
  }
  return [...folders.values()].sort((a, b) => b.count - a.count || b.last_opened - a.last_opened
    || a.path.localeCompare(b.path)).slice(0, 8);
}

interface FolderState extends FolderLocations {
  togglePin: (folder: FolderLocation) => void;
  recordVisit: (path: string) => void;
}

export const useFolderLocations = create<FolderState>((set, get) => ({
  ...load(),
  togglePin: (folder) => {
    const state = get();
    const identity = folderIdentity(folder.path);
    const pinned = state.pinned.some((item) => folderIdentity(item.path) === identity)
      ? state.pinned.filter((item) => folderIdentity(item.path) !== identity)
      : [...state.pinned, { ...folder, path: toUserFacingPath(folder.path) }];
    const next = { pinned, visits: state.visits };
    persist(next);
    set(next);
  },
  recordVisit: (path) => {
    const state = get();
    const identity = folderIdentity(path);
    const previous = state.visits.find((item) => folderIdentity(item.path) === identity);
    const visit = { path: toUserFacingPath(path), name: folderName(path),
      count: Math.min(Number.MAX_SAFE_INTEGER, (previous?.count ?? 0) + 1), last_opened: Date.now() };
    const next = { pinned: state.pinned,
      visits: [visit, ...state.visits.filter((item) => folderIdentity(item.path) !== identity)] };
    persist(next);
    set(next);
  },
}));

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === FOLDER_LOCATIONS_KEY) useFolderLocations.setState(parseFolderLocations(event.newValue));
  });
}
