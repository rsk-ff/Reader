import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useWorkspace } from "../workspace/store";
import { folderIdentity, folderName, frequentFolders, useFolderLocations, type FolderLocation } from "../workspace/folderLocations";
import { documentType, type LocalDirectory, type LocalLocations } from "../workspace/localFiles";
import { DocumentTypeIcon } from "./DocumentTypeIcon";
import { UiIcon, type UiIconName } from "./UiIcon";
import { brandIcons } from "./brandIcons";

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

export function NewTabPage() {
  const openDocument = useWorkspace((state) => state.openDocument);
  const createMarkdownDocument = useWorkspace((state) => state.createMarkdownDocument);
  const recentFiles = useWorkspace((state) => state.recentFiles);
  const pinned = useFolderLocations((state) => state.pinned);
  const visits = useFolderLocations((state) => state.visits);
  const togglePin = useFolderLocations((state) => state.togglePin);
  const recordVisit = useFolderLocations((state) => state.recordVisit);
  const frequent = useMemo(() => frequentFolders(visits, recentFiles), [visits, recentFiles]);
  const [history, setHistory] = useState({ paths: ["home"], index: 0 });
  const location = history.paths[history.index];
  const isDirectory = location !== "home" && location !== "computer";
  const [locations, setLocations] = useState<LocalLocations>({ roots: [], shortcuts: [] });
  const [directory, setDirectory] = useState<LocalDirectory | null>(null);
  const [address, setAddress] = useState("");
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const lastVisited = useRef<string | null>(null);
  const busy = pending !== null;

  useEffect(() => {
    let alive = true;
    void invoke<LocalLocations>("get_local_locations").then((value) => {
      if (alive) setLocations(value);
    }).catch((cause) => { if (alive) setError(`无法加载此电脑：${errorMessage(cause)}`); });
    return () => { alive = false; };
  }, [revision]);

  useEffect(() => {
    const id = ++request.current;
    setError(null);
    setQuery("");
    setDirectory(null);
    setAddress(isDirectory ? location : location === "home" ? "主页" : "此电脑");
    setLoading(isDirectory);
    if (!isDirectory) {
      lastVisited.current = null;
      return;
    }
    void invoke<LocalDirectory>("list_local_directory", { path: location }).then((value) => {
      if (request.current !== id) return;
      setDirectory(value);
      setAddress(value.path);
      if (lastVisited.current !== folderIdentity(value.path)) recordVisit(value.path);
      lastVisited.current = folderIdentity(value.path);
    }).catch((cause) => {
      if (request.current === id) setError(errorMessage(cause));
    }).finally(() => { if (request.current === id) setLoading(false); });
    return () => { request.current++; };
  }, [location, isDirectory, revision, recordVisit]);

  const navigate = (path: string) => {
    if (busy) return;
    setHistory((previous) => path === previous.paths[previous.index] ? previous
      : { paths: [...previous.paths.slice(0, previous.index + 1), path], index: previous.index + 1 });
  };

  const run = async (key: string, action: () => Promise<void>) => {
    setError(null);
    setPending(key);
    try { await action(); }
    catch (cause) { setError(`操作失败：${errorMessage(cause)}`); }
    finally { setPending(null); }
  };

  const chooseFile = () => run("open", async () => {
    const selection = await open({ title: "打开文件", multiple: false, directory: false,
      filters: [{ name: "Reader 文件", extensions: ["pdf", "md", "markdown"] }] });
    const path = Array.isArray(selection) ? selection[0] : selection;
    if (path) await openDocument(path);
  });

  const addPinned = () => run("pin", async () => {
    const selection = await open({ title: "固定文件夹", multiple: false, directory: true });
    const path = Array.isArray(selection) ? selection[0] : selection;
    if (!path) return;
    const value = await invoke<LocalDirectory>("list_local_directory", { path });
    if (!useFolderLocations.getState().pinned.some((item) => folderIdentity(item.path) === folderIdentity(value.path))) {
      togglePin({ path: value.path, name: folderName(value.path) });
    }
  });

  const matches = (name: string, path: string) => `${name} ${path}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const visibleFiles = recentFiles.filter((file) => matches(file.file_name, file.path));
  const entries = directory?.entries.filter((entry) => matches(entry.name, entry.path)) ?? [];
  const currentPath = directory?.path ?? location;
  const currentPinned = pinned.some((item) => folderIdentity(item.path) === folderIdentity(currentPath));

  const navItem = (name: string, path: string, icon: UiIconName) => (
    <button type="button" className="home-nav-item" key={path} title={isDirectory || path !== "home" ? path : name}
      aria-current={location === path ? "page" : undefined} disabled={busy} onClick={() => navigate(path)}>
      <UiIcon name={icon} /><span>{name}</span>
    </button>
  );

  const folderSection = (title: string, folders: FolderLocation[], pinControls: boolean) => (
    <section className="home-folder-section" aria-label={title}>
      <header><h2>{title}</h2>{pinControls && <button type="button" className="home-text-button" disabled={busy} onClick={() => void addPinned()}><UiIcon name="plus" />添加文件夹</button>}</header>
      {folders.length ? <div className="home-folder-grid">{folders.filter((folder) => matches(folder.name, folder.path)).map((folder) => (
        <div className="home-folder-tile" key={folder.path}>
          <button type="button" className="home-folder-open" title={folder.path} disabled={busy} onClick={() => navigate(folder.path)}>
            <UiIcon name="folder" /><span><strong>{folder.name}</strong><small>{folder.path}</small></span>
          </button>
          {pinControls && <button type="button" className="home-icon-button" aria-label={`取消固定 ${folder.name}`} title="取消固定" disabled={busy} onClick={() => togglePin(folder)}><UiIcon name="pin" /></button>}
        </div>
      ))}</div> : <p className="home-empty-note">{pinControls ? "固定常用文件夹，方便下次访问" : "打开文件或浏览文件夹后会显示在这里"}</p>}
    </section>
  );

  return (
    <main className="new-tab-page">
      <aside className="home-sidebar" aria-label="本地文件导航">
        <div className="new-tab-hero"><img src={brandIcons.reader} alt="" width="28" height="28" /><h1>Reader</h1></div>
        <nav>
          {navItem("主页", "home", "home")}
          {navItem("此电脑", "computer", "computer")}
          <section className="home-nav-group" aria-label="常用位置"><h2>常用位置</h2>{locations.shortcuts.map((folder) => navItem(folder.name, folder.path, "folder"))}</section>
          <section className="home-nav-group" aria-label="固定文件夹">
            <header><h2>固定文件夹</h2><button type="button" className="home-icon-button" aria-label="添加固定文件夹" title="添加固定文件夹" disabled={busy} onClick={() => void addPinned()}><UiIcon name="plus" /></button></header>
            {pinned.map((folder) => <div className="home-pinned-row" key={folder.path}>
              {navItem(folder.name, folder.path, "folder")}
              <button type="button" className="home-icon-button" aria-label={`从导航取消固定 ${folder.name}`} title="取消固定" disabled={busy} onClick={() => togglePin(folder)}><UiIcon name="pin" /></button>
            </div>)}
          </section>
          <section className="home-nav-group" aria-label="最近常用文件夹"><h2>最近常用</h2>{frequent.map((folder) => navItem(folder.name, folder.path, "clock"))}</section>
          <section className="home-nav-group" aria-label="本地磁盘"><h2>本地磁盘</h2>{locations.roots.map((folder) => navItem(folder.name, folder.path, "computer"))}</section>
        </nav>
      </aside>
      <div className="home-workspace">
        <div className="home-navigation" aria-label="文件夹导航">
          <button type="button" className="home-icon-button" aria-label="后退" disabled={busy || history.index === 0} onClick={() => setHistory((value) => ({ ...value, index: value.index - 1 }))}><UiIcon name="back" /></button>
          <button type="button" className="home-icon-button" aria-label="前进" disabled={busy || history.index === history.paths.length - 1} onClick={() => setHistory((value) => ({ ...value, index: value.index + 1 }))}><UiIcon name="forward" /></button>
          <button type="button" className="home-icon-button" aria-label="上一级" disabled={busy || !isDirectory || !directory} onClick={() => navigate(directory?.parent ?? "computer")}><UiIcon name="up" /></button>
          <button type="button" className="home-icon-button" aria-label="刷新" disabled={busy || loading} onClick={() => setRevision((value) => value + 1)}><UiIcon name="refresh" /></button>
          <form className="home-address" onSubmit={(event) => { event.preventDefault(); const path = address.trim().replace(/^"|"$/g, ""); if (path) navigate(path === "主页" ? "home" : path === "此电脑" ? "computer" : path); }}>
            <UiIcon name={isDirectory ? "folder" : location === "home" ? "home" : "computer"} />
            <input aria-label="文件夹路径" value={address} disabled={busy} onChange={(event) => setAddress(event.target.value)} onFocus={(event) => event.target.select()} />
          </form>
          <label className="home-search"><UiIcon name="search" /><input aria-label="筛选当前列表" placeholder={isDirectory ? "搜索此文件夹" : location === "home" ? "搜索最近文件和文件夹" : "搜索磁盘"} value={query} onChange={(event) => setQuery(event.target.value)} /><button type="button" className="home-icon-button" aria-label="清除筛选" hidden={!query} onClick={() => setQuery("")}><UiIcon name="close" /></button></label>
        </div>
        <div className="home-command-bar" aria-label="文件操作">
          <button type="button" className="home-text-button" disabled={busy} onClick={() => void chooseFile()}><UiIcon name="folder" />打开文件</button>
          <button type="button" className="home-text-button" disabled={busy} onClick={() => void run("new-markdown", createMarkdownDocument)}><UiIcon name="plus" />新建 Markdown</button>
          {isDirectory && <button type="button" className="home-text-button" disabled={busy || !directory} onClick={() => togglePin({ path: currentPath, name: folderName(currentPath) })}><UiIcon name="pin" />{currentPinned ? "取消固定此文件夹" : "固定此文件夹"}</button>}
        </div>
        {error && <p className="new-tab-error" role="alert">{error}</p>}
        <div className="home-body" aria-busy={loading}>
          {location === "home" ? <>
            {folderSection("固定文件夹", pinned, true)}
            {folderSection("最近常用文件夹", frequent, false)}
            <section className="new-tab-recent" aria-labelledby="recent-files-title">
              <header><h2 id="recent-files-title"><UiIcon name="clock" />最近打开</h2><span>{visibleFiles.length} 个文件</span></header>
              <div className="new-tab-list-heading" aria-hidden="true"><span>文档</span><span>打开时间</span><span>大小</span></div>
              {visibleFiles.length > 0 ? <div className="new-tab-recent-list">{visibleFiles.map((file) => (
                <button type="button" className="new-tab-recent-item" key={file.path} title={file.path} disabled={busy} onClick={() => void run(file.path, () => openDocument(file.path))}>
                  <span className="new-tab-recent-icon"><DocumentTypeIcon type={file.doc_type} /></span>
                  <span className="new-tab-recent-copy"><strong>{file.file_name}</strong><small>{file.path}</small></span>
                  <span className="new-tab-recent-time" title={file.opened_at ? new Date(file.opened_at).toLocaleString() : "打开时间未记录"}>{pending === file.path ? "打开中…" : openedTime(file.opened_at)}</span>
                  <span className="new-tab-recent-size" title="最近读取的文件大小">{fileSize(file.file_size)}</span>
                </button>
              ))}</div> : <p className="home-empty-note">{query ? "没有匹配的最近文件" : "暂无最近文件"}</p>}
            </section>
          </> : location === "computer" ? <section aria-label="此电脑磁盘"><h2>此电脑</h2><div className="home-drive-grid">{locations.roots.filter((root) => matches(root.name, root.path)).map((root) => <button type="button" className="home-drive" key={root.path} disabled={busy} onClick={() => navigate(root.path)}><UiIcon name="computer" /><span><strong>{root.name}</strong><small>{root.path}</small></span></button>)}</div>{!locations.roots.length && !error && <p className="home-empty-note">暂无可用本地磁盘，请刷新或输入文件夹路径</p>}</section>
            : <section aria-label="当前文件夹"><header className="home-directory-title"><h2>{directory ? folderName(directory.path) : folderName(location)}</h2><span>PDF / Markdown</span></header>
              <div className="new-tab-list-heading" aria-hidden="true"><span>名称</span><span>修改时间</span><span>大小</span></div>
              {loading ? <p className="home-empty-note" role="status">正在读取文件夹…</p> : <div>{entries.map((entry) => <button type="button" className="new-tab-recent-item home-directory-entry" key={entry.path} title={entry.path} disabled={busy} onClick={() => entry.is_dir ? navigate(entry.path) : void run(entry.path, () => openDocument(entry.path))}>
                <span className="new-tab-recent-icon">{entry.is_dir ? <UiIcon name="folder" /> : <DocumentTypeIcon type={documentType(entry.path)} />}</span>
                <span className="new-tab-recent-copy"><strong>{entry.name}</strong><small>{entry.is_dir ? "文件夹" : documentType(entry.path) === "pdf" ? "PDF 文档" : "Markdown 文档"}</small></span>
                <span className="new-tab-recent-time">{openedTime(entry.modified_at)}</span><span className="new-tab-recent-size">{entry.is_dir ? "—" : fileSize(entry.file_size)}</span>
              </button>)}</div>}
              {!loading && directory && !entries.length && <p className="home-empty-note">{query ? "没有匹配的文件或文件夹" : "此文件夹没有子文件夹或 PDF / Markdown 文件"}</p>}
              {!!directory?.skipped && <p className="home-empty-note">{directory.skipped} 个项目无法读取，已跳过</p>}
            </section>}
        </div>
      </div>
    </main>
  );
}
