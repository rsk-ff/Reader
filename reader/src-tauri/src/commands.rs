//! Tauri commands exposing the workspace to the frontend (§24 API boundary).
//!
//! All file-open paths funnel through [`open_document`], whether they arrive
//! from OS double-click (single-instance plugin / opened-files event), CLI
//! args at first launch, drag-in, or a frontend File→Open action.

use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

use crate::workspace::{
    SharedWorkspace, TabId, WindowId, WindowSnapshot, MAIN_WINDOW,
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
    let mut guard = ws
        .lock()
        .map_err(|e| format!("workspace lock poisoned: {e}"))?;
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
    let guard = ws
        .lock()
        .map_err(|e| format!("workspace lock poisoned: {e}"))?;
    Ok(guard.snapshot_for(&window_id))
}

#[tauri::command]
pub fn open_document_command(
    path: String,
    window_id: WindowId,
    app: AppHandle,
    ws: State<'_, SharedWorkspace>,
) -> Result<TabId, String> {
    let mut guard = ws
        .lock()
        .map_err(|e| format!("workspace lock poisoned: {e}"))?;
    guard.ensure_main();
    let tab_id = guard.open_document(&path, &window_id)?;
    drop(guard);
    broadcast(&app, &ws);
    Ok(tab_id)
}

#[tauri::command]
pub fn focus_tab(
    tab_id: TabId,
    app: AppHandle,
    ws: State<'_, SharedWorkspace>,
) -> Result<(), String> {
    let mut guard = ws
        .lock()
        .map_err(|e| format!("workspace lock poisoned: {e}"))?;
    guard.focus_tab(&tab_id)?;
    drop(guard);
    broadcast(&app, &ws);
    Ok(())
}

#[tauri::command]
pub fn close_tab(
    tab_id: TabId,
    app: AppHandle,
    ws: State<'_, SharedWorkspace>,
) -> Result<(), String> {
    let close_window = {
        let mut guard = ws
            .lock()
            .map_err(|e| format!("workspace lock poisoned: {e}"))?;
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
            let guard = ws
                .lock()
                .map_err(|e| format!("workspace lock poisoned: {e}"))?;
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
    let mut guard = ws
        .lock()
        .map_err(|e| format!("workspace lock poisoned: {e}"))?;
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
        let mut guard = ws
            .lock()
            .map_err(|e| format!("workspace lock poisoned: {e}"))?;
        guard.detach_tab(&tab_id)?
    };

    // Create the native window with the same label the workspace just minted.
    let mut builder =
        WebviewWindowBuilder::new(&app, &new_window, WebviewUrl::App("index.html".into()))
            .title("Reader")
            .inner_size(900.0, 700.0)
            .min_inner_size(330.0, 480.0)
            .decorations(false);
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
    let mut guard = ws
        .lock()
        .map_err(|e| format!("workspace lock poisoned: {e}"))?;
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
        let mut guard = ws
            .lock()
            .map_err(|e| format!("workspace lock poisoned: {e}"))?;
        guard.remove_window(&window_id);
    }
    broadcast(&app, &ws);
    Ok(())
}

