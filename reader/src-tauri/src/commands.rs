//! Tauri commands exposing the workspace to the frontend (§24 API boundary).
//!
//! All file-open paths funnel through [`open_document`], whether they arrive
//! from OS double-click (single-instance plugin / opened-files event), CLI
//! args at first launch, drag-in, or a frontend File→Open action.

use std::{
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};

use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

use crate::workspace::{
    DocumentType, SharedWorkspace, TabId, WindowId, WindowSnapshot, MAIN_WINDOW,
};

const CUSTOM_TITLEBAR_HEIGHT_CSS: f64 = 36.0;
const TAB_DRAG_POLL_INTERVAL: Duration = Duration::from_millis(16);
const TAB_DRAG_TIMEOUT: Duration = Duration::from_secs(300);
const TAB_DRAG_MOVEMENT_THRESHOLD: f64 = 4.0;
const TAB_DRAG_RELEASED_EVENT: &str = "tab-drag://released";

struct ActiveTabDrag {
    tab_id: TabId,
    source_window: WindowId,
    detach_on_miss: bool,
    grab_offset_x: f64,
    grab_offset_y: f64,
    hover_target: Option<WindowId>,
    preview_window: Option<WindowId>,
}

#[derive(Default)]
struct TabDragMonitor {
    generation: u64,
    active: Option<ActiveTabDrag>,
}

#[derive(Default)]
pub(crate) struct TabDragMonitorState(Mutex<TabDragMonitor>);

pub(crate) fn new_tab_drag_monitor() -> TabDragMonitorState {
    TabDragMonitorState::default()
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct TabDragReleasedPayload {
    tab_id: TabId,
    detach_on_miss: bool,
    grab_offset_x: f64,
    grab_offset_y: f64,
}

fn point_in_titlebar_zone(
    cursor_x: f64,
    cursor_y: f64,
    left: f64,
    top: f64,
    width: f64,
    scale_factor: f64,
) -> bool {
    let titlebar_height = CUSTOM_TITLEBAR_HEIGHT_CSS * scale_factor.max(0.1);
    cursor_x >= left
        && cursor_x < left + width
        && cursor_y >= top
        && cursor_y < top + titlebar_height
}

fn find_dock_target(app: &AppHandle, source_window: &str) -> Option<WindowId> {
    let cursor = app.cursor_position().ok()?;
    app.webview_windows()
        .into_iter()
        .find_map(|(label, window)| {
            if label == source_window
                || (label != MAIN_WINDOW && !label.starts_with("win-"))
                || !window.is_visible().unwrap_or(false)
            {
                return None;
            }
            let position = window.outer_position().ok()?;
            let size = window.outer_size().ok()?;
            let scale_factor = window.scale_factor().ok()?;
            point_in_titlebar_zone(
                cursor.x,
                cursor.y,
                f64::from(position.x),
                f64::from(position.y),
                f64::from(size.width),
                scale_factor,
            )
            .then_some(label)
        })
}

fn find_hover_target(app: &AppHandle, source_window: &str) -> Option<WindowId> {
    // Raising a target is intentionally limited to the same titlebar band
    // that can complete a dock. Passing over document content must not change
    // the native window stacking order.
    find_dock_target(app, source_window)
}

fn cursor_in_window_titlebar(app: &AppHandle, window_id: &str) -> bool {
    let Ok(cursor) = app.cursor_position() else {
        return false;
    };
    let Some(window) = app.get_webview_window(window_id) else {
        return false;
    };
    let (Ok(position), Ok(size), Ok(scale_factor)) = (
        window.outer_position(),
        window.outer_size(),
        window.scale_factor(),
    ) else {
        return false;
    };
    point_in_titlebar_zone(
        cursor.x,
        cursor.y,
        f64::from(position.x),
        f64::from(position.y),
        f64::from(size.width),
        scale_factor,
    )
}

fn cursor_moved_enough(start_x: f64, start_y: f64, current_x: f64, current_y: f64) -> bool {
    (current_x - start_x).hypot(current_y - start_y) > TAB_DRAG_MOVEMENT_THRESHOLD
}

#[cfg(target_os = "windows")]
fn primary_mouse_button_down() -> bool {
    const VK_LBUTTON: i32 = 0x01;
    #[link(name = "user32")]
    extern "system" {
        fn GetAsyncKeyState(virtual_key: i32) -> i16;
    }

    // SAFETY: GetAsyncKeyState has no pointer arguments and is safe to call
    // from the polling thread. The high bit is set while the key is down.
    unsafe { (GetAsyncKeyState(VK_LBUTTON) as u16 & 0x8000) != 0 }
}

#[cfg(not(target_os = "windows"))]
fn primary_mouse_button_down() -> bool {
    false
}

fn set_temporary_topmost(app: &AppHandle, window_id: Option<&str>, topmost: bool) {
    if let Some(window_id) = window_id {
        if let Some(window) = app.get_webview_window(window_id) {
            let _ = window.set_always_on_top(topmost);
        }
    }
}

fn encode_query_component(value: &str) -> String {
    const HEX: &[u8; 16] = b"0123456789ABCDEF";
    let mut encoded = String::with_capacity(value.len());
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            encoded.push(char::from(byte));
        } else {
            encoded.push('%');
            encoded.push(char::from(HEX[usize::from(byte >> 4)]));
            encoded.push(char::from(HEX[usize::from(byte & 0x0f)]));
        }
    }
    encoded
}

