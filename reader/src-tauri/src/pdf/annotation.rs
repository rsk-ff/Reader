//! Annotation model (spec §5). Shared by all backends and the frontend.

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum AnnotationType {
    Highlight,
    Underline,
    Strikeout,
    Note,
    FreeText,
    Ink,
}

/// A point in PDF user space (points, origin bottom-left).
#[derive(Clone, Copy, Serialize, Deserialize, Debug)]
pub struct Point {
    pub x: f32,
    pub y: f32,
}

/// A quadrilateral (4 corners) used by highlight/underline/strikeout to mark
/// a text region. Order: bottom-left, bottom-right, top-left, top-right.
#[derive(Clone, Copy, Serialize, Deserialize, Debug)]
pub struct Quad {
    pub x1: f32,
    pub y1: f32,
    pub x2: f32,
    pub y2: f32,
    pub x3: f32,
    pub y3: f32,
    pub x4: f32,
    pub y4: f32,
}

/// Bounding rectangle in PDF user space.
#[derive(Clone, Copy, Serialize, Deserialize, Debug)]
pub struct Rect {
    pub bottom: f32,
    pub left: f32,
    pub top: f32,
    pub right: f32,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct PdfAnnotation {
    /// Stable id: `page:<idx>:<pdfium-annot-handle-or-uuid>`.
    pub id: String,
    pub page_index: usize,
    pub annotation_type: AnnotationType,
    pub rect: Rect,
    /// quad points for highlight/underline/strikeout.
    #[serde(default)]
    pub quad_points: Vec<Quad>,
    /// ink paths for Ink (each path is a list of points).
    #[serde(default)]
    pub ink_paths: Vec<Vec<Point>>,
    /// hex `#rrggbb`
    pub color: String,
    #[serde(default = "default_opacity")]
    pub opacity: f32,
    /// contents text (note / free text body).
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub modified_at: Option<String>,
}

fn default_opacity() -> f32 {
    1.0
}

impl PdfAnnotation {
    pub fn new(page_index: usize, ty: AnnotationType) -> Self {
        Self {
            id: format!("page:{page_index}:new:{}", uuid_seed()),
            page_index,
            annotation_type: ty,
            rect: Rect {
                bottom: 0.0,
                left: 0.0,
                top: 0.0,
                right: 0.0,
            },
            quad_points: vec![],
            ink_paths: vec![],
            color: "#ffd54f".into(),
            opacity: 0.5,
            text: None,
            created_at: None,
            modified_at: None,
        }
    }
}

/// Cheap per-process id seed without pulling in uuid.
fn uuid_seed() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(1);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{}-{}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0), n)
}
