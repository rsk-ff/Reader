//! pdfium-render implementation of `PdfMutationBackend` (§4).
//!
//! All `pdfium-render` concrete types are confined to this module. The command
//! layer only sees `PdfMutationBackend`.

use std::sync::OnceLock;

use pdfium_render::prelude::*;

use super::annotation::{AnnotationType, PageSize, PdfAnnotation, Quad, Rect};
use super::PdfMutationBackend;

/// Serializes ALL PDFium access (process-global singleton is not thread-safe).
/// Command handlers and tests both acquire this before touching PDFium.
pub fn pdfium_lock() -> std::sync::MutexGuard<'static, ()> {
    use std::sync::Mutex;
    static LOCK: Mutex<()> = Mutex::new(());
    LOCK.lock().unwrap_or_else(|e| e.into_inner())
}

/// A single shared `Pdfium` instance. `Pdfium::default()` binds to a dynamic
/// library named `pdfium.dll`/`libpdfium.so`/`libpdfium.dylib`, resolved from
/// the executable directory / `PATH` (§34 — we ship `pdfium.dll` alongside).
fn pdfium() -> &'static Pdfium {
    static PDFIUM: OnceLock<Pdfium> = OnceLock::new();
    PDFIUM.get_or_init(Pdfium::default)
}

pub struct PdfiumBackend;

impl PdfiumBackend {
    pub fn new() -> Self {
        let _ = pdfium();
        Self
    }
}

impl Default for PdfiumBackend {
    fn default() -> Self {
        Self::new()
    }
}

// ---- color/coord helpers ----

fn parse_color(hex: &str) -> PdfColor {
    let h = hex.trim_start_matches('#');
    let (r, g, b) = if h.len() == 6 {
        (
            u8::from_str_radix(&h[0..2], 16).unwrap_or(0),
            u8::from_str_radix(&h[2..4], 16).unwrap_or(0),
            u8::from_str_radix(&h[4..6], 16).unwrap_or(0),
        )
    } else {
        (255, 213, 79)
    };
    PdfColor::new(r, g, b, 255)
}

fn color_with_opacity(hex: &str, opacity: f32) -> PdfColor {
    let base = parse_color(hex);
    let a = (opacity.clamp(0.0, 1.0) * 255.0).round() as u8;
    PdfColor::new(base.red(), base.green(), base.blue(), a)
}

fn color_to_hex(c: PdfColor) -> String {
    format!("#{:02x}{:02x}{:02x}", c.red(), c.green(), c.blue())
}

fn load_doc(path: &str) -> Result<PdfDocument<'static>, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("read '{path}': {e}"))?;
    pdfium()
        .load_pdf_from_byte_vec(bytes, None)
        .map_err(|e| format!("pdfium load: {e}"))
}

fn save_doc_bytes(doc: &PdfDocument<'_>) -> Result<Vec<u8>, String> {
    doc.save_to_bytes().map_err(|e| format!("pdfium save: {e}"))
}

fn atomic_write(path: &str, bytes: &[u8]) -> Result<u64, String> {
    let tmp = format!("{path}.tmp");
    std::fs::write(&tmp, bytes).map_err(|e| format!("write tmp '{tmp}': {e}"))?;
    // Reopen with write access so sync_all (FlushFileBuffers) is permitted on Windows.
    let f = std::fs::OpenOptions::new()
        .write(true)
        .open(&tmp)
        .map_err(|e| format!("reopen tmp '{tmp}': {e}"))?;
    f.sync_all().map_err(|e| format!("fsync tmp '{tmp}': {e}"))?;
    drop(f);
    std::fs::rename(&tmp, path).map_err(|e| format!("rename '{tmp}' -> '{path}': {e}"))?;
    Ok(bytes.len() as u64)
}

fn map_annot_type(ty: PdfPageAnnotationType) -> Option<AnnotationType> {
    match ty {
        PdfPageAnnotationType::Highlight => Some(AnnotationType::Highlight),
        PdfPageAnnotationType::Underline => Some(AnnotationType::Underline),
        PdfPageAnnotationType::Strikeout => Some(AnnotationType::Strikeout),
        PdfPageAnnotationType::Text => Some(AnnotationType::Note),
        PdfPageAnnotationType::FreeText => Some(AnnotationType::FreeText),
        PdfPageAnnotationType::Ink => Some(AnnotationType::Ink),
        _ => None,
    }
}

