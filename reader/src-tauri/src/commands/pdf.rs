//! PDF annotation, page and save commands over private working copies.

use super::*;

// ---- PDF annotation commands (§24) ----

use crate::pdf::{PdfAnnotation, PdfMutationBackend, PdfiumBackend};

pub(crate) fn backend() -> PdfiumBackend {
    PdfiumBackend::new()
}

pub(crate) async fn pdf_worker<T>(
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
pub(crate) fn prepare_pdf_working_copy(
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
pub(crate) async fn mutate_pdf<T>(
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

pub(crate) fn commit_pdf_working_copy(
    original_path: &str,
    working_path: &str,
) -> Result<u64, String> {
    let bytes = std::fs::read(working_path)
        .map_err(|error| format!("read PDF working copy '{working_path}': {error}"))?;
    crate::pdf::pdfium::atomic_write(original_path, &bytes)
}

pub(crate) fn remove_working_copy_file(working_copy: &Path) -> Result<(), String> {
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
pub(crate) fn save_pdf_locked(ws: &SharedWorkspace, path: &str) -> Result<u64, String> {
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
pub(crate) fn discard_pdf_locked(ws: &SharedWorkspace, path: &str) -> Result<(), String> {
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
    use super::*;

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