fn create_tab_drag_preview(
    app: &AppHandle,
    generation: u64,
    title: &str,
    dirty: bool,
    width: f64,
    height: f64,
) -> Option<WindowId> {
    let label = format!("tab-drag-preview-{generation}");
    let path = format!(
        "index.html?tab-drag-preview=1&title={}&dirty={}",
        encode_query_component(title),
        if dirty { "1" } else { "0" }
    );
    let window = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(path.into()))
        .title("Reader tab drag preview")
        .inner_size(width.clamp(120.0, 320.0), height.clamp(28.0, 44.0))
        .decorations(false)
        .resizable(false)
        .focused(false)
        .visible(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .shadow(false)
        .transparent(true)
        .build()
        .ok()?;
    let _ = window.set_ignore_cursor_events(true);
    Some(label)
}

fn destroy_tab_drag_preview(app: &AppHandle, window_id: Option<&str>) {
    if let Some(window_id) = window_id {
        if let Some(window) = app.get_webview_window(window_id) {
            let _ = window.destroy();
        }
    }
}

fn update_tab_drag_preview(
    app: &AppHandle,
    window_id: &str,
    grab_offset_x: f64,
    grab_offset_y: f64,
    visible: bool,
) {
    let Some(window) = app.get_webview_window(window_id) else {
        return;
    };
    if !visible {
        let _ = window.hide();
        return;
    }
    let Ok(cursor) = app.cursor_position() else {
        return;
    };
    let scale_factor = app
        .monitor_from_point(cursor.x, cursor.y)
        .ok()
        .flatten()
        .map(|monitor| monitor.scale_factor())
        .unwrap_or(1.0)
        .max(0.1);
    let x = (cursor.x - grab_offset_x.clamp(0.0, 320.0) * scale_factor).round() as i32;
    let y = (cursor.y - grab_offset_y.clamp(0.0, CUSTOM_TITLEBAR_HEIGHT_CSS) * scale_factor).round()
        as i32;
    let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
    let _ = window.show();
}

fn update_drag_hover(
    app: &AppHandle,
    monitor: &TabDragMonitorState,
    generation: u64,
    hover_target: Option<WindowId>,
) -> bool {
    let (old_target, new_target) = {
        let mut guard = match monitor.0.lock() {
            Ok(guard) => guard,
            Err(error) => {
                log::error!("tab drag monitor lock poisoned: {error}");
                return false;
            }
        };
        if guard.generation != generation {
            return false;
        }
        let Some(active) = guard.active.as_mut() else {
            return false;
        };
        if active.hover_target == hover_target {
            return true;
        }
        let old_target = active.hover_target.take();
        active.hover_target = hover_target.clone();
        (old_target, hover_target)
    };

    set_temporary_topmost(app, old_target.as_deref(), false);
    set_temporary_topmost(app, new_target.as_deref(), true);

    // A completion/cancellation can race the native topmost call. Re-check and
    // immediately undo the new target if this drag is no longer active.
    let still_current = monitor
        .0
        .lock()
        .map(|guard| {
            guard.generation == generation
                && guard
                    .active
                    .as_ref()
                    .is_some_and(|active| active.hover_target == new_target)
        })
        .unwrap_or(false);
    if !still_current {
        set_temporary_topmost(app, new_target.as_deref(), false);
    }
    still_current
}

