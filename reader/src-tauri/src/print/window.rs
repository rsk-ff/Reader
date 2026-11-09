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
    if let Err(error) = builder.build() {
        app.state::<PrintSources>().remove(&label);
        return Err(format!("open print window: {error}"));
    }
    Ok(())
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
