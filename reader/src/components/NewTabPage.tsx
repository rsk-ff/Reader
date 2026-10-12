import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type KeyboardEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useWorkspace } from "../workspace/store";
import { BROWSE_DWELL_MS, fixedFolders, folderIdentity, folderName, frequentFolders, useFolderLocations, type FolderLocation } from "../workspace/folderLocations";
import { documentType, type LocalDirectory, type LocalLocations } from "../workspace/localFiles";
import { DocumentTypeIcon } from "./DocumentTypeIcon";
import { UiIcon, type UiIconName } from "./UiIcon";
import { FolderContextMenu, type FolderMenuState } from "./FolderContextMenu";
import { NewMarkdownDialog } from "./NewMarkdownDialog";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function openedTime(timestamp?: number | null): string {
  if (!timestamp) return "—";
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
function fileSize(bytes?: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const unit = bytes < 1024 ** 2 ? 1024 : bytes < 1024 ** 3 ? 1024 ** 2 : 1024 ** 3;
  return `${(bytes / unit).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit === 1024 ? "KB" : unit === 1024 ** 2 ? "MB" : "GB"}`;
}

export function NewTabPage({ active = true }: { active?: boolean }) {
  const openDocument = useWorkspace((state) => state.openDocument);
  const recentFiles = useWorkspace((state) => state.recentFiles);
  const folders = useFolderLocations();
  const [history, setHistory] = useState({ paths: ["home"], index: 0 });
  const location = history.paths[history.index];
  const isDirectory = location !== "home" && location !== "computer";
  const [locations, setLocations] = useState<LocalLocations>({ roots: [], shortcuts: [], cloud: [] });
  const [directory, setDirectory] = useState<LocalDirectory | null>(null);
  const [address, setAddress] = useState("");
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<FolderMenuState | null>(null);
  const [newFileFolder, setNewFileFolder] = useState<string | null>(null);
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
    setDirectory(null);
    setAddress(isDirectory ? location : location === "home" ? "主页" : "此电脑");
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
  const reopen = async (path: string) => {
    setError(null);
    setPending(path);
    try { await openDocument(path); }
    catch (cause) { setError(`无法打开文件：${errorMessage(cause)}`); }
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
  const matches = (name: string, path: string) => `${name} ${path}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const visibleFiles = recentFiles.filter((file) => matches(file.file_name, file.path));
  const entries = directory?.entries.filter((entry) => matches(entry.name, entry.path)) ?? [];
  const currentFolder = directory ? { path: directory.path, name: folderName(directory.path) } : null;

  const navItem = (folder: FolderLocation, icon: UiIconName, pinned = false, context = true) => (
    <button type="button" className="home-nav-item" key={folder.path} title={folder.path}
      aria-current={folderIdentity(location) === folderIdentity(folder.path) ? "page" : undefined}
      disabled={busy} onClick={() => navigate(folder.path)}
      onContextMenu={context ? (event) => showFolderMenu(event, folder) : undefined}
      onKeyDown={context ? (event) => folderKeyboard(event, folder) : undefined}>
      <UiIcon name={icon} /><span className="home-nav-name">{folder.name}</span>
      {pinned && <span className="home-pin" role="img" aria-label="已固定" title="已固定"><UiIcon name="pin" /></span>}
    </button>
  );

  return <main className="new-tab-page">
    <aside className="home-sidebar" aria-label="本地文件导航">
      <nav>
        {navItem({ name: "主页", path: "home" }, "home", false, false)}
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
      <div className="home-navigation" aria-label="文件夹导航">
        <button type="button" className="home-icon-button" aria-label="后退" disabled={busy || !!newFileFolder || history.index === 0} onClick={() => moveHistory(-1)}><UiIcon name="back" /></button>
        <button type="button" className="home-icon-button" aria-label="前进" disabled={busy || !!newFileFolder || history.index === history.paths.length - 1} onClick={() => moveHistory(1)}><UiIcon name="forward" /></button>
        <button type="button" className="home-icon-button" aria-label="上一级" disabled={busy || !isDirectory || !directory} onClick={() => navigate(directory?.parent ?? "computer")}><UiIcon name="up" /></button>
        <button type="button" className="home-icon-button" aria-label="刷新" disabled={busy || loading} onClick={() => setRevision((value) => value + 1)}><UiIcon name="refresh" /></button>
        <form className="home-address" onSubmit={(event) => {
          event.preventDefault();
          const path = address.trim().replace(/^"|"$/g, "");
          if (path) navigate(path === "主页" ? "home" : path === "此电脑" ? "computer" : path);
        }}>
          <UiIcon name={isDirectory ? "folder" : location === "home" ? "home" : "computer"} />
          <input aria-label="文件夹路径" value={address} disabled={busy} onChange={(event) => setAddress(event.target.value)} onFocus={(event) => event.target.select()} />
        </form>
        <label className="home-search"><UiIcon name="search" /><input aria-label="筛选当前列表"
          placeholder={isDirectory ? "搜索此文件夹" : location === "home" ? "搜索最近文件" : "搜索磁盘"}
          value={query} onChange={(event) => setQuery(event.target.value)} />
          <button type="button" className="home-icon-button" aria-label="清除筛选" hidden={!query} onClick={() => setQuery("")}><UiIcon name="close" /></button>
        </label>
      </div>
      {error && <p className="new-tab-error" role="alert">{error}</p>}
      <div className="home-body" aria-busy={loading} tabIndex={isDirectory ? 0 : undefined}
        onContextMenu={(event) => {
          if (!currentFolder || (event.target as HTMLElement).closest("button, input")) return;
          showFolderMenu(event, currentFolder, true);
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget || !currentFolder) return;
          if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) showFolderMenu(event, currentFolder, true);
        }}>
        {location === "home" ? <section className="new-tab-recent" aria-label="最近打开">
          <header><h2><UiIcon name="clock" />最近打开</h2><span>{visibleFiles.length} 个文件</span></header>
          <div className="new-tab-list-heading" aria-hidden="true"><span>文档</span><span>打开时间</span><span>大小</span></div>
          {visibleFiles.length ? <div className="new-tab-recent-list">{visibleFiles.map((file) => (
            <button type="button" className="new-tab-recent-item" key={file.path} title={file.path} disabled={busy} onClick={() => void reopen(file.path)}>
              <span className="new-tab-recent-icon"><DocumentTypeIcon type={file.doc_type} /></span>
              <span className="new-tab-recent-copy"><strong>{file.file_name}</strong><small>{file.path}</small></span>
              <span className="new-tab-recent-time" title={file.opened_at ? new Date(file.opened_at).toLocaleString() : "打开时间未记录"}>{pending === file.path ? "打开中…" : openedTime(file.opened_at)}</span>
              <span className="new-tab-recent-size" title="最近读取的文件大小">{fileSize(file.file_size)}</span>
            </button>
          ))}</div> : <p className="home-empty-note">{query ? "没有匹配的最近文件" : "暂无最近文件"}</p>}
        </section> : location === "computer" ? <section aria-label="本地磁盘">
          <div className="home-drive-grid">{locations.roots.filter((root) => matches(root.name, root.path)).map((root) => (
            <button type="button" className="home-drive" key={root.path} disabled={busy} onClick={() => navigate(root.path)}
              onContextMenu={(event) => showFolderMenu(event, root)} onKeyDown={(event) => folderKeyboard(event, root)}>
              <UiIcon name="computer" /><span><strong>{root.name}</strong><small>{root.path}</small></span>
            </button>
          ))}</div>
          {!locations.roots.length && !error && <p className="home-empty-note">暂无可用本地磁盘，请刷新或输入文件夹路径</p>}
        </section> : <section aria-label="当前文件夹">
          <header className="home-directory-title"><h2>{directory ? folderName(directory.path) : folderName(location)}</h2><span>PDF / Markdown</span></header>
          <div className="new-tab-list-heading" aria-hidden="true"><span>名称</span><span>修改时间</span><span>大小</span></div>
          {loading ? <p className="home-empty-note" role="status">正在读取文件夹…</p> : <div>{entries.map((entry) => (
            <button type="button" className="new-tab-recent-item home-directory-entry" key={entry.path} title={entry.path} disabled={busy}
              onClick={() => entry.is_dir ? navigate(entry.path) : void reopen(entry.path)}
              onContextMenu={(event) => {
                if (entry.is_dir) showFolderMenu(event, { path: entry.path, name: entry.name });
                else { event.preventDefault(); event.stopPropagation(); }
              }}
              onKeyDown={entry.is_dir ? (event) => folderKeyboard(event, { path: entry.path, name: entry.name }) : undefined}>
              <span className="new-tab-recent-icon">{entry.is_dir ? <UiIcon name="folder" /> : <DocumentTypeIcon type={documentType(entry.path)} />}</span>
              <span className="new-tab-recent-copy"><strong>{entry.name}</strong><small>{entry.is_dir ? "文件夹" : documentType(entry.path) === "pdf" ? "PDF 文档" : "Markdown 文档"}</small></span>
              <span className="new-tab-recent-time">{openedTime(entry.modified_at)}</span><span className="new-tab-recent-size">{entry.is_dir ? "—" : fileSize(entry.file_size)}</span>
            </button>
          ))}</div>}
          {!loading && directory && !entries.length && <p className="home-empty-note">{query ? "没有匹配的文件或文件夹" : "此文件夹没有子文件夹或 PDF / Markdown 文件"}</p>}
          {!!directory?.skipped && <p className="home-empty-note">{directory.skipped} 个项目无法读取，已跳过</p>}
        </section>}
      </div>
    </div>
    {menu && active && <FolderContextMenu state={menu} close={closeMenu} />}
    {newFileFolder && active && <NewMarkdownDialog directory={newFileFolder} create={createFile} cancel={() => setNewFileFolder(null)} />}
  </main>;
}
