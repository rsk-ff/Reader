//! Tauri commands exposing the workspace to the frontend (§24 API boundary).
//!
//! All file-open paths funnel through [`open_document`], whether they arrive
//! from OS double-click (single-instance plugin / opened-files event), CLI
//! args at first launch, drag-in, or a frontend File→Open action.

use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, ipc::Response};

use crate::workspace::{
    AppWorkspace, SharedWorkspace, TabId, WindowId, WindowSnapshot, MAIN_WINDOW,
};

/// Broadcast a wake-up to every open window; each re-fetches its own snapshot
/// via `get_workspace(own_label)`. Cheap (no payload) and avoids serializing
/// all windows' data to each window.
pub fn broadcast(app: &AppHandle, ws: &SharedWorkspace) {
    let ids = {
        let guard = match ws.lock() {
            Ok(g) => g,
            Err(e) => {
                log::error!("workspace lock poisoned: {e}");
                return;
            }
        };
        guard.window_ids()
    };
    for id in ids {
        let _ = app.emit_to(&id, "workspace://changed", ());
    }
}

/// The single source of truth for opening a document. Used by the
/// single-instance callback, first-launch arg parsing, and the
/// `open_document` Tauri command. Targets the main window by default
/// (single-instance / CLI have no window context).
pub fn open_document(app: &AppHandle, ws: &SharedWorkspace, path: &str) -> Result<TabId, String> {
    let mut guard = ws.lock().map_err(|e| format!("workspace lock poisoned: {e}"))?;
    guard.ensure_main();
    let tab_id = guard.open_document(path, &MAIN_WINDOW.to_string())?;
    drop(guard);
    broadcast(app, ws);
    Ok(tab_id)
}

fn collect_paths_from_args(args: &[String]) -> Vec<String> {
    // argv[0] is the executable; remaining positional tokens that look like
    // file paths are treated as documents to open.
    args.iter()
        .skip(1)
        .filter(|a| !a.starts_with('-'))
        .filter(|a| !a.is_empty())
        .cloned()
        .collect()
}