impl PdfMutationBackend for PdfiumBackend {
    fn get_annotations(&self, path: &str, page_index: usize) -> Result<Vec<PdfAnnotation>, String> {
        let doc = load_doc(path)?;
        let page = doc
            .pages()
            .get(page_index as i32)
            .map_err(|e| format!("page {page_index}: {e}"))?;
        let annotations = page.annotations();
        let mut out = Vec::with_capacity(annotations.len());
        for i in 0..annotations.len() {
            let ann = match annotations.get(i) {
                Ok(a) => a,
                Err(_) => continue,
            };
            let mapped = match map_annot_type(ann.annotation_type()) {
                Some(t) => t,
                None => continue,
            };
            let bounds = ann.bounds().unwrap_or(PdfRect::ZERO);
            let color = ann.fill_color().unwrap_or(PdfColor::new(255, 213, 79, 255));
            let text = ann.contents();
            let id = format!("page:{page_index}:idx:{i}");
            let mut ann_model = PdfAnnotation {
                id,
                page_index,
                annotation_type: mapped,
                rect: Rect {
                    bottom: bounds.bottom().value,
                    left: bounds.left().value,
                    top: bounds.top().value,
                    right: bounds.right().value,
                },
                quad_points: vec![],
                ink_paths: vec![],
                color: color_to_hex(color),
                opacity: color.alpha() as f32 / 255.0,
                text,
                created_at: ann.creation_date(),
                modified_at: ann.modification_date(),
            };
            if ann.has_attachment_points() {
                for ap in ann.attachment_points().iter() {
                    ann_model.quad_points.push(Quad {
                        x1: ap.x1().value,
                        y1: ap.y1().value,
                        x2: ap.x2().value,
                        y2: ap.y2().value,
                        x3: ap.x3().value,
                        y3: ap.y3().value,
                        x4: ap.x4().value,
                        y4: ap.y4().value,
                    });
                }
            }
            out.push(ann_model);
        }
        Ok(out)
    }

