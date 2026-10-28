//! Tauri commands exposing the workspace to the frontend (§24 API boundary).
//!
//! All file-open paths funnel through [`open_document`], whether they arrive
//! from OS double-click (single-instance plugin / opened-files event), CLI
//! args at first launch, drag-in, or a frontend File→Open action.

use std::{
    path::{Path, PathBuf},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};

use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

use crate::markdown_file::{
    decode_markdown, disk_stamp, encode_markdown, MarkdownDiskState, EXTERNAL_CHANGE_ERROR,
};
use crate::workspace::{
    create_pdf_working_copy, DocumentId, DocumentType, PdfWorkingCopyPlan, SharedWorkspace, TabId,
    WindowId, WindowSnapshot, MAIN_WINDOW,
};

mod markdown;
mod pdf;
mod tab_drag;

pub(crate) use markdown::*;
pub(crate) use pdf::*;
pub(crate) use tab_drag::*;

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

/// The native window that receives files opened from outside the app
/// (OS double-click, second launch). The main window can be closed while
/// detached windows keep the app alive; files then go to a live window.
pub(crate) fn external_open_window(app: &AppHandle) -> WindowId {
    if app.get_webview_window(MAIN_WINDOW).is_some() {
        return MAIN_WINDOW.to_string();
    }
    let mut detached = app
        .webview_windows()
        .into_keys()
        .filter(|label| label.starts_with("win-"))
        .collect::<Vec<_>>();
    detached.sort();
    detached
        .into_iter()
        .next()
        .unwrap_or_else(|| MAIN_WINDOW.to_string())
}

/// The single source of truth for opening a document from outside a window
/// context: first-launch arg parsing targets the main window, while the
/// single-instance and macOS open-file callbacks use `external_open_window`.
/// Returns the tab and the window that owns it.
pub fn open_document(
    app: &AppHandle,
    ws: &SharedWorkspace,
    path: &str,
    target_window: &WindowId,
) -> Result<(TabId, WindowId), String> {
    let mut guard = ws
        .lock()
        .map_err(|e| format!("workspace lock poisoned: {e}"))?;
    guard.ensure_main();
    let tab_id = guard.open_document(path, target_window)?;
    // An already-open file is focused where it lives, not in the target.
    let owner = guard
        .tabs
        .get(&tab_id)
        .map(|tab| tab.window_id.clone())
        .unwrap_or_else(|| target_window.clone());
    drop(guard);
    broadcast(app, ws);
    Ok((tab_id, owner))
}

/// Open a file arriving from the OS and bring its window to the front.
pub fn open_external_document(app: &AppHandle, path: &str) {
    let ws = app.state::<SharedWorkspace>().inner();
    let target = external_open_window(app);
    match open_document(app, ws, path, &target) {
        Ok((_, owner)) => {
            if let Some(win) = app.get_webview_window(&owner) {
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
        }
        Err(e) => log::warn!("open_document('{path}') failed: {e}"),
    }
}

pub(crate) fn collect_paths_from_args(args: &[String]) -> Vec<String> {
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
    let paths = collect_paths_from_args(&argv);
    for path in &paths {
        open_external_document(app, path);
    }
    // A bare second launch still brings Reader to the front.
    if paths.is_empty() {
        if let Some(win) = app.get_webview_window(&external_open_window(app)) {
            let _ = win.unminimize();
            let _ = win.set_focus();
        }
    }
}

/// First-launch arg parsing. Runs once during setup before the window is shown.
pub fn open_initial_files(app: &AppHandle) {
    let ws = app.state::<SharedWorkspace>().inner();
    let args: Vec<String> = std::env::args().collect();
    let paths = collect_paths_from_args(&args);
    for path in &paths {
        if let Err(e) = open_document(app, ws, path, &MAIN_WINDOW.to_string()) {
            log::warn!("open_document('{path}') failed: {e}");
        }
    }
    // A normal launch (or a launch where every supplied path failed) starts
    // with a real new tab. Successful file launches stay file-only.
    if let Ok(mut guard) = ws.lock() {
        guard.ensure_main();
        let main_is_empty = guard
            .windows
            .get(MAIN_WINDOW)
            .is_none_or(|window| window.tab_ids.is_empty());
        if main_is_empty {
            guard.create_new_tab(&MAIN_WINDOW.to_string());
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
pub fn create_new_tab(
    window_id: WindowId,
    app: AppHandle,
    ws: State<'_, SharedWorkspace>,
) -> Result<TabId, String> {
    let mut guard = ws
        .lock()
        .map_err(|e| format!("workspace lock poisoned: {e}"))?;
    let tab_id = guard.create_new_tab(&window_id);
    drop(guard);
    broadcast(&app, &ws);
    Ok(tab_id)
}

#[tauri::command]
pub fn create_markdown_document(
    window_id: WindowId,
    app: AppHandle,
    ws: State<'_, SharedWorkspace>,
) -> Result<TabId, String> {
    let mut guard = ws
        .lock()
        .map_err(|e| format!("workspace lock poisoned: {e}"))?;
    let tab_id = guard.create_markdown_document(&window_id)?;
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
    let empty_window = {
        let mut guard = ws
            .lock()
            .map_err(|e| format!("workspace lock poisoned: {e}"))?;
        let owner = guard.close_tab(&tab_id)?;
        // Non-main window with no tabs left → close that native window.
        (owner != MAIN_WINDOW
            && guard
                .windows
                .get(&owner)
                .is_some_and(|w| w.tab_ids.is_empty()))
        .then_some(owner)
    };
    if let Some(label) = empty_window {
        if let Some(win) = app.get_webview_window(&label) {
            let _ = win.close();
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
