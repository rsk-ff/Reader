//! Tab drag, docking and detaching between native windows.

use super::*;

pub(crate) const CUSTOM_TITLEBAR_HEIGHT_CSS: f64 = 36.0;
pub(crate) const TAB_DRAG_POLL_INTERVAL: Duration = Duration::from_millis(16);
pub(crate) const TAB_DRAG_TIMEOUT: Duration = Duration::from_secs(300);
pub(crate) const TAB_DRAG_MOVEMENT_THRESHOLD: f64 = 4.0;
pub(crate) const TAB_DRAG_RELEASED_EVENT: &str = "tab-drag://released";

pub(crate) struct ActiveTabDrag {
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
pub(crate) struct TabDragMonitor {
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
pub(crate) struct TabDragReleasedPayload {
    tab_id: TabId,
    detach_on_miss: bool,
    grab_offset_x: f64,
    grab_offset_y: f64,
}

pub(crate) fn point_in_titlebar_zone(
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
pub(crate) fn first_titlebar_candidate_by_z_order(
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
pub(crate) fn native_window_z_order() -> Vec<isize> {
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
pub(crate) fn find_titlebar_target(
    app: &AppHandle,
    excluded_window: Option<&str>,
) -> Option<WindowId> {
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
pub(crate) fn find_titlebar_target(
    app: &AppHandle,
    excluded_window: Option<&str>,
) -> Option<WindowId> {
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

pub(crate) fn find_dock_target(app: &AppHandle, source_window: &str) -> Option<WindowId> {
    find_titlebar_target(app, Some(source_window))
}

pub(crate) fn find_hover_target(
    app: &AppHandle,
    source_window: &str,
    include_source: bool,
) -> Option<WindowId> {
    // Raising a target is intentionally limited to the same titlebar band
    // that can complete a dock. Multi-tab drags also include their stationary
    // source so returning to its visible strip restores it above prior targets.
    find_titlebar_target(app, (!include_source).then_some(source_window))
}

pub(crate) fn drag_carrier_window<'a>(
    source_window: &'a str,
    preview_window: Option<&'a str>,
    source_is_drag_carrier: bool,
) -> Option<&'a str> {
    preview_window.or(source_is_drag_carrier.then_some(source_window))
}

pub(crate) fn cursor_in_window_titlebar(app: &AppHandle, window_id: &str) -> bool {
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

pub(crate) fn cursor_moved_enough(
    start_x: f64,
    start_y: f64,
    current_x: f64,
    current_y: f64,
) -> bool {
    (current_x - start_x).hypot(current_y - start_y) > TAB_DRAG_MOVEMENT_THRESHOLD
}

#[cfg(target_os = "windows")]
pub(crate) fn primary_mouse_button_down() -> bool {
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
pub(crate) fn primary_mouse_button_down() -> bool {
    false
}

#[cfg(any(target_os = "windows", test))]
pub(crate) fn temporary_topmost_insert_after(topmost: bool) -> isize {
    if topmost {
        -1 // HWND_TOPMOST
    } else {
        -2 // HWND_NOTOPMOST
    }
}

#[cfg(target_os = "windows")]
pub(crate) fn set_temporary_topmost(app: &AppHandle, window_id: Option<&str>, topmost: bool) {
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
pub(crate) fn set_temporary_topmost(app: &AppHandle, window_id: Option<&str>, topmost: bool) {
    if let Some(window_id) = window_id {
        if let Some(window) = app.get_webview_window(window_id) {
            let _ = window.set_always_on_top(topmost);
        }
    }
}

pub(crate) fn encode_query_component(value: &str) -> String {
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

pub(crate) fn create_tab_drag_preview(
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

pub(crate) fn destroy_tab_drag_preview(app: &AppHandle, window_id: Option<&str>) {
    if let Some(window_id) = window_id {
        if let Some(window) = app.get_webview_window(window_id) {
            let _ = window.destroy();
        }
    }
}

pub(crate) fn update_tab_drag_preview(
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

pub(crate) fn update_drag_hover(
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

pub(crate) fn stop_tab_drag_monitor(
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

pub(crate) fn finish_monitored_tab_drag(
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

pub(crate) fn should_detach_on_miss(detach_on_miss: bool, source_tab_count: usize) -> bool {
    detach_on_miss && source_tab_count > 1
}

pub(crate) fn detached_window_position_from_cursor(
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

pub(crate) fn detached_window_drop_position(
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

pub(crate) fn detach_tab_at(
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

#[cfg(test)]
mod tests {
    use super::*;

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
}