fn stop_tab_drag_monitor(
    app: &AppHandle,
    monitor: &TabDragMonitorState,
    tab_id: &str,
    source_window: &str,
) {
    let (hover_target, preview_window) = {
        let mut guard = match monitor.0.lock() {
            Ok(guard) => guard,
            Err(error) => {
                log::error!("tab drag monitor lock poisoned: {error}");
                return;
            }
        };
        let matches = guard
            .active
            .as_ref()
            .is_some_and(|active| active.tab_id == tab_id && active.source_window == source_window);
        if !matches {
            return;
        }
        guard.generation = guard.generation.wrapping_add(1);
        guard
            .active
            .take()
            .map(|active| (active.hover_target, active.preview_window))
            .unwrap_or((None, None))
    };
    set_temporary_topmost(app, hover_target.as_deref(), false);
    destroy_tab_drag_preview(app, preview_window.as_deref());
}

fn finish_monitored_tab_drag(
    app: &AppHandle,
    monitor: &TabDragMonitorState,
    generation: u64,
    should_emit: bool,
) {
    let active = {
        let mut guard = match monitor.0.lock() {
            Ok(guard) => guard,
            Err(error) => {
                log::error!("tab drag monitor lock poisoned: {error}");
                return;
            }
        };
        if guard.generation != generation {
            return;
        }
        guard.generation = guard.generation.wrapping_add(1);
        guard.active.take()
    };
    let Some(active) = active else {
        return;
    };

    if should_emit {
        let payload = TabDragReleasedPayload {
            tab_id: active.tab_id.clone(),
            detach_on_miss: active.detach_on_miss,
            grab_offset_x: active.grab_offset_x,
            grab_offset_y: active.grab_offset_y,
        };
        let _ = app.emit_to(&active.source_window, TAB_DRAG_RELEASED_EVENT, payload);
    }
    set_temporary_topmost(app, active.hover_target.as_deref(), false);
    destroy_tab_drag_preview(app, active.preview_window.as_deref());
}