/// Called from the single-instance plugin callback when a second process is
/// launched (e.g. OS double-click while the app is already running).
/// The forwarded argv carries the new file path(s).
pub fn handle_single_instance(app: &AppHandle, argv: Vec<String>) {
    let ws = app.state::<SharedWorkspace>().inner();
    for path in collect_paths_from_args(&argv) {
        if let Err(e) = open_document(app, ws, &path) {
            log::warn!("open_document('{path}') failed: {e}");
        }
    }
    // Bring the existing window to the front so the new tab is visible.
    if let Some(win) = app.get_webview_window(MAIN_WINDOW) {
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

/// First-launch arg parsing. Runs once during setup before the window is shown.
pub fn open_initial_files(app: &AppHandle) {
    let ws = app.state::<SharedWorkspace>().inner();
    let args: Vec<String> = std::env::args().collect();
    let paths = collect_paths_from_args(&args);
    if paths.is_empty() {
        return;
    }
    for path in &paths {
        if let Err(e) = open_document(app, ws, path) {
            log::warn!("open_document('{path}') failed: {e}");
        }
    }
}

// ---- Tauri commands (frontend callable) ----

#[tauri::command]
pub fn get_workspace(
    window_id: WindowId,
    ws: State<'_, SharedWorkspace>,
) -> Result<WindowSnapshot, String> {
    let guard = ws.lock().map_err(|e| format!("workspace lock poisoned: {e}"))?;
    Ok(guard.snapshot_for(&window_id))
}

#[tauri::command]
pub fn open_document_command(
    path: String,
    window_id: WindowId,
    app: AppHandle,
    ws: State<'_, SharedWorkspace>,
) -> Result<TabId, String> {
    let mut guard = ws.lock().map_err(|e| format!("workspace lock poisoned: {e}"))?;
    guard.ensure_main();
    let tab_id = guard.open_document(&path, &window_id)?;
    drop(guard);
    broadcast(&app, &ws);
    Ok(tab_id)
}

#[tauri::command]
pub fn focus_tab(tab_id: TabId, app: AppHandle, ws: State<'_, SharedWorkspace>) -> Result<(), String> {
    let mut guard = ws.lock().map_err(|e| format!("workspace lock poisoned: {e}"))?;
    guard.focus_tab(&tab_id)?;
    drop(guard);
    broadcast(&app, &ws);
    Ok(())
}

#[tauri::command]
pub fn close_tab(tab_id: TabId, app: AppHandle, ws: State<'_, SharedWorkspace>) -> Result<(), String> {
    let close_window = {
        let mut guard = ws.lock().map_err(|e| format!("workspace lock poisoned: {e}"))?;
        let owner = guard.close_tab(&tab_id)?;
        // Non-main window with no tabs left → close the native window.
        owner != MAIN_WINDOW
            && guard
                .windows
                .get(&owner)
                .map(|w| w.tab_ids.is_empty())
                .unwrap_or(false)
    };
    if close_window {
        // Determine which window to close by re-reading; simplest: the tab's
        // owning window is gone now, so find the empty non-main window.
        let empty_win = {
            let guard = ws.lock().map_err(|e| format!("workspace lock poisoned: {e}"))?;
            guard
                .windows
                .iter()
                .find(|(id, w)| *id != MAIN_WINDOW && w.tab_ids.is_empty())
                .map(|(id, _)| id.clone())
        };
        if let Some(label) = empty_win {
            if let Some(win) = app.get_webview_window(&label) {
                let _ = win.close();
            }
        }
        return Ok(());
    }
    broadcast(&app, &ws);
    Ok(())
}

#[tauri::command]
pub fn reorder_tabs(
    window_id: WindowId,
    tab_ids: Vec<TabId>,
    app: AppHandle,
    ws: State<'_, SharedWorkspace>,
) -> Result<(), String> {
    let mut guard = ws.lock().map_err(|e| format!("workspace lock poisoned: {e}"))?;
    guard.reorder_tabs(&window_id, &tab_ids)?;
    drop(guard);
    broadcast(&app, &ws);
    Ok(())
}

/// Detach a tab into a brand-new native window. The DocumentSession is not
/// recreated — only the tab's window_id changes (§18, Test 10).
#[tauri::command]
pub fn detach_tab(
    tab_id: TabId,
    app: AppHandle,
    ws: State<'_, SharedWorkspace>,
) -> Result<WindowId, String> {
    let new_window = {
        let mut guard = ws.lock().map_err(|e| format!("workspace lock poisoned: {e}"))?;
        guard.detach_tab(&tab_id)?
    };

    // Create the native window with the same label the workspace just minted.
    let mut builder = WebviewWindowBuilder::new(
        &app,
        &new_window,
        WebviewUrl::App("index.html".into()),
    )
    .title("Reader")
    .inner_size(900.0, 700.0)
    .min_inner_size(640.0, 480.0);
    builder = builder.position(120.0, 120.0);
    builder
        .build()
        .map_err(|e| format!("create window '{new_window}': {e}"))?;
    broadcast(&app, &ws);
    Ok(new_window)
}

/// Move a tab from any window to `target_window` at `position` (drag into
/// another Reader window — §18).
#[tauri::command]
pub fn move_tab(
    tab_id: TabId,
    target_window: WindowId,
    position: usize,
    app: AppHandle,
    ws: State<'_, SharedWorkspace>,
) -> Result<(), String> {
    let mut guard = ws.lock().map_err(|e| format!("workspace lock poisoned: {e}"))?;
    guard.move_tab(&tab_id, &target_window, position)?;
    drop(guard);
    broadcast(&app, &ws);
    Ok(())
}

/// Called when a native window is destroyed (user closed it). Drops the
/// window's tab slots; the main window is kept (it may outlive its tabs).
#[tauri::command]
pub fn remove_window(
    window_id: WindowId,
    app: AppHandle,
    ws: State<'_, SharedWorkspace>,
) -> Result<(), String> {
    {
        let mut guard = ws.lock().map_err(|e| format!("workspace lock poisoned: {e}"))?;
        guard.remove_window(&window_id);
    }
    broadcast(&app, &ws);
    Ok(())
}

/// Persist the workspace to AppData for session restore (§26).
pub fn save_session_impl(app: &AppHandle, ws: &SharedWorkspace) -> Result<(), String> {
    let serialized = {
        let guard = ws.lock().map_err(|e| format!("workspace lock poisoned: {e}"))?;
        guard.serialize()
    };

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("create dir: {e}"))?;
    let path = dir.join("session.json");
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serialized.as_bytes()).map_err(|e| format!("write tmp: {e}"))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("rename: {e}"))?;
    Ok(())
}