/// Persist the workspace to AppData for session restore (§26).
pub fn save_session_impl(app: &AppHandle, ws: &SharedWorkspace) -> Result<(), String> {
    let serialized = {
        let guard = ws
            .lock()
            .map_err(|e| format!("workspace lock poisoned: {e}"))?;
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
    f.sync_all()
        .map_err(|e| format!("fsync tmp '{tmp}': {e}"))?;
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
        let mut guard = ws
            .lock()
            .map_err(|e| format!("workspace lock poisoned: {e}"))?;
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

fn pdf_working_path(ws: &State<'_, SharedWorkspace>, path: &str) -> Result<String, String> {
    let mut guard = ws
        .lock()
        .map_err(|error| format!("workspace lock poisoned: {error}"))?;
    guard
        .ensure_pdf_working_copy(path)
        .map(|working_copy| working_copy.to_string_lossy().into_owned())
}

async fn pdf_worker<T>(
    operation: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String>
where
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(operation)
        .await
        .map_err(|error| format!("PDF worker failed: {error}"))?
}

fn commit_pdf_working_copy(original_path: &str, working_path: &str) -> Result<u64, String> {
    let bytes = std::fs::read(working_path)
        .map_err(|error| format!("read PDF working copy '{working_path}': {error}"))?;
    crate::pdf::pdfium::atomic_write(original_path, &bytes)
}

#[tauri::command]
pub async fn create_annotation(
    path: String,
    annotation: PdfAnnotation,
    app: AppHandle,
    ws: State<'_, SharedWorkspace>,
) -> Result<PdfAnnotation, String> {
    let worker_path = pdf_working_path(&ws, &path)?;
    let ann = pdf_worker(move || {
        crate::pdf::pdfium::with_pdfium_lock(|| {
            backend().create_annotation(&worker_path, annotation)
        })
    })
    .await?;
    mark_dirty_by_path(&app, &ws, &path);
    Ok(ann)
}

#[tauri::command]
pub async fn update_annotation(
    path: String,
    annotation: PdfAnnotation,
    app: AppHandle,
    ws: State<'_, SharedWorkspace>,
) -> Result<(), String> {
    let worker_path = pdf_working_path(&ws, &path)?;
    pdf_worker(move || {
        crate::pdf::pdfium::with_pdfium_lock(|| {
            backend().update_annotation(&worker_path, annotation)
        })
    })
    .await?;
    mark_dirty_by_path(&app, &ws, &path);
    Ok(())
}

#[tauri::command]
pub async fn delete_annotation(
    path: String,
    page_index: usize,
    id: String,
    app: AppHandle,
    ws: State<'_, SharedWorkspace>,
) -> Result<(), String> {
    let worker_path = pdf_working_path(&ws, &path)?;
    pdf_worker(move || {
        crate::pdf::pdfium::with_pdfium_lock(|| {
            backend().delete_annotation(&worker_path, page_index, &id)
        })
    })
    .await?;
    mark_dirty_by_path(&app, &ws, &path);
    Ok(())
}

#[tauri::command]
pub async fn save_document(
    path: String,
    app: AppHandle,
    ws: State<'_, SharedWorkspace>,
) -> Result<u64, String> {
    let (document_id, original_path, working_copy) = {
        let guard = ws
            .lock()
            .map_err(|error| format!("workspace lock poisoned: {error}"))?;
        let document = guard
            .documents
            .values()
            .find(|document| document.path.to_str() == Some(&path))
            .ok_or_else(|| format!("document is not open: {path}"))?;
        (
            document.id.clone(),
            document.path.to_string_lossy().into_owned(),
            document
                .pdf_working_copy
                .as_ref()
                .map(|working_copy| working_copy.to_string_lossy().into_owned()),
        )
    };

    let len = if let Some(worker_path) = working_copy.clone() {
        pdf_worker(move || {
            crate::pdf::pdfium::with_pdfium_lock(|| {
                // Every mutation already produced a complete PDFium-saved file.
                // Save only commits those staged bytes to the original path.
                commit_pdf_working_copy(&original_path, &worker_path)
            })
        })
        .await?
    } else {
        std::fs::metadata(&original_path)
            .map(|metadata| metadata.len())
            .map_err(|error| format!("read PDF metadata '{original_path}': {error}"))?
    };

    let working_copy_to_remove = {
        let mut guard = ws
            .lock()
            .map_err(|error| format!("workspace lock poisoned: {error}"))?;
        let document = guard
            .documents
            .get_mut(&document_id)
            .ok_or_else(|| format!("document disappeared while saving: {document_id}"))?;
        document.file_size = Some(len);
        let working_copy = document.pdf_working_copy.take();
        guard.set_dirty(&document_id, false);
        working_copy
    };
    if let Some(working_copy) = working_copy_to_remove {
        if let Err(error) = std::fs::remove_file(&working_copy) {
            if error.kind() != std::io::ErrorKind::NotFound {
                log::warn!(
                    "remove saved PDF working copy '{}': {error}",
                    working_copy.display()
                );
            }
        }
    }
    broadcast(&app, &ws);
    Ok(len)
}

/// Abandon staged PDFium writes and return PDF.js to the untouched original.
#[tauri::command]
pub fn discard_pdf_changes(
    path: String,
    app: AppHandle,
    ws: State<'_, SharedWorkspace>,
) -> Result<(), String> {
    let working_copy = {
        let mut guard = ws
            .lock()
            .map_err(|error| format!("workspace lock poisoned: {error}"))?;
        let document_id = guard
            .documents
            .values()
            .find(|document| document.path.to_str() == Some(&path))
            .map(|document| document.id.clone())
            .ok_or_else(|| format!("document is not open: {path}"))?;
        let document = guard
            .documents
            .get_mut(&document_id)
            .expect("document exists while discarding its PDF changes");
        let working_copy = document.pdf_working_copy.take();
        document.revision += 1;
        document.dirty = false;
        document.last_saved_revision = document.revision;
        working_copy
    };
    if let Some(working_copy) = working_copy {
        if let Err(error) = std::fs::remove_file(&working_copy) {
            if error.kind() != std::io::ErrorKind::NotFound {
                return Err(format!(
                    "remove PDF working copy '{}': {error}",
                    working_copy.display()
                ));
            }
        }
    }
    broadcast(&app, &ws);
    Ok(())
}

// ---- PDF page mutation commands (§6) ----

use crate::pdf::PageSize;

#[tauri::command]
pub async fn insert_blank_page(
    path: String,
    index: usize,
    size: PageSize,
    reference_page_index: Option<usize>,
    app: AppHandle,
    ws: State<'_, SharedWorkspace>,
) -> Result<usize, String> {
    let worker_path = pdf_working_path(&ws, &path)?;
    let landed = pdf_worker(move || {
        crate::pdf::pdfium::with_pdfium_lock(|| {
            backend().insert_blank_page(&worker_path, index, size, reference_page_index)
        })
    })
    .await?;
    mark_dirty_by_path(&app, &ws, &path);
    Ok(landed)
}

#[tauri::command]
pub async fn delete_page(
    path: String,
    index: usize,
    app: AppHandle,
    ws: State<'_, SharedWorkspace>,
) -> Result<(), String> {
    let worker_path = pdf_working_path(&ws, &path)?;
    pdf_worker(move || {
        crate::pdf::pdfium::with_pdfium_lock(|| backend().delete_page(&worker_path, index))
    })
    .await?;
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

#[cfg(test)]
mod tests {
    use super::{commit_pdf_working_copy, read_file_text, save_file_text};

    #[test]
    fn markdown_save_replaces_an_existing_file_atomically() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        let path = std::env::temp_dir().join(format!("reader-markdown-save-{unique}.md"));
        std::fs::write(&path, "old").expect("seed markdown file");
        let path_string = path.to_string_lossy().into_owned();

        save_file_text(path_string.clone(), "first".into()).expect("first save");
        save_file_text(path_string.clone(), "second".into()).expect("replacement save");

        assert_eq!(
            read_file_text(path_string.clone()).expect("read saved file"),
            "second"
        );
        assert!(!std::path::Path::new(&format!("{path_string}.tmp")).exists());

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn explicit_pdf_save_commits_the_working_copy() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        let original = std::env::temp_dir().join(format!("reader-pdf-save-{unique}.pdf"));
        let working = std::env::temp_dir().join(format!("reader-pdf-save-{unique}.working.pdf"));
        std::fs::write(&original, b"%PDF-original").expect("seed original PDF");
        std::fs::write(&working, b"%PDF-working").expect("seed working PDF");

        let length = commit_pdf_working_copy(
            original.to_str().expect("UTF-8 original path"),
            working.to_str().expect("UTF-8 working path"),
        )
        .expect("commit PDF working copy");

        assert_eq!(length, 12);
        assert_eq!(std::fs::read(&original).unwrap(), b"%PDF-working");
        assert_eq!(std::fs::read(&working).unwrap(), b"%PDF-working");
        let _ = std::fs::remove_file(original);
        let _ = std::fs::remove_file(working);
    }
}
