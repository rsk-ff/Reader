//! Markdown pagination through WebView2's print engine (`PrintToPdf`).
//!
//! The page puts a print copy in `#reader-print-root`, shown only in print
//! media; WebView2 lays it out on the chosen paper as a PDF, which the dialog
//! previews and prints like any other PDF.

use std::path::Path;
use std::time::Duration;

use tauri::WebviewWindow;
use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2Environment6, ICoreWebView2_7, COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT,
};
use webview2_com::PrintToPdfCompletedHandler;
use windows::core::{Interface, PCWSTR};

use super::MarkdownPage;

const MM_PER_INCH: f64 = 25.4;

pub async fn print_to_pdf(
    window: &WebviewWindow,
    path: &Path,
    page: &MarkdownPage,
) -> Result<(), String> {
    let (sender, receiver) = std::sync::mpsc::channel::<Result<(), String>>();
    let target: Vec<u16> = path
        .to_string_lossy()
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    let page = page.clone();
    window
        .with_webview(move |platform| {
            let done = sender.clone();
            // SAFETY: COM calls on the webview's own UI thread, which
            // `with_webview` guarantees; `target` lives until the call returns
            // (WebView2 copies the path).
            let started = unsafe {
                (|| -> windows::core::Result<()> {
                    let core = platform
                        .controller()
                        .CoreWebView2()?
                        .cast::<ICoreWebView2_7>()?;
                    let environment = platform.environment().cast::<ICoreWebView2Environment6>()?;
                    let settings = environment.CreatePrintSettings()?;
                    // The size already carries the orientation.
                    settings.SetOrientation(COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT)?;
                    settings.SetPageWidth(page.width_mm / MM_PER_INCH)?;
                    settings.SetPageHeight(page.height_mm / MM_PER_INCH)?;
                    let margin = page.margin_mm / MM_PER_INCH;
                    settings.SetMarginTop(margin)?;
                    settings.SetMarginBottom(margin)?;
                    settings.SetMarginLeft(margin)?;
                    settings.SetMarginRight(margin)?;
                    settings.SetShouldPrintBackgrounds(true)?;
                    settings.SetShouldPrintHeaderAndFooter(false)?;
                    let handler =
                        PrintToPdfCompletedHandler::create(Box::new(move |result, succeeded| {
                            let _ = done.send(match result {
                                Ok(()) if succeeded => Ok(()),
                                Ok(()) => Err("排版打印页面失败".into()),
                                Err(error) => Err(format!("排版打印页面失败：{error}")),
                            });
                            Ok(())
                        }));
                    core.PrintToPdf(PCWSTR(target.as_ptr()), &settings, &handler)
                })()
            };
            if let Err(error) = started {
                let _ = sender.send(Err(format!("排版打印页面失败：{error}")));
            }
        })
        .map_err(|error| format!("排版打印页面失败：{error}"))?;
    tauri::async_runtime::spawn_blocking(move || {
        receiver
            .recv_timeout(Duration::from_secs(120))
            .map_err(|_| "排版打印页面超时".to_string())?
    })
    .await
    .map_err(|error| format!("排版打印页面失败：{error}"))?
}