/// Persist the workspace to AppData for session restore (§26).
#[tauri::command]
pub fn save_session(app: AppHandle, ws: State<'_, SharedWorkspace>) -> Result<(), String> {
    save_session_impl(&app, ws.inner())
}

/// Load the persisted session (§26). Called once during setup. Files passed
/// on the command line at this launch take priority — they open after restore
/// so they end up focused.
pub fn try_restore_session(app: &AppHandle) {
    let path = match app.path().app_data_dir() {
        Ok(d) => d.join("session.json"),
        Err(_) => return,
    };
    let data = match std::fs::read_to_string(&path) {
        Ok(d) => d,
        Err(_) => return,
    };
    let restored = match AppWorkspace::restore(&data) {
        Some(ws) => ws,
        None => return,
    };
    let ws = app.state::<SharedWorkspace>().inner();
    if let Ok(mut guard) = ws.lock() {
        *guard = restored;
        guard.ensure_main();
    }
    // Re-create detached native windows that were open last time (skip main —
    // it's created from tauri.conf.json).
    let detached: Vec<WindowId> = {
        let guard = match ws.lock() {
            Ok(g) => g,
            Err(_) => return,
        };
        guard
            .windows
            .keys()
            .filter(|id| *id != MAIN_WINDOW)
            .cloned()
            .collect()
    };
    for id in detached {
        let _ = WebviewWindowBuilder::new(
            app,
            &id,
            WebviewUrl::App("index.html".into()),
        )
        .title("Reader")
        .inner_size(900.0, 700.0)
        .build();
    }
    broadcast(app, ws);
}

/// Read a file's raw bytes. Used by the PDF adapter to feed `pdfjs.getDocument`.
#[tauri::command]
pub fn read_file_bytes(path: String) -> Result<Response, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("read '{path}': {e}"))?;
    Ok(Response::new(bytes))
}

/// Sink for frontend runtime errors (webview console → Rust log).
#[tauri::command]
pub fn log_frontend(level: String, message: String) {
    match level.as_str() {
        "error" => log::error!("[frontend] {message}"),
        "warn" => log::warn!("[frontend] {message}"),
        _ => log::info!("[frontend] {message}"),
    }
}

/// Read a text file as UTF-8. Used by the Markdown adapter.
#[tauri::command]
pub fn read_file_text(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("read '{path}': {e}"))?;
    String::from_utf8(bytes).map_err(|e| format!("file '{path}' is not valid UTF-8: {e}"))
}

