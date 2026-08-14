//! Tauri commands exposing the workspace to the frontend (§24 API boundary).
//!
//! All file-open paths funnel through [`open_document`], whether they arrive
//! from OS double-click (single-instance plugin / opened-files event), CLI
//! args at first launch, drag-in, or a frontend File→Open action.

use tauri::{AppHandle, Emitter, Manager, State, ipc::Response};

use crate::workspace::{SharedWorkspace, TabId, WorkspaceSnapshot, MAIN_WINDOW};

/// The single source of truth for opening a document. Used by the
/// single-instance callback, first-launch arg parsing, and the
/// `open_document` Tauri command.
pub fn open_document(app: &AppHandle, ws: &SharedWorkspace, path: &str) -> Result<TabId, String> {
    let mut guard = ws.lock().map_err(|e| format!("workspace lock poisoned: {e}"))?;
    let tab_id = guard.open_document(path)?;
    let snapshot = guard.snapshot();
    // Always emit globally; Phase 1 has a single window, Phase 6 will route
    // per-window. Frontend filters by window_id.
    let _ = app.emit("workspace://changed", &snapshot);
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
pub fn get_workspace(ws: State<'_, SharedWorkspace>) -> Result<WorkspaceSnapshot, String> {
    let guard = ws.lock().map_err(|e| format!("workspace lock poisoned: {e}"))?;
    Ok(guard.snapshot())
}

#[tauri::command]
pub fn open_document_command(path: String, app: AppHandle, ws: State<'_, SharedWorkspace>) -> Result<TabId, String> {
    open_document(&app, ws.inner(), &path)
}

#[tauri::command]
pub fn focus_tab(tab_id: TabId, app: AppHandle, ws: State<'_, SharedWorkspace>) -> Result<(), String> {
    let mut guard = ws.lock().map_err(|e| format!("workspace lock poisoned: {e}"))?;
    guard.focus_tab(&tab_id);
    let snapshot = guard.snapshot();
    let _ = app.emit("workspace://changed", &snapshot);
    Ok(())
}

#[tauri::command]
pub fn close_tab(tab_id: TabId, app: AppHandle, ws: State<'_, SharedWorkspace>) -> Result<(), String> {
    let mut guard = ws.lock().map_err(|e| format!("workspace lock poisoned: {e}"))?;
    guard.close_tab(&tab_id)?;
    let snapshot = guard.snapshot();
    let _ = app.emit("workspace://changed", &snapshot);
    Ok(())
}



/// Read a file's raw bytes. Used by the PDF adapter to feed `pdfjs.getDocument`.
/// Returns raw bytes via `tauri::ipc::Response` so a 50 MB PDF doesn't get
/// JSON-encoded into a ~150 MB number array over IPC (Phase 7 will switch to
/// the asset protocol for true range streaming).
#[tauri::command]
pub fn read_file_bytes(path: String) -> Result<Response, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("read '{path}': {e}"))?;
    Ok(Response::new(bytes))
}

/// Sink for frontend runtime errors so they surface in the dev terminal / log
/// (the webview console is otherwise invisible to the Rust host). Wired from
/// `window.onerror` and `unhandledrejection` in `main.tsx`.
#[tauri::command]
pub fn log_frontend(level: String, message: String) {
    match level.as_str() {
        "error" => log::error!("[frontend] {message}"),
        "warn" => log::warn!("[frontend] {message}"),
        _ => log::info!("[frontend] {message}"),
    }
}

/// Read a text file as a UTF-8 string. Used by the Markdown adapter.
#[tauri::command]
pub fn read_file_text(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("read '{path}': {e}"))?;
    String::from_utf8(bytes).map_err(|e| format!("file '{path}' is not valid UTF-8: {e}"))
}

/// Atomically write `content` to `path` (§7 transactional save):
///   foo.md → foo.md.tmp → fsync → rename → foo.md
/// The original file is never touched until the temp file is fully written.
#[tauri::command]
pub fn save_file_text(path: String, content: String) -> Result<(), String> {
    let tmp = format!("{path}.tmp");
    let bytes = content.as_bytes();
    std::fs::write(&tmp, bytes).map_err(|e| format!("write tmp '{tmp}': {e}"))?;
    // fsync the temp file before renaming so a crash between rename and flush
    // can't leave a truncated file under the real name.
    let f = std::fs::File::open(&tmp).map_err(|e| format!("reopen tmp '{tmp}': {e}"))?;
    f.sync_all().map_err(|e| format!("fsync tmp '{tmp}': {e}"))?;
    drop(f);
    std::fs::rename(&tmp, &path).map_err(|e| format!("rename '{tmp}' -> '{path}': {e}"))?;
    Ok(())
}

/// Canonicalize a path (exposed so the frontend can dedupe / compare paths
/// the way the workspace router does).
#[tauri::command]
pub fn canonicalize_path(path: String) -> Result<String, String> {
    std::fs::canonicalize(&path)
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| format!("canonicalize '{path}': {e}"))
}

/// Flip a document's dirty flag (§7). The frontend adapter calls this when the
/// user edits / saves so the tab strip can show the ● indicator.
#[tauri::command]
pub fn set_dirty(document_id: String, dirty: bool, app: AppHandle, ws: State<'_, SharedWorkspace>) -> Result<(), String> {
    {
        let mut guard = ws.lock().map_err(|e| format!("workspace lock poisoned: {e}"))?;
        guard.set_dirty(&document_id, dirty);
    }
    let guard = ws.lock().map_err(|e| format!("workspace lock poisoned: {e}"))?;
    let snapshot = guard.snapshot();
    let _ = app.emit("workspace://changed", &snapshot);
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
pub fn create_annotation(path: String, annotation: PdfAnnotation, app: AppHandle, ws: State<'_, SharedWorkspace>) -> Result<PdfAnnotation, String> {
    let ann = backend().create_annotation(&path, annotation)?;
    // Mark the owning document dirty so the tab shows ● and save is required.
    if let Ok(mut guard) = ws.lock() {
        // find the document by path
        let doc_id = guard.documents.values()
            .find(|d| d.path.to_str() == Some(&path))
            .map(|d| d.id.clone());
        if let Some(id) = doc_id {
            guard.set_dirty(&id, true);
        }
        let snapshot = guard.snapshot();
        let _ = app.emit("workspace://changed", &snapshot);
    }
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
pub fn save_document(path: String, app: AppHandle, ws: State<'_, SharedWorkspace>) -> Result<u64, String> {
    let len = backend().save(&path)?;
    if let Ok(mut guard) = ws.lock() {
        let doc_id = guard.documents.values()
            .find(|d| d.path.to_str() == Some(&path))
            .map(|d| d.id.clone());
        if let Some(id) = doc_id {
            guard.set_dirty(&id, false);
        }
        let snapshot = guard.snapshot();
        let _ = app.emit("workspace://changed", &snapshot);
    }
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

/// Shared helper: flip the document matching `path` to dirty and emit snapshot.
fn mark_dirty_by_path(app: &AppHandle, ws: &State<'_, SharedWorkspace>, path: &str) {
    if let Ok(mut guard) = ws.lock() {
        let doc_id = guard
            .documents
            .values()
            .find(|d| d.path.to_str() == Some(path))
            .map(|d| d.id.clone());
        if let Some(id) = doc_id {
            guard.set_dirty(&id, true);
        }
        let snapshot = guard.snapshot();
        let _ = app.emit("workspace://changed", &snapshot);
    }
}