    fn create_annotation(&self, path: &str, ann: PdfAnnotation) -> Result<PdfAnnotation, String> {
        let mut doc = load_doc(path)?;
        // pages_mut().get() returns an owned PdfPage handle (cheap, handle-based).
        let mut page = doc
            .pages_mut()
            .get(ann.page_index as i32)
            .map_err(|e| format!("page {}: {}", ann.page_index, e))?;
        let annotations = page.annotations_mut();
        let color = color_with_opacity(&ann.color, ann.opacity);
        let bounds = PdfRect::new(
            PdfPoints::new(ann.rect.bottom),
            PdfPoints::new(ann.rect.left),
            PdfPoints::new(ann.rect.top),
            PdfPoints::new(ann.rect.right),
        );

        match ann.annotation_type {
            AnnotationType::Highlight => {
                let mut created = annotations
                    .create_highlight_annotation()
                    .map_err(|e| format!("create highlight: {e}"))?;
                created.set_fill_color(color).map_err(|e| format!("set color: {e}"))?;
                let aps = created.attachment_points_mut();
                for q in &ann.quad_points {
                    aps.create_attachment_point_at_end(PdfQuadPoints::new(
                        PdfPoints::new(q.x1), PdfPoints::new(q.y1),
                        PdfPoints::new(q.x2), PdfPoints::new(q.y2),
                        PdfPoints::new(q.x3), PdfPoints::new(q.y3),
                        PdfPoints::new(q.x4), PdfPoints::new(q.y4),
                    )).map_err(|e| format!("add quad: {e}"))?;
                }
                if ann.rect.right > ann.rect.left {
                    created.set_bounds(bounds).map_err(|e| format!("set bounds: {e}"))?;
                }
                if let Some(t) = &ann.text {
                    created.set_contents(t).map_err(|e| format!("set contents: {e}"))?;
                }
            }
            AnnotationType::Underline => {
                let mut created = annotations
                    .create_underline_annotation()
                    .map_err(|e| format!("create underline: {e}"))?;
                created.set_fill_color(color).map_err(|e| format!("set color: {e}"))?;
                let aps = created.attachment_points_mut();
                for q in &ann.quad_points {
                    aps.create_attachment_point_at_end(PdfQuadPoints::new(
                        PdfPoints::new(q.x1), PdfPoints::new(q.y1),
                        PdfPoints::new(q.x2), PdfPoints::new(q.y2),
                        PdfPoints::new(q.x3), PdfPoints::new(q.y3),
                        PdfPoints::new(q.x4), PdfPoints::new(q.y4),
                    )).map_err(|e| format!("add quad: {e}"))?;
                }
                if ann.rect.right > ann.rect.left {
                    created.set_bounds(bounds).map_err(|e| format!("set bounds: {e}"))?;
                }
            }
            AnnotationType::Strikeout => {
                let mut created = annotations
                    .create_strikeout_annotation()
                    .map_err(|e| format!("create strikeout: {e}"))?;
                created.set_fill_color(color).map_err(|e| format!("set color: {e}"))?;
                let aps = created.attachment_points_mut();
                for q in &ann.quad_points {
                    aps.create_attachment_point_at_end(PdfQuadPoints::new(
                        PdfPoints::new(q.x1), PdfPoints::new(q.y1),
                        PdfPoints::new(q.x2), PdfPoints::new(q.y2),
                        PdfPoints::new(q.x3), PdfPoints::new(q.y3),
                        PdfPoints::new(q.x4), PdfPoints::new(q.y4),
                    )).map_err(|e| format!("add quad: {e}"))?;
                }
                if ann.rect.right > ann.rect.left {
                    created.set_bounds(bounds).map_err(|e| format!("set bounds: {e}"))?;
                }
            }
            AnnotationType::Note => {
                let mut created = annotations
                    .create_text_annotation(ann.text.as_deref().unwrap_or(""))
                    .map_err(|e| format!("create note: {e}"))?;
                created.set_fill_color(color).map_err(|e| format!("set color: {e}"))?;
                created.set_bounds(bounds).map_err(|e| format!("set bounds: {e}"))?;
            }
            AnnotationType::FreeText => {
                let mut created = annotations
                    .create_free_text_annotation(ann.text.as_deref().unwrap_or(""))
                    .map_err(|e| format!("create free text: {e}"))?;
                created.set_fill_color(color).map_err(|e| format!("set color: {e}"))?;
                created.set_bounds(bounds).map_err(|e| format!("set bounds: {e}"))?;
            }
            AnnotationType::Ink => {
                let mut created = annotations
                    .create_ink_annotation()
                    .map_err(|e| format!("create ink: {e}"))?;
                created.set_stroke_color(color).map_err(|e| format!("set color: {e}"))?;
                // Ink drawn as line path objects inside the annotation.
                for path in &ann.ink_paths {
                    for w in path.windows(2) {
                        let p1 = &w[0];
                        let p2 = &w[1];
                        // create_path_object_line already adds the object to the collection.
                        let _ = created
                            .objects_mut()
                            .create_path_object_line(
                                PdfPoints::new(p1.x),
                                PdfPoints::new(p1.y),
                                PdfPoints::new(p2.x),
                                PdfPoints::new(p2.y),
                                color,
                                PdfPoints::new(1.5),
                            )
                            .map_err(|e| format!("ink line: {e}"))?;
                    }
                }
                if ann.rect.right > ann.rect.left {
                    created.set_bounds(bounds).map_err(|e| format!("set bounds: {e}"))?;
                }
            }
        }
        drop(page);
        let bytes = save_doc_bytes(&doc)?;
        atomic_write(path, &bytes)?;
        Ok(ann)
    }

    fn update_annotation(&self, path: &str, ann: PdfAnnotation) -> Result<(), String> {
        // §5: read old → remove → recreate.
        self.delete_annotation(path, ann.page_index, &ann.id)?;
        let mut fresh = ann.clone();
        fresh.id = format!("page:{}:upd:{}", fresh.page_index, uuid_seed());
        self.create_annotation(path, fresh)?;
        Ok(())
    }

    fn delete_annotation(&self, path: &str, page_index: usize, id: &str) -> Result<(), String> {
        let mut doc = load_doc(path)?;
        let mut page = doc
            .pages_mut()
            .get(page_index as i32)
            .map_err(|e| format!("page {page_index}: {e}"))?;
        // id format: page:<idx>:idx:<i>  (from get_annotations) or page:<idx>:upd:<...>
        let idx = id.rsplit(':').next().and_then(|s| s.parse::<usize>().ok());
        if let Some(i) = idx {
            let annotations = page.annotations_mut();
            if i < annotations.len() {
                let ann = annotations
                    .get(i)
                    .map_err(|e| format!("get annot {i}: {e}"))?;
                annotations
                    .delete_annotation(ann)
                    .map_err(|e| format!("delete annot {i}: {e}"))?;
            }
        }
        drop(page);
        let bytes = save_doc_bytes(&doc)?;
        atomic_write(path, &bytes)?;
        Ok(())
    }

