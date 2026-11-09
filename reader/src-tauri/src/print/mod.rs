//! Reader's own print dialog backend.
//!
//! The dialog itself is web UI. This module gives it what only the OS has:
//! the printer list, each printer's papers and duplex/colour support, the
//! printable area, the driver's own properties dialog, and the print job.
//!
//! Everything prints from a PDF "snapshot" in a private temp folder: a copy
//! of an open PDF's current bytes (the working copy, so unsaved annotations
//! print), or the PDF WebView2 lays out for a Markdown document. The dialog
//! previews that same file with PDF.js, so the preview matches the paper.
//! The dialog computes where each page lands on each sheet; this module only
//! draws those placements, with PDFium rendering straight into the printer
//! DC (vector output, no rasterising).

use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, WebviewWindow};

use crate::workspace::{AppWorkspace, SharedWorkspace};

#[cfg(windows)]
mod markdown_pdf;
pub mod window;
#[cfg(windows)]
mod windows;

pub use window::{PrintSources, PRINT_WINDOW_PREFIX};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrinterInfo {
    pub name: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperInfo {
    /// `DMPAPER_*` id.
    pub id: i16,
    pub name: String,
    /// Portrait size.
    pub width_mm: f64,
    pub height_mm: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Duplex {
    None,
    Long,
    Short,
}

/// The settings Reader's dialog shows that a DEVMODE also carries.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceSettings {
    pub paper_id: Option<i16>,
    pub landscape: bool,
    pub duplex: Duplex,
    pub color: bool,
    pub copies: u32,
    pub collate: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrinterCapabilities {
    pub papers: Vec<PaperInfo>,
    pub duplex: bool,
    pub color: bool,
    pub collate: bool,
    pub max_copies: u32,
    /// The printer's defaults, or what `devmode` holds when one was given.
    pub defaults: DeviceSettings,
}

/// Paper and printable area in millimetres, in the sheet's orientation.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageArea {
    pub paper_width_mm: f64,
    pub paper_height_mm: f64,
    pub printable_left_mm: f64,
    pub printable_top_mm: f64,
    pub printable_width_mm: f64,
    pub printable_height_mm: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PropertiesResult {
    /// The driver's private settings; passed back with the job.
    pub devmode: Vec<u8>,
    pub settings: DeviceSettings,
}

/// One document page drawn on a sheet. Millimetres from the paper's top-left
/// corner; `rotate` is extra clockwise quarter turns on top of the page's own.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Placement {
    pub page: u32,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub rotate: u8,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintJob {
    pub snapshot: String,
    pub printer: String,
    pub devmode: Option<Vec<u8>>,
    pub title: String,
    pub settings: DeviceSettings,
    pub annotations: bool,
    pub sheets: Vec<Vec<Placement>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownPage {
    /// Paper size already in the chosen orientation.
    pub width_mm: f64,
    pub height_mm: f64,
    pub margin_mm: f64,
}

// ---- snapshots ----

fn snapshot_dir() -> PathBuf {
    std::env::temp_dir().join("reader-print")
}

/// A fresh snapshot file path and its id (the file name).
fn new_snapshot() -> Result<(String, PathBuf), String> {
    static COUNTER: AtomicU64 = AtomicU64::new(1);
    let directory = snapshot_dir();
    std::fs::create_dir_all(&directory).map_err(|error| format!("create print folder: {error}"))?;
    remove_stale_snapshots(&directory);
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    let id = format!(
        "print-{}-{nonce}-{}.pdf",
        std::process::id(),
        COUNTER.fetch_add(1, Ordering::Relaxed)
    );
    let path = directory.join(&id);
    Ok((id, path))
}

/// Snapshots left behind by a crash are removed a day later.
fn remove_stale_snapshots(directory: &std::path::Path) {
    let Ok(entries) = std::fs::read_dir(directory) else {
        return;
    };
    let day = std::time::Duration::from_secs(24 * 60 * 60);
    for entry in entries.flatten() {
        let stale = entry
            .metadata()
            .and_then(|metadata| metadata.modified())
            .ok()
            .and_then(|modified| modified.elapsed().ok())
            .is_some_and(|age| age > day);
        if stale {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

/// Resolve a snapshot id to its file; ids are bare names Reader created.
pub(crate) fn snapshot_path(id: &str) -> Result<PathBuf, String> {
    let valid = id.starts_with("print-")
        && id.ends_with(".pdf")
        && id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '.'))
        && !id.contains("..");
    if !valid {
        return Err(format!("invalid print snapshot: {id}"));
    }
    Ok(snapshot_dir().join(id))
}

async fn blocking<T: Send + 'static>(
    operation: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(operation)
        .await
        .map_err(|error| format!("print worker failed: {error}"))?
}

/// Copy an open PDF's current bytes (the working copy when there are unsaved
/// changes) for previewing and printing.
#[tauri::command]
pub async fn print_snapshot_pdf(app: AppHandle, path: String) -> Result<String, String> {
    blocking(move || {
        crate::pdf::pdfium::with_pdfium_lock(|| {
            let canonical = AppWorkspace::canonicalize(&path)?;
            let source = app
                .state::<SharedWorkspace>()
                .lock()
                .map_err(|error| format!("workspace lock poisoned: {error}"))?
                .pdf_source_path(&canonical)
                .ok_or_else(|| format!("PDF is not open: {path}"))?;
            let (id, target) = new_snapshot()?;
            std::fs::copy(&source, &target)
                .map_err(|error| format!("copy PDF for print: {error}"))?;
            Ok(id)
        })
    })
    .await
}

/// The snapshot's bytes, for the PDF.js preview.
#[tauri::command]
pub async fn print_read_snapshot(snapshot: String) -> Result<tauri::ipc::Response, String> {
    let path = snapshot_path(&snapshot)?;
    let bytes = blocking(move || {
        std::fs::read(&path).map_err(|error| format!("read print snapshot: {error}"))
    })
    .await?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub fn print_release_snapshot(snapshot: String) -> Result<(), String> {
    let path = snapshot_path(&snapshot)?;
    match std::fs::remove_file(path) {
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => {
            Err(format!("remove print snapshot: {error}"))
        }
        _ => Ok(()),
    }
}

// ---- printers (Windows only) ----

#[cfg(not(windows))]
const UNSUPPORTED: &str = "打印仅支持 Windows";

#[tauri::command]
pub async fn print_list_printers() -> Result<Vec<PrinterInfo>, String> {
    #[cfg(windows)]
    return blocking(windows::list_printers).await;
    #[cfg(not(windows))]
    Err(UNSUPPORTED.into())
}

#[tauri::command]
pub async fn print_printer_capabilities(
    printer: String,
    devmode: Option<Vec<u8>>,
) -> Result<PrinterCapabilities, String> {
    #[cfg(windows)]
    return blocking(move || windows::capabilities(&printer, devmode.as_deref())).await;
    #[cfg(not(windows))]
    {
        let _ = (printer, devmode);
        Err(UNSUPPORTED.into())
    }
}

#[tauri::command]
pub async fn print_page_area(
    printer: String,
    devmode: Option<Vec<u8>>,
    paper_id: Option<i16>,
    landscape: bool,
) -> Result<PageArea, String> {
    #[cfg(windows)]
    return blocking(move || windows::page_area(&printer, devmode.as_deref(), paper_id, landscape))
        .await;
    #[cfg(not(windows))]
    {
        let _ = (printer, devmode, paper_id, landscape);
        Err(UNSUPPORTED.into())
    }
}

/// Show the printer driver's own settings dialog. `None` when cancelled.
#[tauri::command]
#[allow(clippy::needless_return)]
pub async fn print_printer_properties(
    window: WebviewWindow,
    printer: String,
    devmode: Option<Vec<u8>>,
    settings: DeviceSettings,
) -> Result<Option<PropertiesResult>, String> {
    #[cfg(windows)]
    {
        let hwnd = window
            .hwnd()
            .map_err(|error| format!("window handle: {error}"))?
            .0 as isize;
        let (sender, receiver) = std::sync::mpsc::channel();
        // The driver dialog is modal to the document window, so it runs on
        // that window's UI thread like any other owned dialog.
        window
            .run_on_main_thread(move || {
                let result = windows::properties(hwnd, &printer, devmode.as_deref(), &settings);
                let _ = sender.send(result);
            })
            .map_err(|error| format!("printer properties: {error}"))?;
        return blocking(move || {
            receiver
                .recv()
                .map_err(|error| format!("printer properties: {error}"))?
        })
        .await;
    }
    #[cfg(not(windows))]
    {
        let _ = (window, printer, devmode, settings);
        Err(UNSUPPORTED.into())
    }
}

/// Lay out the Markdown print copy the page already placed in
/// `#reader-print-root` as a PDF, through WebView2's own print engine.
#[tauri::command]
#[allow(clippy::needless_return)]
pub async fn print_markdown_pdf(
    window: WebviewWindow,
    page: MarkdownPage,
) -> Result<String, String> {
    #[cfg(windows)]
    {
        let (id, path) = new_snapshot()?;
        markdown_pdf::print_to_pdf(&window, &path, &page).await?;
        return Ok(id);
    }
    #[cfg(not(windows))]
    {
        let _ = (window, page);
        Err(UNSUPPORTED.into())
    }
}

/// Send the sheets to the printer. Returns once the spooler has the job.
#[tauri::command]
pub async fn print_submit(job: PrintJob) -> Result<(), String> {
    #[cfg(windows)]
    return blocking(move || {
        let path = snapshot_path(&job.snapshot)?;
        crate::pdf::pdfium::with_pdfium_lock(|| windows::print(&path, &job))
    })
    .await;
    #[cfg(not(windows))]
    {
        let _ = job;
        Err(UNSUPPORTED.into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_ids_cannot_leave_the_print_folder() {
        assert!(snapshot_path("print-1-2-3.pdf").is_ok());
        for bad in [
            "../x.pdf",
            "print-..\\x.pdf",
            "print-a/b.pdf",
            "other.pdf",
            "print-1.txt",
        ] {
            assert!(snapshot_path(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn new_snapshot_ids_are_valid() {
        let (id, path) = new_snapshot().unwrap();
        assert_eq!(snapshot_path(&id).unwrap(), path);
    }
}
