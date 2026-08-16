//! PDF annotation backend (spec §4, §5, §24).
//!
//! `PdfMutationBackend` is the seam that keeps the application layer free of
//! concrete `pdfium-render` types. The current implementation uses pdfium-render
//! + the dynamic PDFium library; a future backend can swap in without touching
//! the command layer or the frontend.

pub mod annotation;
pub mod pdfium;

pub use annotation::{AnnotationType, PageSize, PdfAnnotation, Point, Quad, Rect};
pub use pdfium::{PdfiumBackend, handle_page_render, page_img_url};

/// The mutation contract every backend must satisfy (§4). All coordinates are
/// in PDF user space (origin bottom-left, y up, units = points).
pub trait PdfMutationBackend: Send + Sync {
    /// Read all annotations on the given page.
    fn get_annotations(&self, path: &str, page_index: usize) -> Result<Vec<PdfAnnotation>, String>;

    /// Create a new annotation. Returns the annotation with its assigned id.
    fn create_annotation(&self, path: &str, ann: PdfAnnotation) -> Result<PdfAnnotation, String>;

    /// Update an existing annotation by id (remove + recreate, §5).
    fn update_annotation(&self, path: &str, ann: PdfAnnotation) -> Result<(), String>;

    /// Delete an annotation by id.
    fn delete_annotation(&self, path: &str, page_index: usize, id: &str) -> Result<(), String>;

    /// Insert a blank page at the given index (§6). `size_kind` selects the
    /// page dimensions; "same" copies the size of `reference_page_index`.
    fn insert_blank_page(
        &self,
        path: &str,
        index: usize,
        size: PageSize,
        reference_page_index: Option<usize>,
    ) -> Result<usize, String>;

    /// Delete the page at the given index (§6 — including inserted blank pages).
    fn delete_page(&self, path: &str, index: usize) -> Result<(), String>;

    /// Persist all changes back to the file atomically (§7). Returns the new
    /// byte length so the caller can refresh the DocumentSession file_size.
    fn save(&self, path: &str) -> Result<u64, String>;
}