    fn save(&self, path: &str) -> Result<u64, String> {
        let doc = load_doc(path)?;
        let bytes = save_doc_bytes(&doc)?;
        atomic_write(path, &bytes)
    }

    fn insert_blank_page(
        &self,
        path: &str,
        index: usize,
        size: PageSize,
        reference_page_index: Option<usize>,
    ) -> Result<usize, String> {
        let mut doc = load_doc(path)?;
        let total = doc.pages().len() as usize;
        // Clamp index into [0, total] so callers can say "after the last page"
        // by passing index == total.
        let idx = index.min(total) as i32;

        // Resolve the paper size.
        let paper = match size {
            PageSize::A4 => PdfPagePaperSize::a4(),
            PageSize::Letter => PdfPagePaperSize::new_portrait(PdfPagePaperStandardSize::USLetterAnsiA),
            PageSize::Same => {
                let ref_idx = reference_page_index.unwrap_or(0) as i32;
                let ref_page = doc
                    .pages()
                    .get(ref_idx)
                    .map_err(|e| format!("reference page {}: {}", ref_idx, e))?;
                PdfPagePaperSize::new_custom(ref_page.width(), ref_page.height())
            }
            PageSize::Custom => PdfPagePaperSize::new_custom(
                PdfPoints::new(595.0),
                PdfPoints::new(842.0),
            ),
        };

        let _page = doc
            .pages_mut()
            .create_page_at_index(paper, idx)
            .map_err(|e| format!("create page at {idx}: {e}"))?;
        let bytes = save_doc_bytes(&doc)?;
        atomic_write(path, &bytes)?;
        // Return the index where the page landed.
        Ok(idx as usize)
    }

    fn delete_page(&self, path: &str, index: usize) -> Result<(), String> {
        let mut doc = load_doc(path)?;
        let total = doc.pages().len() as usize;
        if total == 0 {
            return Err("cannot delete page from empty document".into());
        }
        if index >= total {
            return Err(format!("page index {index} out of range (0..{total})"));
        }
        // pdfium-render exposes page deletion via PdfPage::delete (consumes the page).
        let page = doc
            .pages_mut()
            .get(index as i32)
            .map_err(|e| format!("get page {index}: {e}"))?;
        page.delete().map_err(|e| format!("delete page {index}: {e}"))?;
        let bytes = save_doc_bytes(&doc)?;
        atomic_write(path, &bytes)?;
        Ok(())
    }
}

fn uuid_seed() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(1);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!(
        "{}-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0),
        n
    )
}

// ---- Rendering: PDFium rasterizes pages (no pdf.js) ----
// PDFium is Chrome's engine; it handles every PDF (annotated, odd fonts) without
// crashing. Pages render to PNG; a text layer (coords from PDFium text segments)
// provides selection + search. (§4: "PDF.js → other renderer" adapter seam.)

/// Page size at scale=1 (unscaled, in PDF points).
#[derive(Clone, serde::Serialize)]
pub struct PageInfoDTO {
    pub page_number: usize,
    pub w1: f32,
    pub h1: f32,
    pub rotation: i32,
}

/// All page sizes in one call — replaces the pdf.js getPage() loop that crashed.
pub fn get_page_infos(path: &str) -> Result<Vec<PageInfoDTO>, String> {
    let _g = pdfium_lock();
    let doc = load_doc(path)?;
    let mut out = Vec::with_capacity(doc.pages().len() as usize);
    for i in 0..doc.pages().len() {
        let page = doc.pages().get(i as i32).map_err(|e| format!("page {i}: {e}"))?;
        let rot = page.rotation().map(|r| r.as_degrees() as i32).unwrap_or(0);
        out.push(PageInfoDTO {
            page_number: i as usize + 1,
            w1: page.width().value,
            h1: page.height().value,
            rotation: rot,
        });
    }
    Ok(out)
}

