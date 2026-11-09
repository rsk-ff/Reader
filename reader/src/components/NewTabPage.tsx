import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type KeyboardEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useWorkspace } from "../workspace/store";
import { clearNewTabPlace, peekNewTabPlace } from "../workspace/newTabReturn";
import { BROWSE_DWELL_MS, fixedFolders, folderIdentity, folderName, frequentFolders, useFolderLocations, type FolderLocation } from "../workspace/folderLocations";
import { documentType, type LocalDirectory, type LocalLocations } from "../workspace/localFiles";
import { DocumentTypeIcon } from "./DocumentTypeIcon";
import { UiIcon, type UiIconName } from "./UiIcon";
import { FolderContextMenu, type FolderMenuState } from "./FolderContextMenu";
import { NewMarkdownDialog } from "./NewMarkdownDialog";
import { OpenFileErrorDialog, type OpenFileError } from "./OpenFileErrorDialog";
import { SidebarResizer } from "./SidebarResizer";
import { ColumnResizer } from "./ColumnResizer";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
/** File Explorer's details-view date: 2026/10/29 20:33. */
function openedTime(timestamp?: number | null): string {
  if (!timestamp) return "—";
  const date = new Date(timestamp);
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
function typeLabel(kind: "folder" | "pdf" | "markdown" | "unknown"): string {
  return kind === "folder" ? "文件夹" : kind === "pdf" ? "PDF 文档" : kind === "markdown" ? "Markdown 文档" : "文件";
}
function fileSize(bytes?: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const unit = bytes < 1024 ** 2 ? 1024 : bytes < 1024 ** 3 ? 1024 ** 2 : 1024 ** 3;
  return `${(bytes / unit).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit === 1024 ? "KB" : unit === 1024 ** 2 ? "MB" : "GB"}`;
}

/** The home location only lists recently opened files, so it is named for them. */
export const HOME_LABEL = "最近打开";

/** Tab title for a new tab: the name of the place it shows. */
export function newTabTitle(location: string, directoryPath?: string | null): string {
  if (location === "home") return HOME_LABEL;
  if (location === "computer") return "此电脑";
  const crumbs = breadcrumbs(directoryPath ?? location);
  return crumbs[crumbs.length - 1].label;
}

/** Address-bar segments: 此电脑 > C: > Users > …, each a folder to open. */
export function breadcrumbs(location: string): { label: string; path: string }[] {
  if (location === "home") return [{ label: HOME_LABEL, path: "home" }];
  const computer = { label: "此电脑", path: "computer" };
  if (location === "computer") return [computer];
  const match = /^([A-Za-z]:)[\\/]?(.*)$/.exec(location);
  if (!match) return [{ label: location, path: location }];
  const separator = location.includes("\\") ? "\\" : "/";
  const root = `${match[1]}${separator}`;
  const crumbs = [computer, { label: match[1].toUpperCase(), path: root }];
  let path = root;
  for (const part of match[2].split(/[\\/]/).filter(Boolean)) {
    path = path.endsWith(separator) ? `${path}${part}` : `${path}${separator}${part}`;
    crumbs.push({ label: part, path });
  }
  return crumbs;
}

/**
 * Address-bar segments. When the path is too long, leading segments collapse
 * into a "…" button (as in File Explorer) whose menu lists them.
 */
function Breadcrumbs({ crumbs, busy, navigate, onBlank }: {
  crumbs: { label: string; path: string }[];
  busy: boolean;
  navigate: (path: string) => void;
  onBlank: () => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const [hidden, setHidden] = useState(0);
  const [width, setWidth] = useState(0);
  const [menu, setMenu] = useState<FolderMenuState | null>(null);
  const key = crumbs.map((crumb) => crumb.path).join("|");

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // Start from every segment shown, then hide from the left until they fit.
  useLayoutEffect(() => { setHidden(0); }, [key, width]);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element && element.scrollWidth > element.clientWidth + 1 && hidden < crumbs.length - 1) {
      setHidden((value) => value + 1);
    }
  });

  // With every earlier segment collapsed, the current folder's name may shrink.
  const tight = hidden >= crumbs.length - 1;
  return <span className={"home-crumbs" + (tight ? " home-crumbs-tight" : "")} ref={ref} onMouseDown={(event) => {
    // Empty space switches to typing, as in File Explorer.
    const target = event.target as HTMLElement;
    if (target === event.currentTarget || target.classList.contains("home-crumbs-blank")) { event.preventDefault(); onBlank(); }
  }}>
    {hidden > 0 && <span className="home-crumb">
      <button type="button" ref={moreRef} disabled={busy} aria-label="更多上级文件夹" title="更多上级文件夹"
        onClick={() => {
          const rect = moreRef.current!.getBoundingClientRect();
          setMenu({
            x: rect.left, y: rect.bottom + 4, owner: moreRef.current!,
            items: crumbs.slice(0, hidden).reverse().map((crumb) => ({ label: crumb.label, action: () => navigate(crumb.path) })),
          });
        }}>…</button>
    </span>}
    {crumbs.slice(hidden).map((crumb, index) => <span key={crumb.path}
      className={crumb === crumbs[crumbs.length - 1] ? "home-crumb home-crumb-current" : "home-crumb"}>
      {(index > 0 || hidden > 0) && <UiIcon name="next" />}
      <button type="button" disabled={busy} aria-current={crumb === crumbs[crumbs.length - 1] ? "location" : undefined}
        onClick={() => navigate(crumb.path)}>{crumb.label}</button>
    </span>)}
    <span className="home-crumbs-blank" />
    {menu && <FolderContextMenu state={menu} label="上级文件夹" close={(restore) => {
      if (restore) moreRef.current?.focus();
      setMenu(null);
    }} />}
  </span>;
}

