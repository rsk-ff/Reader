//! The print dialog's own native window.
//!
//! Printing opens a separate window owned by the document window, so it can
//! be moved and resized outside a small main window. The document window
//! hands over what to print (a PDF path, or a Markdown snapshot) through
//! `print_open_window`; the print window reads it back with
//! `print_window_source`. A document window has at most one print window.

use std::collections::HashMap;
use std::sync::Mutex;

use serde_json::Value;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// Print windows are labelled `print-<document window label>`.
pub const PRINT_WINDOW_PREFIX: &str = "print-";

const WIDTH: f64 = 980.0;
const HEIGHT: f64 = 680.0;

/// What each open print window prints, by window label.
#[derive(Default)]
pub struct PrintSources(Mutex<HashMap<String, Value>>);

impl PrintSources {
    pub fn remove(&self, label: &str) {
        if let Ok(mut sources) = self.0.lock() {
            sources.remove(label);
        }
    }
}

/// Open (or bring forward) the print window for the calling document window.
// WebviewWindowBuilder::build deadlocks on Windows from a synchronous command
// (the new webview never loads and the window can't close); keep this async so
// Tauri builds the window off the IPC main thread, like `detach_tab`.
#[tauri::command]
pub async fn print_open_window(
    app: AppHandle,
    window: WebviewWindow,
    source: Value,
) -> Result<(), String> {
    let label = format!("{PRINT_WINDOW_PREFIX}{}", window.label());
    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.unminimize();
        return existing
            .set_focus()
            .map_err(|error| format!("focus print window: {error}"));
    }
    app.state::<PrintSources>()
        .0
        .lock()
        .map_err(|error| format!("print sources lock poisoned: {error}"))?
        .insert(label.clone(), source);

    let mut builder = WebviewWindowBuilder::new(
        &app,
        &label,
        WebviewUrl::App(format!("index.html?print={label}").into()),
    )
    .title("打印")
    .inner_size(WIDTH, HEIGHT)
    .min_inner_size(640.0, 480.0)
    .decorations(false)
    .resizable(true)
    // Only a close button: no minimize or maximize.
    .minimizable(false)
    .maximizable(false)
    .focused(true);
    // Owned by the document window: stays above it and minimizes with it,
    // but moves and resizes on its own.
    builder = builder
        .parent(&window)
        .map_err(|error| format!("print window owner: {error}"))?;
    if let (Ok(position), Ok(size), Ok(scale)) = (
        window.outer_position(),
        window.outer_size(),
        window.scale_factor(),
    ) {
        let x = position.x as f64 / scale + (size.width as f64 / scale - WIDTH) / 2.0;
        let y = position.y as f64 / scale + (size.height as f64 / scale - HEIGHT) / 2.0;
        builder = builder.position(x.max(0.0), y.max(0.0));
    } else {
        builder = builder.center();
    }
    let print_window = match builder.build() {
        Ok(print_window) => print_window,
        Err(error) => {
            app.state::<PrintSources>().remove(&label);
            return Err(format!("open print window: {error}"));
        }
    };
    #[cfg(windows)]
    no_snap_overlay::install(&print_window);
    #[cfg(not(windows))]
    let _ = print_window;
    Ok(())
}

/// Keeps tauri-plugin-frame's snap overlay out of the print window.
///
/// The plugin puts an invisible "maximize button" child window on every
/// window, one button left of close, and broadcasts its hover and click
/// events to all windows, so hovering that spot in the print window lit up
/// (and clicking it would toggle) the main window's maximize button. The
/// print window has no maximize button, so it closes each overlay as soon as
/// the plugin creates one (the plugin may create it again on each page load).
#[cfg(windows)]
mod no_snap_overlay {
    use tauri::WebviewWindow;
    use windows::core::{w, PCWSTR};
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::UI::Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass};
    use windows::Win32::UI::WindowsAndMessaging::{
        FindWindowExW, GetClassNameW, PostMessageW, WM_CLOSE, WM_CREATE, WM_NCDESTROY,
        WM_PARENTNOTIFY,
    };

    const OVERLAY_CLASS: PCWSTR = w!("TauriFrameSnapOverlay");
    const SUBCLASS_ID: usize = 0x0070_7269_6e74; // "print"

    pub fn install(window: &WebviewWindow) {
        let Ok(hwnd) = window.hwnd() else { return };
        let hwnd = hwnd.0 as isize;
        let _ = window.run_on_main_thread(move || unsafe {
            let hwnd = HWND(hwnd as _);
            let _ = SetWindowSubclass(hwnd, Some(subclass_proc), SUBCLASS_ID, 0);
            // An overlay created before the subclass was in place.
            if let Ok(overlay) = FindWindowExW(Some(hwnd), None, OVERLAY_CLASS, PCWSTR::null()) {
                if !overlay.is_invalid() {
                    close(overlay);
                }
            }
        });
    }

    unsafe fn close(overlay: HWND) {
        let _ = PostMessageW(Some(overlay), WM_CLOSE, WPARAM(0), LPARAM(0));
    }

    unsafe fn is_overlay(child: HWND) -> bool {
        let mut name = [0u16; 32];
        let len = GetClassNameW(child, &mut name);
        len > 0 && name[..len as usize] == *OVERLAY_CLASS.as_wide()
    }

    unsafe extern "system" fn subclass_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        _id: usize,
        _data: usize,
    ) -> LRESULT {
        if msg == WM_PARENTNOTIFY && (wparam.0 & 0xffff) as u32 == WM_CREATE {
            let child = HWND(lparam.0 as _);
            if is_overlay(child) {
                close(child);
            }
        } else if msg == WM_NCDESTROY {
            let _ = RemoveWindowSubclass(hwnd, Some(subclass_proc), SUBCLASS_ID);
        }
        DefSubclassProc(hwnd, msg, wparam, lparam)
    }
}

/// What the calling print window prints.
#[tauri::command]
pub fn print_window_source(app: AppHandle, window: WebviewWindow) -> Result<Value, String> {
    app.state::<PrintSources>()
        .0
        .lock()
        .map_err(|error| format!("print sources lock poisoned: {error}"))?
        .get(window.label())
        .cloned()
        .ok_or_else(|| "这个打印窗口没有要打印的内容".to_string())
}