#[tauri::command]
// Tauri exposes command parameters as named IPC fields; keeping them flat
// preserves the generated frontend call contract.
#[allow(clippy::too_many_arguments)]
pub fn begin_tab_drag(
    tab_id: TabId,
    source_window: WindowId,
    detach_on_miss: bool,
    grab_offset_x: f64,
    grab_offset_y: f64,
    preview_title: Option<String>,
    preview_dirty: bool,
    preview_width: f64,
    preview_height: f64,
    already_started: bool,
    app: AppHandle,
    monitor: State<'_, TabDragMonitorState>,
) -> Result<(), String> {
    let initially_down = primary_mouse_button_down();
    let start_cursor = app.cursor_position().ok();
    let (generation, previous_hover, previous_preview) = {
        let mut guard = monitor
            .0
            .lock()
            .map_err(|error| format!("tab drag monitor lock poisoned: {error}"))?;
        guard.generation = guard.generation.wrapping_add(1);
        let generation = guard.generation;
        let (previous_hover, previous_preview) = guard
            .active
            .take()
            .map(|active| (active.hover_target, active.preview_window))
            .unwrap_or((None, None));
        guard.active = Some(ActiveTabDrag {
            tab_id,
            source_window: source_window.clone(),
            detach_on_miss,
            grab_offset_x,
            grab_offset_y,
            hover_target: None,
            preview_window: None,
        });
        (generation, previous_hover, previous_preview)
    };
    set_temporary_topmost(&app, previous_hover.as_deref(), false);
    destroy_tab_drag_preview(&app, previous_preview.as_deref());

    thread::spawn(move || {
        let started_at = Instant::now();
        let mut saw_button_down = initially_down;
        let mut moved = already_started;
        let preview_window = if already_started {
            preview_title.as_deref().and_then(|title| {
                create_tab_drag_preview(
                    &app,
                    generation,
                    title,
                    preview_dirty,
                    preview_width,
                    preview_height,
                )
            })
        } else {
            None
        };
        if let Some(preview_window) = preview_window.as_ref() {
            let monitor = app.state::<TabDragMonitorState>();
            let keep_preview = monitor
                .0
                .lock()
                .map(|mut guard| {
                    if guard.generation != generation {
                        return false;
                    }
                    let Some(active) = guard.active.as_mut() else {
                        return false;
                    };
                    active.preview_window = Some(preview_window.clone());
                    true
                })
                .unwrap_or(false);
            if !keep_preview {
                destroy_tab_drag_preview(&app, Some(preview_window));
                return;
            }
        }
        loop {
            let monitor = app.state::<TabDragMonitorState>();
            let current = monitor
                .0
                .lock()
                .map(|guard| guard.generation == generation && guard.active.is_some())
                .unwrap_or(false);
            if !current {
                return;
            }

            let button_down = primary_mouse_button_down();
            saw_button_down |= button_down;
            if button_down {
                if let (Some(start), Ok(cursor)) = (start_cursor, app.cursor_position()) {
                    moved |= cursor_moved_enough(start.x, start.y, cursor.x, cursor.y);
                }
                if moved {
                    // While reordering in the source titlebar, do not raise an
                    // overlapped Reader window merely because its rectangle is
                    // geometrically behind the active strip. A single-tab
                    // native move is different: the source window travels with
                    // the cursor, so underlying Reader windows must be eligible.
                    let in_source_titlebar = cursor_in_window_titlebar(&app, &source_window);
                    let allow_hover = !already_started || !in_source_titlebar;
                    let hover_target = allow_hover
                        .then(|| find_hover_target(&app, &source_window))
                        .flatten();
                    if !update_drag_hover(&app, &monitor, generation, hover_target.clone()) {
                        return;
                    }
                    if let Some(preview_window) = preview_window.as_deref() {
                        update_tab_drag_preview(
                            &app,
                            preview_window,
                            grab_offset_x,
                            grab_offset_y,
                            !in_source_titlebar || hover_target.is_some(),
                        );
                    }
                }
            } else {
                // Pointer Events reliably finish a multi-tab drag in the
                // source webview. Only the single-tab native window move needs
                // this OS-level release event; emitting for both paths could
                // race an in-strip reorder against a geometrically overlapped
                // window behind the source.
                finish_monitored_tab_drag(
                    &app,
                    &monitor,
                    generation,
                    saw_button_down && moved && !already_started,
                );
                return;
            }

            if started_at.elapsed() >= TAB_DRAG_TIMEOUT {
                finish_monitored_tab_drag(&app, &monitor, generation, false);
                return;
            }
            thread::sleep(TAB_DRAG_POLL_INTERVAL);
        }
    });
    Ok(())
}

#[tauri::command]
pub fn cancel_tab_drag(
    tab_id: TabId,
    source_window: WindowId,
    app: AppHandle,
    monitor: State<'_, TabDragMonitorState>,
) {
    stop_tab_drag_monitor(&app, &monitor, &tab_id, &source_window);
}

fn should_detach_on_miss(detach_on_miss: bool, source_tab_count: usize) -> bool {
    detach_on_miss && source_tab_count > 1
}

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

fn detached_window_position_from_cursor(
    cursor_x: f64,
    cursor_y: f64,
    scale_factor: f64,
    grab_offset_x: f64,
    grab_offset_y: f64,
) -> (f64, f64) {
    let scale_factor = scale_factor.max(0.1);
    (
        cursor_x / scale_factor - grab_offset_x.clamp(0.0, 320.0),
        cursor_y / scale_factor - grab_offset_y.clamp(0.0, CUSTOM_TITLEBAR_HEIGHT_CSS),
    )
}