/// Atomically write `content` to `path` (§7 transactional save):
///   foo.md → foo.md.tmp → fsync → rename → foo.md
#[tauri::command]
pub fn save_file_text(path: String, content: String) -> Result<(), String> {
    let tmp = format!("{path}.tmp");
    std::fs::write(&tmp, content.as_bytes()).map_err(|e| format!("write tmp '{tmp}': {e}"))?;
    let f = std::fs::OpenOptions::new()
        .write(true)
        .open(&tmp)
        .map_err(|e| format!("reopen tmp '{tmp}': {e}"))?;
    f.sync_all().map_err(|e| format!("fsync tmp '{tmp}': {e}"))?;
    drop(f);
    std::fs::rename(&tmp, &path).map_err(|e| format!("rename '{tmp}' -> '{path}': {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn canonicalize_path(path: String) -> Result<String, String> {
    std::fs::canonicalize(&path)
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| format!("canonicalize '{path}': {e}"))
}

/// Flip a document's dirty flag (§7).
#[tauri::command]
pub fn set_dirty(
    document_id: String,
    dirty: bool,
    app: AppHandle,
    ws: State<'_, SharedWorkspace>,
) -> Result<(), String> {
    {
        let mut guard = ws.lock().map_err(|e| format!("workspace lock poisoned: {e}"))?;
        guard.set_dirty(&document_id, dirty);
    }
    broadcast(&app, &ws);
    Ok(())
}

// ---- PDF annotation commands (§24) ----

use crate::pdf::{PdfAnnotation, PdfMutationBackend, PdfiumBackend};

fn backend() -> PdfiumBackend {
    PdfiumBackend::new()
}

#[tauri::command]
pub fn get_annotations(path: String, page_index: usize) -> Result<Vec<PdfAnnotation>, String> {
    backend().get_annotations(&path, page_index)
}

#[tauri::command]
pub fn create_annotation(
    path: String,
    annotation: PdfAnnotation,
    app: AppHandle,
    ws: State<'_, SharedWorkspace>,
) -> Result<PdfAnnotation, String> {
    let ann = backend().create_annotation(&path, annotation)?;
    mark_dirty_by_path(&app, &ws, &path);
    Ok(ann)
}

#[tauri::command]
pub fn update_annotation(path: String, annotation: PdfAnnotation) -> Result<(), String> {
    backend().update_annotation(&path, annotation)
}

#[tauri::command]
pub fn delete_annotation(path: String, page_index: usize, id: String) -> Result<(), String> {
    backend().delete_annotation(&path, page_index, &id)
}

#[tauri::command]
pub fn save_document(
    path: String,
    app: AppHandle,
    ws: State<'_, SharedWorkspace>,
) -> Result<u64, String> {
    let len = backend().save(&path)?;
    mark_dirty_by_path(&app, &ws, &path);
    // save clears dirty
    {
        let mut guard = ws.lock().map_err(|e| format!("workspace lock poisoned: {e}"))?;
        let doc_id = guard
            .documents
            .values()
            .find(|d| d.path.to_str() == Some(&path))
            .map(|d| d.id.clone());
        if let Some(id) = doc_id {
            guard.set_dirty(&id, false);
        }
    }
    broadcast(&app, &ws);
    Ok(len)
}

// ---- PDF page mutation commands (§6) ----

use crate::pdf::PageSize;

#[tauri::command]
pub fn insert_blank_page(
    path: String,
    index: usize,
    size: PageSize,
    reference_page_index: Option<usize>,
    app: AppHandle,
    ws: State<'_, SharedWorkspace>,
) -> Result<usize, String> {
    let backend = PdfiumBackend::new();
    let landed = backend.insert_blank_page(&path, index, size, reference_page_index)?;
    mark_dirty_by_path(&app, &ws, &path);
    Ok(landed)
}

#[tauri::command]
pub fn delete_page(
    path: String,
    index: usize,
    app: AppHandle,
    ws: State<'_, SharedWorkspace>,
) -> Result<(), String> {
    let backend = PdfiumBackend::new();
    backend.delete_page(&path, index)?;
    mark_dirty_by_path(&app, &ws, &path);
    Ok(())
}

/// Shared helper: flip the document matching `path` to dirty and broadcast.
fn mark_dirty_by_path(app: &AppHandle, ws: &State<'_, SharedWorkspace>, path: &str) {
    {
        let mut guard = match ws.lock() {
            Ok(g) => g,
            Err(e) => {
                log::error!("workspace lock poisoned: {e}");
                return;
            }
        };
        let doc_id = guard
            .documents
            .values()
            .find(|d| d.path.to_str() == Some(path))
            .map(|d| d.id.clone());
        if let Some(id) = doc_id {
            guard.set_dirty(&id, true);
        }
    }
    broadcast(app, ws.inner());
}


// ---- PDFium page rendering (replaces pdf.js entirely) ----

#[tauri::command]
pub fn get_page_infos(path: String) -> Result<Vec<crate::pdf::pdfium::PageInfoDTO>, String> {
    Ok(crate::pdf::pdfium::get_page_infos(&path)?)
}

#[tauri::command]
pub fn render_page(path: String, page_index: usize, scale: f32) -> Result<Response, String> {
    let bytes = crate::pdf::pdfium::render_page_png(&path, page_index, scale)?;
    Ok(Response::new(bytes))
}

#[tauri::command]
pub fn get_page_text(path: String, page_index: usize) -> Result<Vec<crate::pdf::pdfium::TextSegment>, String> {
    Ok(crate::pdf::pdfium::get_page_text(&path, page_index)?)
}