/// Render a page to PNG bytes at the given scale. The caller sets scale =
/// css_scale * devicePixelRatio for crisp rendering on HiDPI.
pub fn render_page_png(path: &str, page_index: usize, scale: f32) -> Result<Vec<u8>, String> {
    let _g = pdfium_lock();
    let doc = load_doc(path)?;
    let page = doc
        .pages()
        .get(page_index as i32)
        .map_err(|e| format!("page {page_index}: {e}"))?;
    let w = (page.width().value * scale).max(1.0) as i32;
    let h = (page.height().value * scale).max(1.0) as i32;
    let bmp = page
        .render_with_config(
            &PdfRenderConfig::new()
                .set_target_width(w)
                .set_maximum_height(h),
        )
        .map_err(|e| format!("render p{page_index}: {e}"))?;
    let img = bmp.as_image().map_err(|e| format!("image: {e}"))?;
    let rgba = img.as_rgba8().ok_or("not rgba8")?;
    let mut buf = Vec::with_capacity(rgba.len() / 2);
    use image::ImageEncoder;
    image::codecs::png::PngEncoder::new(&mut buf)
        .write_image(rgba.as_raw(), rgba.width(), rgba.height(), image::ExtendedColorType::Rgba8)
        .map_err(|e| format!("png: {e}"))?;
    Ok(buf)
}

/// Text segment with bounding box (PDF coords, origin bottom-left). Used for
/// the selection/search text layer overlaid on the rendered bitmap.
#[derive(Clone, serde::Serialize)]
pub struct TextSegment {
    pub text: String,
    pub left: f32,
    pub bottom: f32,
    pub right: f32,
    pub top: f32,
}