fn detached_window_drop_position(
    app: &AppHandle,
    source_window: &str,
    grab_offset_x: f64,
    grab_offset_y: f64,
) -> Option<(f64, f64)> {
    let cursor = app.cursor_position().ok()?;
    let scale_factor = app
        .monitor_from_point(cursor.x, cursor.y)
        .ok()
        .flatten()
        .map(|monitor| monitor.scale_factor())
        .or_else(|| {
            app.get_webview_window(source_window)
                .and_then(|window| window.scale_factor().ok())
        })
        .unwrap_or(1.0);
    Some(detached_window_position_from_cursor(
        cursor.x,
        cursor.y,
        scale_factor,
        grab_offset_x,
        grab_offset_y,
    ))
}

fn detach_tab_at(
    tab_id: TabId,
    app: &AppHandle,
    ws: &SharedWorkspace,
    position: Option<(f64, f64)>,
) -> Result<WindowId, String> {
    let new_window = {
        let mut guard = ws
            .lock()
            .map_err(|e| format!("workspace lock poisoned: {e}"))?;
        guard.detach_tab(&tab_id)?
    };

    // Create the native window with the same label the workspace just minted.
    let mut builder =
        WebviewWindowBuilder::new(app, &new_window, WebviewUrl::App("index.html".into()))
            .title("Reader")
            .inner_size(900.0, 700.0)
            .min_inner_size(330.0, 480.0)
            .decorations(false);
    let (x, y) = position.unwrap_or((120.0, 120.0));
    builder = builder.position(x, y);
    builder
        .build()
        .map_err(|e| format!("create window '{new_window}': {e}"))?;
    broadcast(app, ws);
    Ok(new_window)
}