const LAYOUT_KEY = "reader.new-tab-layout.v1";
interface ListLayout { sidebar: number; columns: [number, number, number, number] }
const DEFAULT_LAYOUT: ListLayout = { sidebar: 228, columns: [320, 150, 120, 80] };

/** Sidebar and column widths are a per-viewer convenience kept in storage. */
function loadLayout(): ListLayout {
  try {
    const value = JSON.parse(window.localStorage.getItem(LAYOUT_KEY) ?? "null") as ListLayout | null;
    if (value && typeof value.sidebar === "number" && Array.isArray(value.columns) && value.columns.length === 4
      && value.columns.every((width) => typeof width === "number")) return value;
  } catch { /* fall back to defaults */ }
  return DEFAULT_LAYOUT;
}
function saveLayout(layout: ListLayout) {
  try { window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch { /* ignore */ }
}

/** List header: each label cell has a drag handle on its right edge. */
function ListHeading({ labels, layout, setColumn }: {
  labels: string[];
  layout: ListLayout;
  setColumn: (index: number, width: number) => void;
}) {
  return <div className="new-tab-list-heading">
    <span aria-hidden="true" />
    {labels.map((label, index) => <span key={label}>
      <span className="new-tab-heading-label">{label}</span>
      <ColumnResizer label={`调整“${label}”列宽`} width={layout.columns[index]} min={index === 0 ? 120 : 60}
        onWidthChange={(width) => setColumn(index, width)} />
    </span>)}
  </div>;
}

export function NewTabPage({ active = true, tabId }: { active?: boolean; tabId?: string }) {
  const openDocument = useWorkspace((state) => state.openDocument);
  const openDocumentFromNewTab = useWorkspace((state) => state.openDocumentFromNewTab);
  // A tab returning from a file opened by mistake comes back where it was.
  const [restored] = useState(() => peekNewTabPlace(tabId));
  useEffect(() => { clearNewTabPlace(tabId); }, [tabId]);
  const restoredSelection = useRef(restored?.selected
    ? { location: restored.history.paths[restored.history.index], path: restored.selected } : null);
  const recentFiles = useWorkspace((state) => state.recentFiles);
  const forgetRecentFile = useWorkspace((state) => state.forgetRecentFile);
  const folders = useFolderLocations();
  const [history, setHistory] = useState(() => restored?.history ?? { paths: ["home"], index: 0 });
  const page = useRef<HTMLElement>(null);
  const reveal = useRef(restoredSelection.current !== null);
  const location = history.paths[history.index];
  const isDirectory = location !== "home" && location !== "computer";
  const [locations, setLocations] = useState<LocalLocations>({ roots: [], shortcuts: [], cloud: [] });
  const [directory, setDirectory] = useState<LocalDirectory | null>(null);
  const [address, setAddress] = useState("");
  const [layout, setLayout] = useState<ListLayout>(loadLayout);
  const updateLayout = useCallback((next: (current: ListLayout) => ListLayout) => {
    setLayout((current) => { const value = next(current); saveLayout(value); return value; });
  }, []);
  const setColumn = useCallback((index: number, width: number) => updateLayout((current) => {
    const columns = [...current.columns] as ListLayout["columns"];
    columns[index] = width;
    return { ...current, columns };
  }), [updateLayout]);
  const [editingAddress, setEditingAddress] = useState(false);
  const addressInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<FolderMenuState | null>(null);
  const [newFileFolder, setNewFileFolder] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [openError, setOpenError] = useState<OpenFileError | null>(null);
  /** Recent files confirmed missing; checked in the background, never at startup. */
  const [missing, setMissing] = useState<ReadonlySet<string>>(() => new Set());
  const [now, setNow] = useState(Date.now);
  const request = useRef(0);
  const qualified = useRef(false);
  const busy = pending !== null;
  const moveHistory = useCallback((delta: -1 | 1) => {
    if (busy || newFileFolder) return;
    setMenu(null);
    setHistory((previous) => {
      const index = Math.max(0, Math.min(previous.index + delta, previous.paths.length - 1));
      return index === previous.index ? previous : { ...previous, index };
    });
  }, [busy, newFileFolder]);

  useEffect(() => {
    if (!active) return;
    const sideButton = (event: globalThis.MouseEvent) => {
      if (event.button !== 3 && event.button !== 4) return;
      // Consume the complete sequence so WebView history never replaces folder history.
      event.preventDefault();
      event.stopPropagation();
      if (event.type === "mouseup") moveHistory(event.button === 3 ? -1 : 1);
    };
    const events = ["mousedown", "mouseup", "auxclick"] as const;
    for (const type of events) document.addEventListener(type, sideButton, true);
    return () => {
      for (const type of events) document.removeEventListener(type, sideButton, true);
    };
  }, [active, moveHistory]);

  const fixed = useMemo(() => fixedFolders(locations.shortcuts, folders).filter((folder) =>
    !locations.cloud.some((cloud) => folderIdentity(cloud.path) === folderIdentity(folder.path))),
    [locations.shortcuts, locations.cloud, folders.pinned, folders.hiddenDefaults]);
  const frequent = useMemo(() => frequentFolders(folders.visits, [...fixed, ...locations.roots, ...locations.cloud], now),
    [folders.visits, fixed, locations.roots, locations.cloud, now]);

  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, 60_000);
    window.addEventListener("focus", update);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", update); };
  }, []);
  useEffect(() => { qualified.current = false; }, [location]);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    let sequence = 0;
    const update = () => {
      if (document.hidden) return;
      const id = ++sequence;
      void invoke<LocalLocations>("get_local_locations").then((value) => {
        if (alive && sequence === id) setLocations(value);
      }).catch((cause) => { if (alive && sequence === id) setError(`无法加载本地位置：${errorMessage(cause)}`); });
    };
    update();
    const timer = window.setInterval(() => { if (document.hasFocus()) update(); }, 30_000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [revision, active]);
  useEffect(() => {
    const id = ++request.current;
    setError(null);
    setQuery("");
    setMenu(null);
    if (restoredSelection.current?.location !== location) restoredSelection.current = null;
    setSelected(restoredSelection.current?.path ?? null);
    setDirectory(null);
    setAddress(isDirectory ? location : location === "home" ? HOME_LABEL : "此电脑");
    setLoading(isDirectory);
    if (!isDirectory) return;
    void invoke<LocalDirectory>("list_local_directory", { path: location }).then((value) => {
      if (request.current !== id) return;
      setDirectory(value);
      setAddress(value.path);
    }).catch((cause) => {
      if (request.current === id) setError(errorMessage(cause));
    }).finally(() => { if (request.current === id) setLoading(false); });
    return () => { request.current++; };
  }, [location, isDirectory, revision]);

  // A directory becomes meaningful only after uninterrupted foreground use.
  // Refresh does not reset qualification; hidden tabs and blurred windows do not count.
  useEffect(() => {
    if (!directory || !active || !isDirectory) return;
    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      if (qualified.current || document.hidden || !document.hasFocus()) return;
      timer = window.setTimeout(() => {
        if (document.hidden || !document.hasFocus()) return;
        qualified.current = true;
        folders.recordVisit(directory.path);
      }, BROWSE_DWELL_MS);
    };
    const stop = () => window.clearTimeout(timer);
    schedule();
    window.addEventListener("focus", schedule);
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", schedule);
    return () => {
      stop();
      window.removeEventListener("focus", schedule);
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [directory, active, isDirectory, location, folders.recordVisit]);

  // Each path is checked separately, so a slow or offline drive delays only
  // its own row. Re-check whenever the home list is shown again.
  useEffect(() => {
    if (!active || location !== "home") return;
    let alive = true;
    for (const file of recentFiles) {
      void invoke<boolean>("local_file_missing", { path: file.path }).then((gone) => {
        if (!alive) return;
        setMissing((current) => {
          if (current.has(file.path) === gone) return current;
          const next = new Set(current);
          if (gone) next.add(file.path); else next.delete(file.path);
          return next;
        });
      }).catch(() => {});
    }
    return () => { alive = false; };
  }, [active, location, recentFiles, revision]);

  // The tab is named after the place it shows, like a File Explorer window.
  const setNewTabTitle = useWorkspace((state) => state.setNewTabTitle);
  const setNewTabPlace = useWorkspace((state) => state.setNewTabPlace);
  useEffect(() => {
    if (tabId) setNewTabPlace(tabId, isDirectory ? "folder" : location === "home" ? "home" : "computer");
  }, [tabId, isDirectory, location, setNewTabPlace]);
  const title = newTabTitle(location, directory?.path);
  useEffect(() => {
    if (tabId) void setNewTabTitle(tabId, title).catch(() => {});
  }, [tabId, title, setNewTabTitle]);

  // Bring the file that was opened by mistake back into view, focused, so
  // the right one next to it is a double-click or arrow key away.
  useEffect(() => {
    if (!reveal.current || !active || restoredSelection.current?.location !== location) return;
    const item = page.current?.querySelector<HTMLElement>(".home-body [data-selected]");
    if (!item) return;
    reveal.current = false;
    item.scrollIntoView({ block: "nearest" });
    item.focus({ preventScroll: true });
  }, [active, location, directory, selected, recentFiles]);

  const closeMenu = useCallback((restoreFocus: boolean) => {
    setMenu((current) => {
      if (restoreFocus && current?.owner.isConnected) current.owner.focus();
      return null;
    });
  }, []);
  useEffect(() => { if (!active) setMenu(null); }, [active]);
  const navigate = (path: string) => {
    if (busy || newFileFolder) return;
    setMenu(null);
    setHistory((previous) => path === previous.paths[previous.index] ? previous
      : { paths: [...previous.paths.slice(0, previous.index + 1), path], index: previous.index + 1 });
  };
  const fileName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;
  const reopen = async (path: string, fromRecent = false, inNewTab = false) => {
    setError(null);
    const removable = fromRecent;
    if (fromRecent && missing.has(path)) {
      setOpenError({ path, name: fileName(path), missing: true, removable });
      return;
    }
    setPending(path);
    try {
      if (tabId) await openDocumentFromNewTab(tabId, path, { history, selected: path }, inNewTab);
      else await openDocument(path);
    }
    catch (cause) {
      const gone = await invoke<boolean>("local_file_missing", { path }).catch(() => false);
      if (gone && fromRecent) setMissing((current) => new Set(current).add(path));
      setOpenError({ path, name: fileName(path), missing: gone, message: errorMessage(cause), removable });
    }
    finally { setPending(null); }
  };

  const showFolderMenu = (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>, folder: FolderLocation, background = false) => {
    event.preventDefault();
    event.stopPropagation();
    if (busy || newFileFolder) return;
    const owner = event.currentTarget;
    const rect = owner.getBoundingClientRect();
    const x = "clientX" in event && event.clientX ? event.clientX : rect.left + 12;
    const y = "clientY" in event && event.clientY ? event.clientY : rect.bottom;
    const pinned = fixedFolders(locations.shortcuts, folders).some((item) => folderIdentity(item.path) === folderIdentity(folder.path));
    const isDefault = locations.shortcuts.some((item) => folderIdentity(item.path) === folderIdentity(folder.path));
    setMenu({ x, y, owner, items: [
      ...(background ? [{ label: "新建 Markdown", action: () => setNewFileFolder(folder.path) }] : []),
      { label: pinned ? "取消固定" : "固定到侧栏", action: () => folders.setPinned(folder, !pinned, isDefault) },
    ] });
  };
  /** Files offer opening here or in a new tab, which keeps this page open. */
  const showFileMenu = (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>, path: string, fromRecent = false) => {
    event.preventDefault();
    event.stopPropagation();
    setSelected(path);
    if (busy || newFileFolder) return;
    const owner = event.currentTarget;
    const rect = owner.getBoundingClientRect();
    const x = "clientX" in event && event.clientX ? event.clientX : rect.left + 12;
    const y = "clientY" in event && event.clientY ? event.clientY : rect.bottom;
    setMenu({ x, y, owner, items: [
      { label: "打开", action: () => void reopen(path, fromRecent) },
      { label: "在新标签页中打开", action: () => void reopen(path, fromRecent, true), disabled: !tabId },
    ] });
  };
  const fileKeyboard = (event: KeyboardEvent<HTMLElement>, path: string, fromRecent = false) => {
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) showFileMenu(event, path, fromRecent);
  };
  const folderKeyboard = (event: KeyboardEvent<HTMLElement>, folder: FolderLocation) => {
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) showFolderMenu(event, folder);
  };
  const createFile = async (name: string) => {
    if (!newFileFolder) return;
    setPending("new-markdown");
    try {
      const path = await invoke<string>("create_local_markdown", { directory: newFileFolder, fileName: name });
      setNewFileFolder(null);
      try { await openDocument(path); }
      catch (cause) {
        setError(`已创建 ${path}，但无法打开：${errorMessage(cause)}`);
        setRevision((value) => value + 1);
      }
    } finally { setPending(null); }
  };
  /**
   * Main-area items follow File Explorer: a single click only selects,
   * double-click or Enter opens the file or enters the folder.
   */
  const itemProps = (path: string, open: () => void) => ({
    "data-selected": selected === path ? "" : undefined,
    onClick: () => setSelected(path),
    onDoubleClick: () => { setSelected(path); open(); },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      setSelected(path);
      open();
    },
  });
  const matches = (name: string, path: string) => `${name} ${path}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const visibleFiles = recentFiles.filter((file) => matches(file.file_name, file.path));
  const entries = directory?.entries.filter((entry) => matches(entry.name, entry.path)) ?? [];
  const currentFolder = directory ? { path: directory.path, name: folderName(directory.path) } : null;

  const navItem = (folder: FolderLocation, icon: UiIconName, pinned = false, context = true) => (
    <button type="button" className="home-nav-item" key={folder.path} title={folder.path === "home" ? folder.name : folder.path}
      aria-current={folderIdentity(location) === folderIdentity(folder.path) ? "page" : undefined}
      disabled={busy} onClick={() => navigate(folder.path)}
      onContextMenu={context ? (event) => showFolderMenu(event, folder) : undefined}
      onKeyDown={context ? (event) => folderKeyboard(event, folder) : undefined}>
      <UiIcon name={icon} /><span className="home-nav-name">{folder.name}</span>
      {pinned && <span className="home-pin" role="img" aria-label="已固定" title="已固定"><UiIcon name="pin" /></span>}
    </button>
  );

  return <main className="new-tab-page" ref={page} style={{
    gridTemplateColumns: `${layout.sidebar}px minmax(0, 1fr)`,
    ["--list-columns" as string]: `16px ${layout.columns.map((width) => `${width}px`).join(" ")}`,
  }}>
    <div className="home-navigation" aria-label="文件夹导航">
      <button type="button" className="home-icon-button" aria-label="后退" disabled={busy || !!newFileFolder || history.index === 0} onClick={() => moveHistory(-1)}><UiIcon name="back" /></button>
      <button type="button" className="home-icon-button" aria-label="前进" disabled={busy || !!newFileFolder || history.index === history.paths.length - 1} onClick={() => moveHistory(1)}><UiIcon name="forward" /></button>
      <button type="button" className="home-icon-button" aria-label="上一级" disabled={busy || !isDirectory || !directory} onClick={() => navigate(directory?.parent ?? "computer")}><UiIcon name="up" /></button>
      <button type="button" className="home-icon-button" aria-label="刷新" disabled={busy || loading} onClick={() => setRevision((value) => value + 1)}><UiIcon name="refresh" /></button>
      <form className={"home-address" + (editingAddress ? " home-address-editing" : "")} onSubmit={(event) => {
          event.preventDefault();
          const path = address.trim().replace(/^"|"$/g, "");
          if (path) navigate(path === HOME_LABEL || path === "主页" ? "home" : path === "此电脑" ? "computer" : path);
          addressInput.current?.blur();
        }}>
          <UiIcon name={isDirectory ? "folder" : location === "home" ? "clock" : "computer"} />
          <input ref={addressInput} aria-label="文件夹路径" value={address} disabled={busy}
            onChange={(event) => setAddress(event.target.value)}
            onFocus={(event) => { setEditingAddress(true); event.target.select(); }}
            onBlur={() => { setEditingAddress(false); setAddress(directory?.path ?? (isDirectory ? location : location === "home" ? HOME_LABEL : "此电脑")); }}
            onKeyDown={(event) => { if (event.key === "Escape") event.currentTarget.blur(); }} />
          {!editingAddress && <Breadcrumbs crumbs={breadcrumbs(directory?.path ?? location)} busy={busy}
            navigate={navigate} onBlank={() => addressInput.current?.focus()} />}
        </form>
      <label className="home-search"><UiIcon name="search" /><input aria-label="筛选当前列表"
        placeholder={isDirectory ? "搜索此文件夹" : location === "home" ? "搜索最近文件" : "搜索磁盘"}
        value={query} onChange={(event) => setQuery(event.target.value)} />
        <button type="button" className="home-icon-button" aria-label="清除筛选" hidden={!query} onClick={() => setQuery("")}><UiIcon name="close" /></button>
      </label>
    </div>
    <aside className="home-sidebar" aria-label="本地文件导航">
      <SidebarResizer kind="home" label="调整侧栏宽度" width={layout.sidebar}
        onWidthChange={(sidebar) => updateLayout((current) => ({ ...current, sidebar }))} />
      <nav>
        {navItem({ name: HOME_LABEL, path: "home" }, "clock", false, false)}
        {!!locations.cloud.length && <div className="home-cloud-links" aria-label="同步文件夹">
          {locations.cloud.map((folder) => navItem(folder, "cloud", false, false))}
        </div>}
        <div className="home-folder-links" aria-label="文件夹">
          {fixed.map((folder) => navItem(folder, "folder", true))}
          {frequent.map((folder) => navItem(folder, "folder"))}
        </div>
        <div className="home-drive-links" aria-label="磁盘">
          {locations.roots.map((folder) => navItem(folder, "computer"))}
        </div>
      </nav>
    </aside>
    <div className="home-workspace">
      {error && <p className="new-tab-error" role="alert">{error}</p>}
      <div className="home-body" aria-busy={loading} tabIndex={isDirectory ? 0 : undefined}
        onClick={(event) => { if (!(event.target as HTMLElement).closest("button")) setSelected(null); }}
        onContextMenu={(event) => {
          if (!currentFolder || (event.target as HTMLElement).closest("button, input")) return;
          showFolderMenu(event, currentFolder, true);
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget || !currentFolder) return;
          if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) showFolderMenu(event, currentFolder, true);
        }}>
        {location === "home" ? <section className="new-tab-recent" aria-label="最近打开">
          <ListHeading labels={["名称", "打开时间", "类型", "大小"]} layout={layout} setColumn={setColumn} />
          {visibleFiles.length ? <div className="new-tab-recent-list">{visibleFiles.map((file) => (
            <button type="button" className="new-tab-recent-item" key={file.path} title={file.path} disabled={busy} data-missing={missing.has(file.path) ? "" : undefined}
              {...itemProps(file.path, () => void reopen(file.path, true))}
              onContextMenu={(event) => showFileMenu(event, file.path, true)}
              onKeyDown={(event) => { fileKeyboard(event, file.path, true); itemProps(file.path, () => void reopen(file.path, true)).onKeyDown(event); }}>
              <span className="new-tab-recent-icon"><DocumentTypeIcon type={file.doc_type} /></span>
              <span className="new-tab-recent-copy"><strong>{file.file_name}</strong>{missing.has(file.path) && <small className="home-missing-tag">已不存在</small>}</span>
              <span className="new-tab-recent-time" title={file.opened_at ? new Date(file.opened_at).toLocaleString() : "打开时间未记录"}>{pending === file.path ? "打开中…" : openedTime(file.opened_at)}</span>
              <span className="new-tab-recent-type">{typeLabel(file.doc_type)}</span>
              <span className="new-tab-recent-size" title="最近读取的文件大小">{fileSize(file.file_size)}</span>
            </button>
          ))}</div> : <p className="home-empty-note">{query ? "没有匹配的最近文件" : "暂无最近文件"}</p>}
        </section> : location === "computer" ? <section aria-label="本地磁盘">
          <div className="home-drive-grid">{locations.roots.filter((root) => matches(root.name, root.path)).map((root) => (
            <button type="button" className="home-drive" key={root.path} disabled={busy} {...itemProps(root.path, () => navigate(root.path))}
              onContextMenu={(event) => showFolderMenu(event, root)}
              onKeyDown={(event) => { folderKeyboard(event, root); itemProps(root.path, () => navigate(root.path)).onKeyDown(event); }}>
              <UiIcon name="computer" /><span><strong>{root.name}</strong><small>{root.path}</small></span>
            </button>
          ))}</div>
          {!locations.roots.length && !error && <p className="home-empty-note">暂无可用本地磁盘，请刷新或输入文件夹路径</p>}
        </section> : <section aria-label="当前文件夹">
          <ListHeading labels={["名称", "修改日期", "类型", "大小"]} layout={layout} setColumn={setColumn} />
          {loading ? <p className="home-empty-note" role="status">正在读取文件夹…</p> : <div>{entries.map((entry) => (
            <button type="button" className="new-tab-recent-item home-directory-entry" key={entry.path} title={entry.path} disabled={busy}
              {...itemProps(entry.path, () => entry.is_dir ? navigate(entry.path) : void reopen(entry.path))}
              onContextMenu={(event) => {
                setSelected(entry.path);
                if (entry.is_dir) showFolderMenu(event, { path: entry.path, name: entry.name });
                else showFileMenu(event, entry.path);
              }}
              onKeyDown={(event) => {
                if (entry.is_dir) folderKeyboard(event, { path: entry.path, name: entry.name });
                else fileKeyboard(event, entry.path);
                itemProps(entry.path, () => entry.is_dir ? navigate(entry.path) : void reopen(entry.path)).onKeyDown(event);
              }}>
              <span className="new-tab-recent-icon">{entry.is_dir ? <UiIcon name="folder" /> : <DocumentTypeIcon type={documentType(entry.path)} />}</span>
              <span className="new-tab-recent-copy"><strong>{entry.name}</strong></span>
              <span className="new-tab-recent-time">{openedTime(entry.modified_at)}</span>
              <span className="new-tab-recent-type">{typeLabel(entry.is_dir ? "folder" : documentType(entry.path))}</span>
              <span className="new-tab-recent-size">{entry.is_dir ? "—" : fileSize(entry.file_size)}</span>
            </button>
          ))}</div>}
          {!loading && directory && !entries.length && <p className="home-empty-note">{query ? "没有匹配的文件或文件夹" : "此文件夹没有子文件夹或 PDF / Markdown 文件"}</p>}
          {!!directory?.skipped && <p className="home-empty-note">{directory.skipped} 个项目无法读取，已跳过</p>}
        </section>}
      </div>
    </div>
    {menu && active && <FolderContextMenu state={menu} close={closeMenu} />}
    {openError && active && <OpenFileErrorDialog error={openError} close={() => setOpenError(null)}
      remove={() => { forgetRecentFile(openError.path); setOpenError(null); }} />}
    {newFileFolder && active && <NewMarkdownDialog directory={newFileFolder} create={createFile} cancel={() => setNewFileFolder(null)} />}
  </main>;
}