pub fn get_page_text(path: &str, page_index: usize) -> Result<Vec<TextSegment>, String> {
    let _g = pdfium_lock();
    let doc = load_doc(path)?;
    let page = doc
        .pages()
        .get(page_index as i32)
        .map_err(|e| format!("page {page_index}: {e}"))?;
    let text = page.text().map_err(|e| format!("text: {e}"))?;
    let mut out = Vec::new();
    for seg in text.segments().iter() {
        let b = seg.bounds();
        out.push(TextSegment {
            text: seg.text(),
            left: b.left().value,
            bottom: b.bottom().value,
            right: b.right().value,
            top: b.top().value,
        });
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn fixture(name: &str) -> (std::path::PathBuf, std::path::PathBuf) {
        // copy a fixture to temp so tests don't mutate the original; unique per
        // test name + thread to avoid parallel-test collisions on Windows.
        let src = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("tests")
            .join("fixtures")
            .join(name);
        let dst = std::env::temp_dir().join(format!(
            "reader-annot-{}-{name}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        fs::copy(&src, &dst).expect("copy fixture");
        (src, dst)
    }

    #[test]
    fn create_and_read_back_highlight() {
        let _g = pdfium_lock();
        let (_src, dst) = fixture("text-3.pdf");
        let backend = PdfiumBackend::new();
        let path = dst.to_str().unwrap();

        // Before: no annotations on page 0.
        let before = backend.get_annotations(path, 0).expect("get before");
        assert!(before.is_empty(), "expected no annotations before create");

        // Create a highlight with quad points over some text.
        let ann = PdfAnnotation {
            id: "test".into(),
            page_index: 0,
            annotation_type: AnnotationType::Highlight,
            rect: Rect { bottom: 720.0, left: 70.0, top: 780.0, right: 300.0 },
            quad_points: vec![Quad {
                x1: 70.0, y1: 720.0, x2: 300.0, y2: 720.0,
                x3: 70.0, y3: 780.0, x4: 300.0, y4: 780.0,
            }],
            ink_paths: vec![],
            color: "#ffd54f".into(),
            opacity: 0.4,
            text: Some("highlighted by test".into()),
            created_at: None,
            modified_at: None,
        };
        backend.create_annotation(path, ann.clone()).expect("create");

        // After: one highlight annotation.
        let after = backend.get_annotations(path, 0).expect("get after");
        assert_eq!(after.len(), 1, "expected 1 annotation after create");
        assert_eq!(after[0].annotation_type, AnnotationType::Highlight);
        assert!(!after[0].quad_points.is_empty(), "highlight should have quad points");
        assert_eq!(after[0].text.as_deref(), Some("highlighted by test"));

        // File should have grown (annotations add bytes).
        let size = fs::metadata(&dst).map(|m| m.len()).unwrap_or(0);
        assert!(size > 0, "file should exist after save");

        let _ = fs::remove_file(&dst);
    }

    #[test]
    fn create_and_delete_annotation() {
        let _g = pdfium_lock();
        let (_src, dst) = fixture("text-3.pdf");
        let backend = PdfiumBackend::new();
        let path = dst.to_str().unwrap();

        let ann = PdfAnnotation {
            id: "test".into(),
            page_index: 0,
            annotation_type: AnnotationType::Note,
            rect: Rect { bottom: 700.0, left: 70.0, top: 740.0, right: 110.0 },
            quad_points: vec![],
            ink_paths: vec![],
            color: "#ffd54f".into(),
            opacity: 1.0,
            text: Some("a note".into()),
            created_at: None,
            modified_at: None,
        };
        backend.create_annotation(path, ann).expect("create note");
        let after = backend.get_annotations(path, 0).expect("get after create");
        assert_eq!(after.len(), 1);

        // Delete by the id returned from get_annotations.
        backend.delete_annotation(path, 0, &after[0].id).expect("delete");
        let after_del = backend.get_annotations(path, 0).expect("get after delete");
        assert!(after_del.is_empty(), "expected no annotations after delete");

        let _ = fs::remove_file(&dst);
    }

    #[test]
    fn create_freetext_and_save() {
        let _g = pdfium_lock();
        let (_src, dst) = fixture("blank-10.pdf");
        let backend = PdfiumBackend::new();
        let path = dst.to_str().unwrap();

        let ann = PdfAnnotation {
            id: "test".into(),
            page_index: 0,
            annotation_type: AnnotationType::FreeText,
            rect: Rect { bottom: 700.0, left: 70.0, top: 780.0, right: 300.0 },
            quad_points: vec![],
            ink_paths: vec![],
            color: "#333333".into(),
            opacity: 1.0,
            text: Some("hello freetext".into()),
            created_at: None,
            modified_at: None,
        };
        backend.create_annotation(path, ann).expect("create freetext");
        let after = backend.get_annotations(path, 0).expect("get");
        assert_eq!(after.len(), 1);
        assert_eq!(after[0].annotation_type, AnnotationType::FreeText);

        // explicit save round-trip
        backend.save(path).expect("save");
        let after_save = backend.get_annotations(path, 0).expect("get after save");
        assert_eq!(after_save.len(), 1, "annotation must survive save");

        let _ = fs::remove_file(&dst);
    }
}

#[cfg(test)]
mod cross_verify {
    use super::*;
    use std::fs;

    /// Creates a highlight + note on a known temp path and LEAVES the file
    /// there so a third-party reader (pypdf) can verify the annotations are
    /// standard and visible. Run with: cargo test cross_verify -- --nocapture
    #[test]
    fn create_for_cross_verification() {
        let _g = pdfium_lock();
        let src = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("tests")
            .join("fixtures")
            .join("text-3.pdf");
        let dst = std::env::temp_dir().join("reader-cross-verify.pdf");
        fs::copy(&src, &dst).expect("copy");
        let path = dst.to_str().unwrap();
        let backend = PdfiumBackend::new();

        backend.create_annotation(path, PdfAnnotation {
            id: "x".into(),
            page_index: 0,
            annotation_type: AnnotationType::Highlight,
            rect: Rect { bottom: 720.0, left: 70.0, top: 780.0, right: 300.0 },
            quad_points: vec![Quad {
                x1: 70.0, y1: 720.0, x2: 300.0, y2: 720.0,
                x3: 70.0, y3: 780.0, x4: 300.0, y4: 780.0,
            }],
            ink_paths: vec![],
            color: "#ffff00".into(),
            opacity: 0.5,
            text: Some("cross verify highlight".into()),
            created_at: None,
            modified_at: None,
        }).expect("create highlight");

        backend.create_annotation(path, PdfAnnotation {
            id: "y".into(),
            page_index: 0,
            annotation_type: AnnotationType::FreeText,
            rect: Rect { bottom: 700.0, left: 70.0, top: 780.0, right: 300.0 },
            quad_points: vec![],
            ink_paths: vec![],
            color: "#ff0000".into(),
            opacity: 1.0,
            text: Some("cross verify freetext".into()),
            created_at: None,
            modified_at: None,
        }).expect("create freetext");

        eprintln!("CROSS_VERIFY_PATH={}", path);
        // intentionally do NOT delete — pypdf reads it next.
    }
}

#[cfg(test)]
mod page_tests {
    use super::*;
    use crate::pdf::PageSize;
    use std::fs;

    fn fixture(name: &str) -> std::path::PathBuf {
        let src = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("tests")
            .join("fixtures")
            .join(name);
        let dst = std::env::temp_dir().join(format!(
            "reader-page-test-{}-{name}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        fs::copy(&src, &dst).expect("copy fixture");
        dst
    }

    fn page_count(path: &str) -> usize {
        let backend = PdfiumBackend::new();
        let doc = backend.get_annotations(path, 0).ok(); // warm pdfium
        let _ = doc;
        // Use pdfium-render directly to count.
        let bytes = fs::read(path).unwrap();
        pdfium()
            .load_pdf_from_byte_vec(bytes, None)
            .map(|d| d.pages().len() as usize)
            .unwrap_or(0)
    }

    #[test]
    fn insert_blank_page_after_current() {
        let _g = pdfium_lock();
        let dst = fixture("text-3.pdf");
        let path = dst.to_str().unwrap();
        let backend = PdfiumBackend::new();
        assert_eq!(page_count(path), 3);

        // Insert after page 0 (i.e. at index 1).
        let landed = backend
            .insert_blank_page(path, 1, PageSize::Same, Some(0))
            .expect("insert");
        assert_eq!(landed, 1);
        assert_eq!(page_count(path), 4, "page count must be 4 after insert");

        let _ = fs::remove_file(&dst);
    }

    #[test]
    fn insert_a4_and_letter_pages() {
        let _g = pdfium_lock();
        let dst = fixture("blank-10.pdf");
        let path = dst.to_str().unwrap();
        let backend = PdfiumBackend::new();
        assert_eq!(page_count(path), 10);

        backend
            .insert_blank_page(path, 0, PageSize::A4, None)
            .expect("insert a4");
        backend
            .insert_blank_page(path, 0, PageSize::Letter, None)
            .expect("insert letter");
        assert_eq!(page_count(path), 12);

        let _ = fs::remove_file(&dst);
    }

    #[test]
    fn delete_inserted_blank_page() {
        let _g = pdfium_lock();
        // §6 + user requirement: an inserted blank page must be deletable.
        let dst = fixture("text-3.pdf");
        let path = dst.to_str().unwrap();
        let backend = PdfiumBackend::new();
        assert_eq!(page_count(path), 3);

        // Insert at end (index == len).
        let landed = backend
            .insert_blank_page(path, 3, PageSize::A4, None)
            .expect("insert at end");
        assert_eq!(landed, 3);
        assert_eq!(page_count(path), 4);

        // Delete the page we just inserted.
        backend.delete_page(path, 3).expect("delete inserted page");
        assert_eq!(page_count(path), 3, "page count back to 3 after delete");

        let _ = fs::remove_file(&dst);
    }

    #[test]
    fn delete_original_page() {
        let _g = pdfium_lock();
        let dst = fixture("blank-10.pdf");
        let path = dst.to_str().unwrap();
        let backend = PdfiumBackend::new();
        assert_eq!(page_count(path), 10);

        backend.delete_page(path, 0).expect("delete page 0");
        assert_eq!(page_count(path), 9);

        let _ = fs::remove_file(&dst);
    }

    #[test]
    fn delete_out_of_range_fails() {
        let _g = pdfium_lock();
        let dst = fixture("text-3.pdf");
        let path = dst.to_str().unwrap();
        let backend = PdfiumBackend::new();
        let res = backend.delete_page(path, 99);
        assert!(res.is_err(), "deleting a non-existent page must error");

        let _ = fs::remove_file(&dst);
    }

    #[test]
    fn insert_then_save_round_trip() {
        let _g = pdfium_lock();
        let dst = fixture("text-3.pdf");
        let path = dst.to_str().unwrap();
        let backend = PdfiumBackend::new();
        backend
            .insert_blank_page(path, 1, PageSize::A4, None)
            .expect("insert");
        // explicit save
        backend.save(path).expect("save");
        assert_eq!(page_count(path), 4, "inserted page survives save");

        let _ = fs::remove_file(&dst);
    }
}

#[cfg(test)]
mod page_cross_verify {
    use super::*;
    use crate::pdf::PageSize;
    use std::fs;

    #[test]
    fn create_for_page_cross_verification() {
        let _g = pdfium_lock();
        let src = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("tests")
            .join("fixtures")
            .join("text-3.pdf");
        let dst = std::env::temp_dir().join("reader-page-cross-verify.pdf");
        fs::copy(&src, &dst).expect("copy");
        let path = dst.to_str().unwrap();
        let backend = PdfiumBackend::new();

        // Insert one A4 page after page 0 (index 1).
        backend
            .insert_blank_page(path, 1, PageSize::A4, None)
            .expect("insert");
        // Insert one "same as page 0" page at the end.
        backend
            .insert_blank_page(path, page_count_internal(path), PageSize::Same, Some(0))
            .expect("insert at end");

        eprintln!("PAGE_CROSS_VERIFY_PATH={}", path);
    }

    fn page_count_internal(path: &str) -> usize {
        let bytes = fs::read(path).unwrap();
        pdfium()
            .load_pdf_from_byte_vec(bytes, None)
            .map(|d| d.pages().len() as usize)
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod render_tests {
    use super::*;

    #[test]
    fn render_ani_page1_and_text() {
        let src = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..").join("tests").join("fixtures").join("ani1320588.pdf");
        if !src.exists() { return; }
        let path = src.to_str().unwrap();
        let infos = get_page_infos(path).unwrap();
        assert_eq!(infos.len(), 127);
        let png = render_page_png(path, 0, 1.5).unwrap();
        assert!(png.len() > 10000, "png too small: {}", png.len());
        let segs = get_page_text(path, 0).unwrap();
        assert!(!segs.is_empty());
        // page 4 (the one that crashed pdf.js)
        let p4 = render_page_png(path, 3, 1.5).unwrap();
        assert!(p4.len() > 10000, "page 4 png too small");
    }
}

#[cfg(test)]
mod conc_render_test {
    use super::*;

    /// Simulate the frontend: spawn 5 threads each calling render_page_png on
    /// different pages. With the global lock they should serialize fine.
    #[test]
    fn concurrent_renders_dont_crash() {
        let src = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..").join("tests").join("fixtures").join("ani1320588.pdf");
        if !src.exists() { return; }
        let path = src.to_str().unwrap().to_string();
        let handles: Vec<_> = (0..5).map(|i| {
            let p = path.clone();
            std::thread::spawn(move || {
                let png = render_page_png(&p, i, 1.0).unwrap();
                assert!(png.len() > 1000);
            })
        }).collect();
        for h in handles { h.join().unwrap(); }
        eprintln!("all 5 concurrent renders ok");
    }
}

/// URI-scheme page renderer: `reader-page://localhost/<encoded-path>?page=<n>&scale=<f>`
/// The browser fetches this like an <img src> URL — fully async, no IPC blocking.
/// The handler acquires the PDFium lock, renders the page, and returns PNG bytes.
pub fn handle_page_render<R: tauri::Runtime>(
    _ctx: tauri::UriSchemeContext<'_, R>,
    request: http::Request<Vec<u8>>,
    responder: tauri::UriSchemeResponder,
) {
    let uri = request.uri().to_string();
    // Parse: reader-page://localhost/<path>?page=N&scale=F
    // or:   http://reader-page.localhost/<path>?page=N&scale=F
    let path_part = uri
        .strip_prefix("reader-page://localhost/")
        .or_else(|| uri.strip_prefix("http://reader-page.localhost/"))
        .or_else(|| uri.strip_prefix("https://reader-page.localhost/"))
        .unwrap_or("");
    let (encoded_path, query) = path_part.split_once('?').unwrap_or((path_part, ""));
    let path = percent_decode(encoded_path);
    let mut page: usize = 0;
    let mut scale: f32 = 1.0;
    for kv in query.split('&') {
        if let Some(v) = kv.strip_prefix("page=") { page = v.parse().unwrap_or(0); }
        else if let Some(v) = kv.strip_prefix("scale=") { scale = v.parse().unwrap_or(1.0); }
    }
    match render_page_png(&path, page, scale) {
        Ok(png) => {
            let resp = http::Response::builder()
                .status(200)
                .header("Content-Type", "image/png")
                .header("Cache-Control", "max-age=3600")
                .header("Access-Control-Allow-Origin", "*")
                .body(png)
                .unwrap();
            responder.respond(resp);
        }
        Err(e) => {
            log::warn!("page render {uri}: {e}");
            let resp = http::Response::builder()
                .status(500)
                .body(e.into_bytes())
                .unwrap();
            responder.respond(resp);
        }
    }
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(h) = u8::from_str_radix(std::str::from_utf8(&b[i+1..i+3]).unwrap_or(""), 16) {
                out.push(h); i += 3; continue;
            }
        }
        out.push(b[i]); i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Build the page-img URL for the frontend.
pub fn page_img_url(path: &str, page: usize, scale: f32) -> String {
    let enc = urlencoding::encode(path);
    format!("http://reader-page.localhost/{enc}?page={page}&scale={scale}")
}