/// Detach a tab into a brand-new native window. The DocumentSession is not
/// recreated — only the tab's window_id changes (§18, Test 10).
#[tauri::command]
// WebviewWindowBuilder::build deadlocks on Windows from a synchronous command;
// keep this async so Tauri executes the window creation off the IPC main thread.
pub async fn detach_tab(
    tab_id: TabId,
    app: AppHandle,
    ws: State<'_, SharedWorkspace>,
) -> Result<WindowId, String> {
    detach_tab_at(tab_id, &app, &ws, None)
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

/// Finish a tab drag at the current global cursor position. A titlebar hit on
/// another Reader window joins that window; otherwise a multi-tab source may
/// detach while a one-tab source always remains its native window.
#[tauri::command]
// Tauri exposes command parameters as named IPC fields; keeping them flat
// preserves the generated frontend call contract.
#[allow(clippy::too_many_arguments)]
pub async fn complete_tab_drag(
    tab_id: TabId,
    source_window: WindowId,
    detach_on_miss: bool,
    grab_offset_x: f64,
    grab_offset_y: f64,
    app: AppHandle,
    ws: State<'_, SharedWorkspace>,
    monitor: State<'_, TabDragMonitorState>,
) -> Result<WindowId, String> {
    stop_tab_drag_monitor(&app, &monitor, &tab_id, &source_window);
    let (current_window, source_tab_count, dirty_markdown) = {
        let guard = ws
            .lock()
            .map_err(|e| format!("workspace lock poisoned: {e}"))?;
        let tab = guard
            .tabs
            .get(&tab_id)
            .ok_or_else(|| format!("tab not found: {tab_id}"))?;
        let document = guard.documents.get(&tab.document_id);
        (
            tab.window_id.clone(),
            guard
                .windows
                .get(&source_window)
                .map(|window| window.tab_ids.len())
                .unwrap_or(0),
            document.is_some_and(|document| {
                document.dirty && document.doc_type == DocumentType::Markdown
            }),
        )
    };

    // A duplicate/stale completion is harmless: report where the tab already
    // lives instead of moving or duplicating it again.
    if current_window != source_window {
        return Ok(current_window);
    }
    if dirty_markdown {
        return Ok(source_window);
    }

    if let Some(target_window) = find_dock_target(&app, &source_window) {
        let source_empty = {
            let mut guard = ws
                .lock()
                .map_err(|e| format!("workspace lock poisoned: {e}"))?;
            let current = guard
                .tabs
                .get(&tab_id)
                .map(|tab| tab.window_id.clone())
                .ok_or_else(|| format!("tab not found: {tab_id}"))?;
            if current != source_window {
                return Ok(current);
            }
            let position = guard
                .windows
                .get(&target_window)
                .map(|window| window.tab_ids.len())
                .unwrap_or(0);
            guard.move_tab(&tab_id, &target_window, position)?;
            guard
                .windows
                .get(&source_window)
                .map(|window| window.tab_ids.is_empty())
                .unwrap_or(true)
        };

        broadcast(&app, &ws);
        if let Some(target) = app.get_webview_window(&target_window) {
            let _ = target.unminimize();
            let _ = target.set_focus();
        }
        if source_empty && source_window != MAIN_WINDOW {
            if let Some(source) = app.get_webview_window(&source_window) {
                // Workspace state already proves this detached window empty.
                // Destroy directly so its frontend close guard cannot inspect
                // a stale pre-broadcast tab snapshot and prompt for a tab that
                // has already moved successfully.
                let _ = source.destroy();
            }
        }
        return Ok(target_window);
    }

    if should_detach_on_miss(detach_on_miss, source_tab_count) {
        let position =
            detached_window_drop_position(&app, &source_window, grab_offset_x, grab_offset_y);
        return detach_tab_at(tab_id, &app, &ws, position);
    }
    Ok(source_window)
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
    use super::{
        commit_pdf_working_copy, cursor_moved_enough, detached_window_position_from_cursor,
        encode_query_component, point_in_titlebar_zone, read_file_text, save_file_text,
        should_detach_on_miss,
    };

    #[test]
    fn docking_hit_test_uses_scaled_titlebar_band() {
        assert!(point_in_titlebar_zone(
            150.0, 140.0, 100.0, 100.0, 500.0, 1.25
        ));
        assert!(!point_in_titlebar_zone(
            150.0, 146.0, 100.0, 100.0, 500.0, 1.25
        ));
        assert!(!point_in_titlebar_zone(
            99.0, 120.0, 100.0, 100.0, 500.0, 1.25
        ));
        assert!(!point_in_titlebar_zone(
            600.0, 120.0, 100.0, 100.0, 500.0, 1.25
        ));
    }

    #[test]
    fn hover_raise_does_not_use_the_window_content_area() {
        assert!(point_in_titlebar_zone(
            450.0, 140.0, 100.0, 100.0, 500.0, 1.25
        ));
        assert!(!point_in_titlebar_zone(
            450.0, 500.0, 100.0, 100.0, 500.0, 1.25
        ));
    }

    #[test]
    fn native_drag_requires_real_pointer_travel() {
        assert!(!cursor_moved_enough(100.0, 100.0, 104.0, 100.0));
        assert!(cursor_moved_enough(100.0, 100.0, 104.1, 100.0));
    }

    #[test]
    fn detached_window_keeps_the_grab_point_under_the_cursor() {
        assert_eq!(
            detached_window_position_from_cursor(750.0, 450.0, 1.5, 120.0, 18.0),
            (380.0, 282.0)
        );
        // Hostile offsets are clamped to the tab/titlebar geometry.
        assert_eq!(
            detached_window_position_from_cursor(500.0, 400.0, 1.0, 999.0, 999.0),
            (180.0, 364.0)
        );
    }

    #[test]
    fn drag_preview_title_is_encoded_as_a_query_component() {
        assert_eq!(encode_query_component("A b/文"), "A%20b%2F%E6%96%87");
    }

    #[test]
    fn a_last_tab_never_detaches_on_a_missed_drop() {
        assert!(!should_detach_on_miss(true, 1));
        assert!(!should_detach_on_miss(false, 2));
        assert!(should_detach_on_miss(true, 2));
    }

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
