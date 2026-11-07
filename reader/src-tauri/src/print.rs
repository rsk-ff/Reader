//! Windows system print dialog for documents.
//!
//! WebView2's own `window.print()` opens the Edge print preview. Reader uses
//! the Windows print dialog instead (as Notepad and Word do) through
//! `ICoreWebView2_16::ShowPrintUI`, which prints the webview's top-level page.
//! Markdown prints the main window, whose print stylesheet shows only the
//! print copy. A PDF is opened as the top-level page of a tiny helper window,
//! so the WebView2 PDF engine prints it as vector pages.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// Label of the helper window that hosts a PDF for printing.
pub const PDF_PRINT_WINDOW: &str = "print-pdf";

/// The helper window is closed after this long even if no new print starts.
const PDF_PRINT_WINDOW_LIFETIME: std::time::Duration = std::time::Duration::from_secs(30 * 60);

#[cfg(windows)]
fn show_system_print_ui(window: &WebviewWindow) -> Result<(), String> {
    window
        .with_webview(|platform| {
            use webview2_com::Microsoft::Web::WebView2::Win32::{
                ICoreWebView2_16, COREWEBVIEW2_PRINT_DIALOG_KIND_SYSTEM,
            };
            use windows_core::Interface;
            // SAFETY: COM calls on the webview's own UI thread, which
            // `with_webview` guarantees.
            let result = unsafe {
                platform
                    .controller()
                    .CoreWebView2()
                    .and_then(|core| core.cast::<ICoreWebView2_16>())
                    .and_then(|core| core.ShowPrintUI(COREWEBVIEW2_PRINT_DIALOG_KIND_SYSTEM))
            };
            if let Err(error) = result {
                log::warn!("ShowPrintUI failed: {error}");
            }
        })
        .map_err(|error| format!("print dialog: {error}"))
}

#[cfg(not(windows))]
fn show_system_print_ui(window: &WebviewWindow) -> Result<(), String> {
    window
        .eval("window.print()")
        .map_err(|error| format!("print dialog: {error}"))
}

/// Show the Windows print dialog for the calling window's page.
#[tauri::command]
pub fn show_print_dialog(window: WebviewWindow) -> Result<(), String> {
    show_system_print_ui(&window)
}

/// Open the PDF at a `reader-file` URL in a helper window and show the Windows
/// print dialog for it once the PDF engine has loaded the document.
#[tauri::command]
pub fn print_pdf(url: String, window: WebviewWindow, app: AppHandle) -> Result<(), String> {
    if !url.starts_with("http://reader-file.localhost/") {
        return Err("print_pdf only prints open Reader PDFs".into());
    }
    close_pdf_print_window(&app);
    let target: tauri::Url = url
        .parse()
        .map_err(|error| format!("PDF print URL: {error}"))?;

    // A 1x1 borderless window centred on the caller: the dialog opens over
    // the document, and nothing else of the helper is visible.
    let mut builder =
        WebviewWindowBuilder::new(&app, PDF_PRINT_WINDOW, WebviewUrl::External(target))
            .title("打印")
            .inner_size(1.0, 1.0)
            .decorations(false)
            .resizable(false)
            .skip_taskbar(true)
            .focused(false)
            .shadow(false)
            .on_page_load(|webview, payload| {
                if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                    if let Err(error) = show_system_print_ui(&webview) {
                        log::warn!("{error}");
                    }
                }
            });
    if let (Ok(position), Ok(size)) = (window.outer_position(), window.outer_size()) {
        let scale = window.scale_factor().unwrap_or(1.0);
        builder = builder.position(
            (position.x as f64 + size.width as f64 / 2.0) / scale,
            (position.y as f64 + size.height as f64 / 2.0) / scale,
        );
    }
    builder
        .build()
        .map_err(|error| format!("open PDF print window: {error}"))?;

    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(PDF_PRINT_WINDOW_LIFETIME);
        close_pdf_print_window(&handle);
    });
    Ok(())
}

/// Close the PDF print helper, if any. Also called when the last document
/// window closes so the helper never keeps the app running.
pub fn close_pdf_print_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(PDF_PRINT_WINDOW) {
        let _ = window.destroy();
    }
}
