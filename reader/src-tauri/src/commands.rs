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

const CUSTOM_TITLEBAR_HEIGHT_CSS: f64 = 36.0;
const TAB_DRAG_POLL_INTERVAL: Duration = Duration::from_millis(16);
const TAB_DRAG_TIMEOUT: Duration = Duration::from_secs(300);
const TAB_DRAG_MOVEMENT_THRESHOLD: f64 = 4.0;
const TAB_DRAG_RELEASED_EVENT: &str = "tab-drag://released";

struct ActiveTabDrag {
    tab_id: TabId,
    source_window: WindowId,
    source_is_drag_carrier: bool,
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

#[cfg(any(target_os = "windows", test))]
fn first_titlebar_candidate_by_z_order(
    candidates: &[(WindowId, isize)],
    z_order: &[isize],
) -> Option<WindowId> {
    z_order.iter().find_map(|handle| {
        candidates
            .iter()
            .find(|(_, candidate_handle)| candidate_handle == handle)
            .map(|(window_id, _)| window_id.clone())
    })
}

#[cfg(target_os = "windows")]
fn native_window_z_order() -> Vec<isize> {
    const GW_HWNDNEXT: u32 = 2;
    #[link(name = "user32")]
    extern "system" {
        fn GetTopWindow(window: isize) -> isize;
        fn GetWindow(window: isize, command: u32) -> isize;
    }

    let mut z_order = Vec::new();
    // SAFETY: both functions return desktop-owned HWND values and receive no
    // borrowed pointers. GW_HWNDNEXT eventually returns a null handle.
    let mut window = unsafe { GetTopWindow(0) };
    while window != 0 && z_order.len() < 4096 {
        z_order.push(window);
        window = unsafe { GetWindow(window, GW_HWNDNEXT) };
    }
    z_order
}

#[cfg(target_os = "windows")]
fn find_titlebar_target(app: &AppHandle, excluded_window: Option<&str>) -> Option<WindowId> {
    let cursor = app.cursor_position().ok()?;
    let candidates = app
        .webview_windows()
        .into_iter()
        .filter_map(|(label, window)| {
            if excluded_window == Some(label.as_str())
                || (label != MAIN_WINDOW && !label.starts_with("win-"))
                || !window.is_visible().unwrap_or(false)
            {
                return None;
            }
            let position = window.outer_position().ok()?;
            let size = window.outer_size().ok()?;
            let scale_factor = window.scale_factor().ok()?;
            if !point_in_titlebar_zone(
                cursor.x,
                cursor.y,
                f64::from(position.x),
                f64::from(position.y),
                f64::from(size.width),
                scale_factor,
            ) {
                return None;
            }
            let native_handle = window.hwnd().ok()?.0 as isize;
            Some((label, native_handle))
        })
        .collect::<Vec<_>>();
    first_titlebar_candidate_by_z_order(&candidates, &native_window_z_order())
}

#[cfg(not(target_os = "windows"))]
fn find_titlebar_target(app: &AppHandle, excluded_window: Option<&str>) -> Option<WindowId> {
    let cursor = app.cursor_position().ok()?;
    app.webview_windows()
        .into_iter()
        .find_map(|(label, window)| {
            if excluded_window == Some(label.as_str())
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

fn find_dock_target(app: &AppHandle, source_window: &str) -> Option<WindowId> {
    find_titlebar_target(app, Some(source_window))
}

fn find_hover_target(
    app: &AppHandle,
    source_window: &str,
    include_source: bool,
) -> Option<WindowId> {
    // Raising a target is intentionally limited to the same titlebar band
    // that can complete a dock. Multi-tab drags also include their stationary
    // source so returning to its visible strip restores it above prior targets.
    find_titlebar_target(app, (!include_source).then_some(source_window))
}

fn drag_carrier_window<'a>(
    source_window: &'a str,
    preview_window: Option<&'a str>,
    source_is_drag_carrier: bool,
) -> Option<&'a str> {
    preview_window.or(source_is_drag_carrier.then_some(source_window))
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

#[cfg(any(target_os = "windows", test))]
fn temporary_topmost_insert_after(topmost: bool) -> isize {
    if topmost {
        -1 // HWND_TOPMOST
    } else {
        -2 // HWND_NOTOPMOST
    }
}

#[cfg(target_os = "windows")]
fn set_temporary_topmost(app: &AppHandle, window_id: Option<&str>, topmost: bool) {
    const SWP_NOSIZE: u32 = 0x0001;
    const SWP_NOMOVE: u32 = 0x0002;
    const SWP_NOACTIVATE: u32 = 0x0010;
    #[link(name = "user32")]
    extern "system" {
        fn SetWindowPos(
            window: isize,
            insert_after: isize,
            x: i32,
            y: i32,
            width: i32,
            height: i32,
            flags: u32,
        ) -> i32;
    }

    if let Some(window_id) = window_id {
        if let Some(window) = app.get_webview_window(window_id) {
            let Ok(native_handle) = window.hwnd() else {
                return;
            };
            // SAFETY: the HWND belongs to a live Tauri window and SetWindowPos
            // receives no borrowed pointers. Omitting SWP_ASYNCWINDOWPOS makes
            // target-then-carrier calls establish a deterministic native order.
            let succeeded = unsafe {
                SetWindowPos(
                    native_handle.0 as isize,
                    temporary_topmost_insert_after(topmost),
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                )
            };
            if succeeded == 0 {
                log::warn!("failed to update temporary topmost state for '{window_id}'");
            }
        }
    }
}

#[cfg(not(target_os = "windows"))]
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
    let (old_target, new_target, drag_carrier) = {
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
        let drag_carrier = drag_carrier_window(
            &active.source_window,
            active.preview_window.as_deref(),
            active.source_is_drag_carrier,
        )
        .map(str::to_owned);
        (old_target, hover_target, drag_carrier)
    };

    set_temporary_topmost(app, old_target.as_deref(), false);
    set_temporary_topmost(app, new_target.as_deref(), true);
    // The target belongs in the topmost band, but the visual object being
    // dragged must be placed after it so the target cannot cover that object.
    set_temporary_topmost(app, drag_carrier.as_deref(), true);

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
        set_temporary_topmost(app, drag_carrier.as_deref(), false);
    }
    still_current
}

fn stop_tab_drag_monitor(
    app: &AppHandle,
    monitor: &TabDragMonitorState,
    tab_id: &str,
    source_window: &str,
) {
    let (source_window, hover_target, preview_window) = {
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
            .map(|active| {
                (
                    Some(active.source_window),
                    active.hover_target,
                    active.preview_window,
                )
            })
            .unwrap_or((None, None, None))
    };
    set_temporary_topmost(app, hover_target.as_deref(), false);
    set_temporary_topmost(app, source_window.as_deref(), false);
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
    set_temporary_topmost(app, Some(&active.source_window), false);
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
    let (generation, previous_source, previous_hover, previous_preview) = {
        let mut guard = monitor
            .0
            .lock()
            .map_err(|error| format!("tab drag monitor lock poisoned: {error}"))?;
        guard.generation = guard.generation.wrapping_add(1);
        let generation = guard.generation;
        let (previous_source, previous_hover, previous_preview) = guard
            .active
            .take()
            .map(|active| {
                (
                    Some(active.source_window),
                    active.hover_target,
                    active.preview_window,
                )
            })
            .unwrap_or((None, None, None));
        guard.active = Some(ActiveTabDrag {
            tab_id,
            source_window: source_window.clone(),
            source_is_drag_carrier: !already_started,
            detach_on_miss,
            grab_offset_x,
            grab_offset_y,
            hover_target: None,
            preview_window: None,
        });
        (
            generation,
            previous_source,
            previous_hover,
            previous_preview,
        )
    };
    set_temporary_topmost(&app, previous_source.as_deref(), false);
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
                    let in_source_titlebar = cursor_in_window_titlebar(&app, &source_window);
                    let hover_target = find_hover_target(&app, &source_window, already_started);
                    if !update_drag_hover(&app, &monitor, generation, hover_target.clone()) {
                        return;
                    }
                    if let Some(preview_window) = preview_window.as_deref() {
                        let over_other_window = hover_target
                            .as_deref()
                            .is_some_and(|target| target != source_window);
                        update_tab_drag_preview(
                            &app,
                            preview_window,
                            grab_offset_x,
                            grab_offset_y,
                            !in_source_titlebar || over_other_window,
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

/// The native window that receives files opened from outside the app
/// (OS double-click, second launch). The main window can be closed while
/// detached windows keep the app alive; files then go to a live window.
fn external_open_window(app: &AppHandle) -> WindowId {
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
    let (new_window, origin) = {
        let mut guard = ws
            .lock()
            .map_err(|e| format!("workspace lock poisoned: {e}"))?;
        let origin = guard.tabs.get(&tab_id).and_then(|tab| {
            let position = guard
                .windows
                .get(&tab.window_id)?
                .tab_ids
                .iter()
                .position(|id| id == &tab_id)?;
            Some((tab.window_id.clone(), position))
        });
        (guard.detach_tab(&tab_id)?, origin)
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
    if let Err(error) = builder.build() {
        // Without a native window the tab would be stranded; put it back.
        if let Ok(mut guard) = ws.lock() {
            if let Some((window, position)) = &origin {
                let _ = guard.move_tab(&tab_id, window, *position);
            }
            guard.windows.remove(&new_window);
        }
        broadcast(app, ws);
        return Err(format!("create window '{new_window}': {error}"));
    }
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
    // Only an existing window can receive a tab; detaching mints its own.
    if !guard.windows.contains_key(&target_window) {
        return Err(format!("window not found: {target_window}"));
    }
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
        let document = tab
            .document_id
            .as_ref()
            .and_then(|document_id| guard.documents.get(document_id));
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
        // A one-tab source window (main included) merged into the target, so
        // it goes away instead of staying open with no tabs. Its Destroyed
        // event cleans up the workspace slot.
        if source_empty {
            if let Some(source) = app.get_webview_window(&source_window) {
                // Workspace state already proves this window empty.
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

/// The canonical path of a saved Markdown document open in the workspace.
/// Text read/write commands only reach these files, never arbitrary paths.
fn open_markdown_path(ws: &SharedWorkspace, path: &str) -> Result<PathBuf, String> {
    let canonical =
        std::fs::canonicalize(path).map_err(|e| format!("canonicalize '{path}': {e}"))?;
    let guard = ws
        .lock()
        .map_err(|e| format!("workspace lock poisoned: {e}"))?;
    guard
        .documents
        .values()
        .any(|document| {
            !document.untitled
                && document.doc_type == DocumentType::Markdown
                && document.path == canonical
        })
        .then_some(canonical)
        .ok_or_else(|| format!("Markdown document is not open in this workspace: {path}"))
}

/// Read a Markdown file as editor text and the on-disk format it came from.
fn read_markdown_file(path: &Path) -> Result<(String, MarkdownDiskState), String> {
    let stamp = disk_stamp(path);
    let bytes = std::fs::read(path).map_err(|e| format!("read '{}': {e}", path.display()))?;
    let (text, bom, crlf) = decode_markdown(bytes, path)?;
    Ok((text, MarkdownDiskState { stamp, bom, crlf }))
}

fn remember_markdown_disk(ws: &SharedWorkspace, path: &Path, state: MarkdownDiskState) {
    if let Ok(mut guard) = ws.lock() {
        if let Some(document) = guard
            .documents
            .values_mut()
            .find(|document| !document.untitled && document.path == path)
        {
            document.markdown_disk = Some(state);
        }
    }
}

/// Read an open Markdown document as UTF-8 editor text (LF, no BOM). Used by
/// the Markdown adapter; the original BOM and line endings are remembered.
#[tauri::command]
pub fn read_file_text(path: String, ws: State<'_, SharedWorkspace>) -> Result<String, String> {
    let canonical = open_markdown_path(&ws, &path)?;
    let (text, state) = read_markdown_file(&canonical)?;
    remember_markdown_disk(&ws, &canonical, state);
    Ok(text)
}

fn save_file_text_impl(path: &Path, content: &[u8]) -> Result<(), String> {
    let tmp = PathBuf::from(format!("{}.tmp", path.to_string_lossy()));
    std::fs::write(&tmp, content).map_err(|e| format!("write tmp '{}': {e}", tmp.display()))?;
    let f = std::fs::OpenOptions::new()
        .write(true)
        .open(&tmp)
        .map_err(|e| format!("reopen tmp '{}': {e}", tmp.display()))?;
    f.sync_all()
        .map_err(|e| format!("fsync tmp '{}': {e}", tmp.display()))?;
    drop(f);
    std::fs::rename(&tmp, path)
        .map_err(|e| format!("rename '{}' -> '{}': {e}", tmp.display(), path.display()))?;
    Ok(())
}

/// Save an open Markdown document with its original BOM and line endings.
/// Unless `overwrite`, refuse when the file changed on disk since Reader last
/// read or wrote it, so another program's edits are not silently replaced.
fn save_open_markdown(
    ws: &SharedWorkspace,
    path: &Path,
    content: &str,
    overwrite: bool,
) -> Result<(), String> {
    let mut guard = ws
        .lock()
        .map_err(|e| format!("workspace lock poisoned: {e}"))?;
    let document = guard
        .documents
        .values_mut()
        .find(|document| !document.untitled && document.path == path)
        .ok_or_else(|| format!("Markdown document is not open: {}", path.display()))?;
    let state = document.markdown_disk.unwrap_or_default();
    if !overwrite && state.stamp.is_some() && disk_stamp(path) != state.stamp {
        return Err(format!(
            "{EXTERNAL_CHANGE_ERROR}“{}”在 Reader 外被修改过。",
            path.display()
        ));
    }
    save_file_text_impl(path, &encode_markdown(content, state.bom, state.crlf))?;
    document.markdown_disk = Some(MarkdownDiskState {
        stamp: disk_stamp(path),
        ..state
    });
    Ok(())
}

/// Atomically write `content` to `path` (§7 transactional save):
///   foo.md → foo.md.tmp → fsync → rename → foo.md
#[tauri::command]
pub fn save_file_text(
    path: String,
    content: String,
    overwrite: Option<bool>,
    ws: State<'_, SharedWorkspace>,
) -> Result<(), String> {
    let canonical = open_markdown_path(&ws, &path)?;
    save_open_markdown(&ws, &canonical, &content, overwrite.unwrap_or(false))
}

fn canonical_markdown_target(path: &str) -> Result<PathBuf, String> {
    let requested = PathBuf::from(path);
    if !requested.is_absolute() {
        return Err(format!("save path must be absolute: {path}"));
    }
    let extension = requested
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase);
    if !matches!(extension.as_deref(), Some("md" | "markdown")) {
        return Err(format!(
            "Markdown save path must end in .md or .markdown: {path}"
        ));
    }
    let file_name = requested
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| format!("save path has no valid file name: {path}"))?;
    let parent = requested
        .parent()
        .ok_or_else(|| format!("save path has no parent directory: {path}"))?
        .canonicalize()
        .map_err(|error| format!("cannot canonicalize save directory for '{path}': {error}"))?;
    let target = parent.join(file_name);
    if target.exists() {
        target
            .canonicalize()
            .map_err(|error| format!("cannot canonicalize save path '{path}': {error}"))
    } else {
        Ok(target)
    }
}

/// First save for an in-memory Markdown document. The caller chooses the path
/// only at save time; the existing document/tab identity remains stable.
#[tauri::command]
pub fn save_markdown_document_as(
    document_id: String,
    path: String,
    content: String,
    app: AppHandle,
    ws: State<'_, SharedWorkspace>,
) -> Result<String, String> {
    let target = canonical_markdown_target(&path)?;
    let mut guard = ws
        .lock()
        .map_err(|error| format!("workspace lock poisoned: {error}"))?;
    guard.validate_markdown_save_target(&document_id, &target)?;
    save_file_text_impl(&target, content.as_bytes())?;
    let canonical = target.canonicalize().map_err(|error| {
        format!(
            "cannot canonicalize saved Markdown '{}': {error}",
            target.display()
        )
    })?;
    guard.finalize_markdown_save(&document_id, canonical.clone())?;
    if let Some(document) = guard.documents.get_mut(&document_id) {
        document.markdown_disk = Some(MarkdownDiskState {
            stamp: disk_stamp(&canonical),
            ..Default::default()
        });
    }
    drop(guard);
    broadcast(&app, &ws);
    Ok(canonical.to_string_lossy().into_owned())
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

/// Resolve (creating if needed) the working copy for an open PDF. Callers hold
/// the PDFium lock, which serializes every working-copy create, write, save
/// and discard; the workspace lock is only held for bookkeeping, not copying.
fn prepare_pdf_working_copy(
    ws: &SharedWorkspace,
    path: &str,
) -> Result<(DocumentId, PathBuf), String> {
    let (document_id, plan) = ws
        .lock()
        .map_err(|error| format!("workspace lock poisoned: {error}"))?
        .plan_pdf_working_copy(path)?;
    let working_copy = match plan {
        PdfWorkingCopyPlan::Existing(working_copy) => working_copy,
        PdfWorkingCopyPlan::Create {
            document_id,
            source,
        } => {
            let working_copy = create_pdf_working_copy(&source)?;
            let installed = ws
                .lock()
                .map_err(|error| format!("workspace lock poisoned: {error}"))
                .and_then(|mut guard| {
                    guard.install_pdf_working_copy(&document_id, working_copy.clone())
                });
            if let Err(error) = installed {
                let _ = std::fs::remove_file(&working_copy);
                return Err(error);
            }
            working_copy
        }
    };
    Ok((document_id, working_copy))
}

/// Apply one PDFium write to the document's working copy and mark it dirty,
/// all inside the PDFium lock so a concurrent save or discard cannot drop it.
async fn mutate_pdf<T>(
    app: &AppHandle,
    path: String,
    operation: impl FnOnce(&str) -> Result<T, String> + Send + 'static,
) -> Result<T, String>
where
    T: Send + 'static,
{
    let worker_app = app.clone();
    let result = pdf_worker(move || {
        crate::pdf::pdfium::with_pdfium_lock(|| {
            let ws = worker_app.state::<SharedWorkspace>();
            let (document_id, working_copy) = prepare_pdf_working_copy(ws.inner(), &path)?;
            let value = operation(&working_copy.to_string_lossy())?;
            ws.lock()
                .map_err(|error| format!("workspace lock poisoned: {error}"))?
                .set_dirty(&document_id, true);
            Ok(value)
        })
    })
    .await;
    if result.is_ok() {
        broadcast(app, app.state::<SharedWorkspace>().inner());
    }
    result
}

fn commit_pdf_working_copy(original_path: &str, working_path: &str) -> Result<u64, String> {
    let bytes = std::fs::read(working_path)
        .map_err(|error| format!("read PDF working copy '{working_path}': {error}"))?;
    crate::pdf::pdfium::atomic_write(original_path, &bytes)
}

fn remove_working_copy_file(working_copy: &Path) -> Result<(), String> {
    match std::fs::remove_file(working_copy) {
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => Err(format!(
            "remove PDF working copy '{}': {error}",
            working_copy.display()
        )),
        _ => Ok(()),
    }
}

/// Commit staged PDFium writes to the original file. Runs inside the PDFium
/// lock so no mutation can land between the commit and clearing dirty state.
fn save_pdf_locked(ws: &SharedWorkspace, path: &str) -> Result<u64, String> {
    let (document_id, original_path, working_copy) = {
        let guard = ws
            .lock()
            .map_err(|error| format!("workspace lock poisoned: {error}"))?;
        let document = guard
            .documents
            .values()
            .find(|document| document.path.to_str() == Some(path))
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

    let len = if let Some(worker_path) = working_copy {
        // Every mutation already produced a complete PDFium-saved file.
        // Save only commits those staged bytes to the original path.
        commit_pdf_working_copy(&original_path, &worker_path)?
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
        if let Err(error) = remove_working_copy_file(&working_copy) {
            log::warn!("{error}");
        }
    }
    Ok(len)
}

/// Abandon staged PDFium writes. Runs inside the PDFium lock for the same
/// reason as `save_pdf_locked`.
fn discard_pdf_locked(ws: &SharedWorkspace, path: &str) -> Result<(), String> {
    let working_copy = {
        let mut guard = ws
            .lock()
            .map_err(|error| format!("workspace lock poisoned: {error}"))?;
        let document = guard
            .documents
            .values_mut()
            .find(|document| document.path.to_str() == Some(path))
            .ok_or_else(|| format!("document is not open: {path}"))?;
        let working_copy = document.pdf_working_copy.take();
        document.revision += 1;
        document.dirty = false;
        document.last_saved_revision = document.revision;
        working_copy
    };
    match working_copy {
        Some(working_copy) => remove_working_copy_file(&working_copy),
        None => Ok(()),
    }
}

#[tauri::command]
pub async fn create_annotation(
    path: String,
    annotation: PdfAnnotation,
    app: AppHandle,
) -> Result<PdfAnnotation, String> {
    mutate_pdf(&app, path, move |worker_path| {
        backend().create_annotation(worker_path, annotation)
    })
    .await
}

#[tauri::command]
pub async fn update_annotation(
    path: String,
    annotation: PdfAnnotation,
    app: AppHandle,
) -> Result<(), String> {
    mutate_pdf(&app, path, move |worker_path| {
        backend().update_annotation(worker_path, annotation)
    })
    .await
}

#[tauri::command]
pub async fn delete_annotation(
    path: String,
    page_index: usize,
    id: String,
    app: AppHandle,
) -> Result<(), String> {
    mutate_pdf(&app, path, move |worker_path| {
        backend().delete_annotation(worker_path, page_index, &id)
    })
    .await
}

#[tauri::command]
pub async fn save_document(path: String, app: AppHandle) -> Result<u64, String> {
    let worker_app = app.clone();
    let len = pdf_worker(move || {
        crate::pdf::pdfium::with_pdfium_lock(|| {
            save_pdf_locked(worker_app.state::<SharedWorkspace>().inner(), &path)
        })
    })
    .await?;
    broadcast(&app, app.state::<SharedWorkspace>().inner());
    Ok(len)
}

/// Abandon staged PDFium writes and return PDF.js to the untouched original.
#[tauri::command]
pub async fn discard_pdf_changes(path: String, app: AppHandle) -> Result<(), String> {
    let worker_app = app.clone();
    let result = pdf_worker(move || {
        crate::pdf::pdfium::with_pdfium_lock(|| {
            discard_pdf_locked(worker_app.state::<SharedWorkspace>().inner(), &path)
        })
    })
    .await;
    broadcast(&app, app.state::<SharedWorkspace>().inner());
    result
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
) -> Result<usize, String> {
    mutate_pdf(&app, path, move |worker_path| {
        backend().insert_blank_page(worker_path, index, size, reference_page_index)
    })
    .await
}

#[tauri::command]
pub async fn delete_page(path: String, index: usize, app: AppHandle) -> Result<(), String> {
    mutate_pdf(&app, path, move |worker_path| {
        backend().delete_page(worker_path, index)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::{
        canonical_markdown_target, commit_pdf_working_copy, cursor_moved_enough,
        detached_window_position_from_cursor, drag_carrier_window, encode_query_component,
        first_titlebar_candidate_by_z_order, open_markdown_path, point_in_titlebar_zone,
        read_markdown_file, save_file_text_impl, save_open_markdown, should_detach_on_miss,
        temporary_topmost_insert_after,
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
    fn hover_target_follows_native_z_order_and_can_return_to_source() {
        let candidates = vec![
            ("A".to_owned(), 10),
            ("B".to_owned(), 20),
            ("C".to_owned(), 30),
        ];
        assert_eq!(
            first_titlebar_candidate_by_z_order(&candidates, &[99, 20, 10, 30]),
            Some("B".to_owned())
        );
        assert_eq!(
            first_titlebar_candidate_by_z_order(&candidates, &[99, 10, 20, 30]),
            Some("A".to_owned())
        );
    }

    #[test]
    fn drag_preview_or_native_source_stays_above_the_hover_target() {
        assert_eq!(
            drag_carrier_window("A", Some("preview"), false),
            Some("preview")
        );
        assert_eq!(drag_carrier_window("B", None, true), Some("B"));
        assert_eq!(drag_carrier_window("A", None, false), None);
    }

    #[test]
    fn temporary_topmost_uses_explicit_win32_insert_after_handles() {
        assert_eq!(temporary_topmost_insert_after(true), -1);
        assert_eq!(temporary_topmost_insert_after(false), -2);
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

        save_file_text_impl(&path, b"first").expect("first save");
        save_file_text_impl(&path, b"second").expect("replacement save");

        assert_eq!(
            read_markdown_file(&path).expect("read saved file").0,
            "second"
        );
        assert!(!std::path::Path::new(&format!("{path_string}.tmp")).exists());

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn text_commands_only_reach_open_markdown_documents() {
        use crate::workspace::{AppWorkspace, MAIN_WINDOW};
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        let open = std::env::temp_dir().join(format!("reader-open-{unique}.md"));
        let closed = std::env::temp_dir().join(format!("reader-closed-{unique}.md"));
        let pdf = std::env::temp_dir().join(format!("reader-open-{unique}.pdf"));
        for path in [&open, &closed, &pdf] {
            std::fs::write(path, "x").unwrap();
        }
        let ws = std::sync::Mutex::new(AppWorkspace::default());
        {
            let mut guard = ws.lock().unwrap();
            guard.ensure_main();
            guard
                .open_document(open.to_str().unwrap(), &MAIN_WINDOW.into())
                .unwrap();
            guard
                .open_document(pdf.to_str().unwrap(), &MAIN_WINDOW.into())
                .unwrap();
        }

        assert_eq!(
            open_markdown_path(&ws, open.to_str().unwrap()).unwrap(),
            open.canonicalize().unwrap()
        );
        assert!(open_markdown_path(&ws, closed.to_str().unwrap()).is_err());
        assert!(open_markdown_path(&ws, pdf.to_str().unwrap()).is_err());
        for path in [open, closed, pdf] {
            let _ = std::fs::remove_file(path);
        }
    }

    #[test]
    fn markdown_save_keeps_crlf_and_refuses_an_outside_edit_unless_overwriting() {
        use crate::workspace::{AppWorkspace, MAIN_WINDOW};
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        let path = std::env::temp_dir().join(format!("reader-crlf-{unique}.md"));
        std::fs::write(&path, "# A\r\nbody\r\n").unwrap();
        let ws = std::sync::Mutex::new(AppWorkspace::default());
        ws.lock()
            .unwrap()
            .open_document(path.to_str().unwrap(), &MAIN_WINDOW.into())
            .unwrap();
        let canonical = path.canonicalize().unwrap();
        let (text, state) = read_markdown_file(&canonical).unwrap();
        assert_eq!(text, "# A\nbody\n");
        ws.lock()
            .unwrap()
            .documents
            .values_mut()
            .next()
            .unwrap()
            .markdown_disk = Some(state);

        save_open_markdown(&ws, &canonical, "# A\nedited\n", false).unwrap();
        assert_eq!(std::fs::read(&canonical).unwrap(), b"# A\r\nedited\r\n");

        // Another program rewrites the file (different length => new stamp).
        std::fs::write(&canonical, "# outside edit\r\n").unwrap();
        let refused = save_open_markdown(&ws, &canonical, "# mine\n", false).unwrap_err();
        assert!(refused.starts_with(super::EXTERNAL_CHANGE_ERROR));
        assert_eq!(std::fs::read(&canonical).unwrap(), b"# outside edit\r\n");
        save_open_markdown(&ws, &canonical, "# mine\n", true).unwrap();
        assert_eq!(std::fs::read(&canonical).unwrap(), b"# mine\r\n");
        // The overwrite refreshed the stamp, so the next save is allowed.
        save_open_markdown(&ws, &canonical, "# again\n", false).unwrap();
        let _ = std::fs::remove_file(canonical);
    }

    #[test]
    fn markdown_save_target_requires_an_absolute_markdown_path() {
        assert!(canonical_markdown_target("relative-note.md").is_err());
        let invalid = std::env::temp_dir().join("reader-note.txt");
        assert!(canonical_markdown_target(invalid.to_str().unwrap()).is_err());

        let valid = std::env::temp_dir().join("reader-note.md");
        let canonical = canonical_markdown_target(valid.to_str().unwrap()).unwrap();
        assert!(canonical.is_absolute());
        assert_eq!(
            canonical.extension().and_then(|value| value.to_str()),
            Some("md")
        );
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
