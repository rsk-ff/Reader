//! Workspace state model (spec §10, §16, §18).
//!
//! Three independent concepts:
//!   - DocumentSession : a file + its parser/annotation/dirty state (global)
//!   - WindowState     : a native window holding an ordered list of tab ids
//!   - WindowTab       : a tab slot, optionally referencing a DocumentSession
//!
//! Phase 6 makes this truly multi-window: tabs can be reordered, detached into
//! new windows, and moved between windows — all without recreating the
//! underlying DocumentSession (so dirty state survives, Test 10).

use std::collections::{HashMap, HashSet};
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

pub type WindowId = String;
pub type DocumentId = String;
pub type TabId = String;

/// The primary window label. Always exists and receives a new tab whenever its
/// last tab is explicitly closed. Detached tabs go into dynamically-created windows.
pub const MAIN_WINDOW: &str = "main";
pub const NEW_TAB_TITLE: &str = "新标签页";
pub const UNTITLED_MARKDOWN_TITLE: &str = "未命名.md";

#[derive(Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum DocumentType {
    Pdf,
    Markdown,
    Unknown,
}

impl DocumentType {
    pub fn from_path(path: &Path) -> Self {
        match path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .as_deref()
        {
            Some("pdf") => DocumentType::Pdf,
            Some("md") | Some("markdown") => DocumentType::Markdown,
            _ => DocumentType::Unknown,
        }
    }
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct DocumentSession {
    pub id: DocumentId,
    pub path: PathBuf,
    pub file_name: String,
    pub doc_type: DocumentType,
    pub dirty: bool,
    pub revision: u64,
    pub last_saved_revision: u64,
    pub file_size: Option<u64>,
    /// An untitled Markdown document exists only in memory until its first save.
    #[serde(default)]
    pub untitled: bool,
    /// PDFium mutations are written here until the user explicitly saves.
    /// This is process-local state and must never leak into session snapshots.
    #[serde(skip)]
    pub pdf_working_copy: Option<PathBuf>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct WindowTab {
    pub id: TabId,
    pub window_id: WindowId,
    /// `None` represents a real new-tab slot that is not backed by a file.
    pub document_id: Option<DocumentId>,
    pub title: String,
    pub position: usize,
    pub active: bool,
}

/// Per-window snapshot returned to that window's frontend.
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct WindowSnapshot {
    pub window_id: WindowId,
    pub tabs: Vec<WindowTab>,
    /// All documents (global — a tab may reference any of them).
    pub documents: Vec<DocumentSession>,
    pub active_tab_id: Option<TabId>,
}

/// A native window's tab-strip state.
#[derive(Clone, Debug)]
pub struct WindowState {
    pub id: WindowId,
    /// Ordered tab ids — position is implicit from this Vec.
    pub tab_ids: Vec<TabId>,
    pub active_tab: Option<TabId>,
    /// Saved geometry for session restore (§26).
    pub bounds: Option<WindowBounds>,
}

#[derive(Clone, Copy, Serialize, Deserialize, Debug)]
pub struct WindowBounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub maximized: bool,
}

#[derive(Default)]
pub struct AppWorkspace {
    pub documents: HashMap<DocumentId, DocumentSession>,
    pub tabs: HashMap<TabId, WindowTab>,
    pub windows: HashMap<WindowId, WindowState>,
    next_id: u64,
}

impl AppWorkspace {
    fn fresh_id(&mut self, prefix: &str) -> String {
        self.next_id += 1;
        format!("{prefix}-{}", self.next_id)
    }

    pub fn ensure_main(&mut self) {
        self.windows
            .entry(MAIN_WINDOW.to_string())
            .or_insert_with(|| WindowState {
                id: MAIN_WINDOW.to_string(),
                tab_ids: vec![],
                active_tab: None,
                bounds: None,
            });
    }

    /// Create and focus a file-less tab in the requested native window.
    pub fn create_new_tab(&mut self, target_window: &WindowId) -> TabId {
        self.ensure_main();
        let tab_id = self.fresh_id("tab");
        let position = self
            .windows
            .get(target_window)
            .map(|window| window.tab_ids.len())
            .unwrap_or(0);
        self.tabs.insert(
            tab_id.clone(),
            WindowTab {
                id: tab_id.clone(),
                window_id: target_window.clone(),
                document_id: None,
                title: NEW_TAB_TITLE.to_string(),
                position,
                active: true,
            },
        );
        let window = self
            .windows
            .entry(target_window.clone())
            .or_insert_with(|| WindowState {
                id: target_window.clone(),
                tab_ids: vec![],
                active_tab: None,
                bounds: None,
            });
        window.tab_ids.push(tab_id.clone());
        window.active_tab = Some(tab_id.clone());
        tab_id
    }

    /// Create an in-memory Markdown document and place it in the active new-tab
    /// slot. No file-system path is chosen until the first explicit save.
    pub fn create_markdown_document(&mut self, target_window: &WindowId) -> Result<TabId, String> {
        self.ensure_main();
        let document_id = self.fresh_id("doc");
        self.documents.insert(
            document_id.clone(),
            DocumentSession {
                id: document_id.clone(),
                path: PathBuf::new(),
                file_name: UNTITLED_MARKDOWN_TITLE.to_string(),
                doc_type: DocumentType::Markdown,
                dirty: true,
                revision: 1,
                last_saved_revision: 0,
                file_size: None,
                untitled: true,
                pdf_working_copy: None,
            },
        );
        self.attach_document(
            document_id,
            UNTITLED_MARKDOWN_TITLE.to_string(),
            target_window,
        )
    }

    fn canonicalize(path: &str) -> Result<PathBuf, String> {
        let p = PathBuf::from(path);
        p.canonicalize()
            .map_err(|e| format!("cannot canonicalize '{path}': {e}"))
    }

    /// The single open_document entry point (§16). `target_window` selects
    /// which window receives the new tab (or focuses the existing one).
    pub fn open_document(&mut self, path: &str, target_window: &WindowId) -> Result<TabId, String> {
        self.ensure_main();
        let canon = Self::canonicalize(path)?;

        // Already open anywhere? Focus that tab's window + tab (§16 dedupe).
        if let Some(tab) = self
            .tabs
            .values()
            .find(|t| {
                t.document_id
                    .as_ref()
                    .and_then(|document_id| self.documents.get(document_id))
                    .is_some_and(|d| d.path == canon)
            })
            .cloned()
        {
            self.focus_tab(&tab.id)?;
            return Ok(tab.id);
        }

        let file_name = canon
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Untitled")
            .to_string();
        let doc_type = DocumentType::from_path(&canon);
        let file_size = std::fs::metadata(&canon).map(|m| m.len()).ok();
        let doc_id = canon
            .to_str()
            .map(|s| s.to_string())
            .unwrap_or_else(|| self.fresh_id("doc"));
        let session = DocumentSession {
            id: doc_id.clone(),
            path: canon,
            file_name: file_name.clone(),
            doc_type,
            dirty: false,
            revision: 1,
            last_saved_revision: 1,
            file_size,
            untitled: false,
            pdf_working_copy: None,
        };
        self.documents.insert(doc_id.clone(), session);

        self.attach_document(doc_id, file_name, target_window)
    }

    /// Attach a document to the requested window. An active new tab is reused
    /// so file actions do not leave an unrelated blank tab behind.
    fn attach_document(
        &mut self,
        document_id: DocumentId,
        title: String,
        target_window: &WindowId,
    ) -> Result<TabId, String> {
        // A file opened while a new tab is active occupies that slot instead
        // of leaving an unrelated empty tab behind.
        let reusable_tab_id = self
            .windows
            .get(target_window)
            .and_then(|window| window.active_tab.as_ref())
            .filter(|tab_id| {
                self.tabs
                    .get(*tab_id)
                    .is_some_and(|tab| tab.document_id.is_none())
            })
            .cloned();
        if let Some(tab_id) = reusable_tab_id {
            if let Some(tab) = self.tabs.get_mut(&tab_id) {
                tab.document_id = Some(document_id);
                tab.title = title;
            }
            self.focus_tab(&tab_id)?;
            return Ok(tab_id);
        }

        let tab_id = self.fresh_id("tab");
        let tab = WindowTab {
            id: tab_id.clone(),
            window_id: target_window.clone(),
            document_id: Some(document_id),
            title,
            position: 0,
            active: true,
        };
        self.tabs.insert(tab_id.clone(), tab);
        let win = self
            .windows
            .entry(target_window.clone())
            .or_insert_with(|| WindowState {
                id: target_window.clone(),
                tab_ids: vec![],
                active_tab: None,
                bounds: None,
            });
        win.tab_ids.push(tab_id.clone());
        self.focus_tab(&tab_id)?;
        Ok(tab_id)
    }

    pub fn validate_markdown_save_target(
        &self,
        document_id: &DocumentId,
        path: &Path,
    ) -> Result<(), String> {
        let document = self
            .documents
            .get(document_id)
            .ok_or_else(|| format!("document not found: {document_id}"))?;
        if document.doc_type != DocumentType::Markdown || !document.untitled {
            return Err(format!("document is not untitled Markdown: {document_id}"));
        }
        if self.documents.iter().any(|(candidate_id, candidate)| {
            candidate_id != document_id && !candidate.untitled && candidate.path == path
        }) {
            return Err(format!("file is already open: {}", path.display()));
        }
        Ok(())
    }

    /// Replace an untitled Markdown document's in-memory identity with its
    /// first saved path without recreating the tab or document id.
    pub fn finalize_markdown_save(
        &mut self,
        document_id: &DocumentId,
        path: PathBuf,
    ) -> Result<(), String> {
        self.validate_markdown_save_target(document_id, &path)?;

        let file_name = path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| format!("saved path has no valid file name: {}", path.display()))?
            .to_string();
        let file_size = std::fs::metadata(&path).map(|metadata| metadata.len()).ok();
        let document = self
            .documents
            .get_mut(document_id)
            .ok_or_else(|| format!("document not found: {document_id}"))?;
        document.path = path;
        document.file_name = file_name.clone();
        document.file_size = file_size;
        document.untitled = false;
        document.dirty = false;
        document.last_saved_revision = document.revision;
        for tab in self.tabs.values_mut() {
            if tab.document_id.as_ref() == Some(document_id) {
                tab.title = file_name.clone();
            }
        }
        Ok(())
    }

    /// Focus a tab. Finds its window, sets it active there.
    pub fn focus_tab(&mut self, tab_id: &TabId) -> Result<(), String> {
        let tab = self
            .tabs
            .get(tab_id)
            .cloned()
            .ok_or_else(|| format!("tab not found: {tab_id}"))?;
        let win = self
            .windows
            .get_mut(&tab.window_id)
            .ok_or_else(|| format!("window not found: {}", tab.window_id))?;
        win.active_tab = Some(tab_id.clone());
        Ok(())
    }

    /// Close a tab. Drops the session if no remaining tab references it.
    /// Returns the window_id that owned the tab (so the caller can close an
    /// empty non-main native window).
    pub fn close_tab(&mut self, tab_id: &TabId) -> Result<WindowId, String> {
        let tab = self
            .tabs
            .remove(tab_id)
            .ok_or_else(|| format!("tab not found: {tab_id}"))?;
        let window_empty = {
            let win = self
                .windows
                .get_mut(&tab.window_id)
                .ok_or_else(|| format!("window not found: {}", tab.window_id))?;
            win.tab_ids.retain(|id| id != tab_id);
            if win.active_tab.as_deref() == Some(tab_id) {
                win.active_tab = win.tab_ids.first().cloned();
            }
            win.tab_ids.is_empty()
        };
        // Drop a document session if no remaining file tab references it.
        if let Some(document_id) = &tab.document_id {
            let still_referenced = self
                .tabs
                .values()
                .any(|candidate| candidate.document_id.as_ref() == Some(document_id));
            if !still_referenced {
                if let Some(document) = self.documents.remove(document_id) {
                    remove_pdf_working_copy(&document);
                }
            }
        }
        if tab.window_id == MAIN_WINDOW && window_empty {
            self.create_new_tab(&tab.window_id);
        }
        Ok(tab.window_id)
    }

    /// Reorder tabs within a window to the given order.
    pub fn reorder_tabs(&mut self, window_id: &WindowId, tab_ids: &[TabId]) -> Result<(), String> {
        let win = self
            .windows
            .get_mut(window_id)
            .ok_or_else(|| format!("window not found: {window_id}"))?;
        if win.tab_ids.len() != tab_ids.len() {
            return Err("reorder length mismatch".into());
        }
        win.tab_ids = tab_ids.to_vec();
        Ok(())
    }

    /// Move a tab to a target window at a position. The DocumentSession is
    /// untouched — only the tab's window_id changes (Test 10).
    pub fn move_tab(
        &mut self,
        tab_id: &TabId,
        target_window: &WindowId,
        position: usize,
    ) -> Result<(), String> {
        let tab = self
            .tabs
            .get(tab_id)
            .cloned()
            .ok_or_else(|| format!("tab not found: {tab_id}"))?;
        let old_window = tab.window_id.clone();

        // remove from old window
        if let Some(win) = self.windows.get_mut(&old_window) {
            win.tab_ids.retain(|id| id != tab_id);
            if win.active_tab.as_deref() == Some(tab_id) {
                win.active_tab = win.tab_ids.first().cloned();
            }
        }

        // insert into target window
        self.ensure_main();
        let win = self
            .windows
            .entry(target_window.clone())
            .or_insert_with(|| WindowState {
                id: target_window.clone(),
                tab_ids: vec![],
                active_tab: None,
                bounds: None,
            });
        let pos = position.min(win.tab_ids.len());
        win.tab_ids.insert(pos, tab_id.clone());
        win.active_tab = Some(tab_id.clone());

        // update the tab's window_id
        if let Some(t) = self.tabs.get_mut(tab_id) {
            t.window_id = target_window.clone();
        }
        Ok(())
    }

    /// Detach a tab: remove from its current window, stage it as a new window.
    /// Returns the new window id; the caller creates the native window with
    /// that label.
    pub fn detach_tab(&mut self, tab_id: &TabId) -> Result<WindowId, String> {
        let new_window = self.fresh_id("win");
        // Move to the new window at position 0; session untouched.
        self.move_tab(tab_id, &new_window, 0)?;
        Ok(new_window)
    }

    /// Called when a native window is destroyed. Removes the window; its tabs
    /// (if any leaked) are dropped. The main window is never removed.
    pub fn remove_window(&mut self, window_id: &WindowId) {
        if window_id == MAIN_WINDOW {
            return;
        }
        if let Some(win) = self.windows.remove(window_id) {
            for tab_id in &win.tab_ids {
                if let Some(tab) = self.tabs.remove(tab_id) {
                    if let Some(document_id) = &tab.document_id {
                        let still_referenced = self
                            .tabs
                            .values()
                            .any(|candidate| candidate.document_id.as_ref() == Some(document_id));
                        if !still_referenced {
                            if let Some(document) = self.documents.remove(document_id) {
                                remove_pdf_working_copy(&document);
                            }
                        }
                    }
                }
            }
        }
    }

    /// List all window ids (for broadcasting changes).
    pub fn window_ids(&self) -> Vec<WindowId> {
        self.windows.keys().cloned().collect()
    }

    pub fn set_dirty(&mut self, document_id: &DocumentId, dirty: bool) {
        if let Some(d) = self.documents.get_mut(document_id) {
            d.dirty = dirty;
            if !dirty {
                d.last_saved_revision = d.revision;
            } else {
                d.revision += 1;
            }
        }
    }

    /// Return the currently readable PDF source for a canonical, open path.
    /// Unsaved PDFium writes live in a private working copy; PDF.js reads that
    /// copy while the original remains untouched until an explicit save.
    pub fn pdf_source_path(&self, canonical_path: &Path) -> Option<PathBuf> {
        let document = self.documents.values().find(|document| {
            document.path == canonical_path && document.doc_type == DocumentType::Pdf
        })?;
        Some(
            document
                .pdf_working_copy
                .as_ref()
                .filter(|path| path.is_file())
                .unwrap_or(&document.path)
                .clone(),
        )
    }

    /// Materialize a private working copy for a PDF mutation. Repeated writes
    /// for the same open document reuse the same copy.
    pub fn ensure_pdf_working_copy(&mut self, path: &str) -> Result<PathBuf, String> {
        let canonical = Self::canonicalize(path)?;
        let document_id = self
            .documents
            .values()
            .find(|document| document.path == canonical)
            .map(|document| document.id.clone())
            .ok_or_else(|| format!("PDF is not open in this workspace: {path}"))?;

        let document = self
            .documents
            .get(&document_id)
            .ok_or_else(|| format!("document not found: {document_id}"))?;
        if document.doc_type != DocumentType::Pdf {
            return Err(format!("document is not a PDF: {path}"));
        }
        if let Some(working_copy) = document
            .pdf_working_copy
            .as_ref()
            .filter(|working_copy| working_copy.is_file())
        {
            return Ok(working_copy.clone());
        }

        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        canonical.hash(&mut hasher);
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        let directory = std::env::temp_dir().join("reader-pdf-working");
        std::fs::create_dir_all(&directory)
            .map_err(|error| format!("create PDF working directory: {error}"))?;
        let working_copy = directory.join(format!(
            "reader-{}-{:016x}-{nonce}.pdf",
            std::process::id(),
            hasher.finish(),
        ));
        let temporary_copy = working_copy.with_extension("pdf.tmp");
        std::fs::copy(&canonical, &temporary_copy)
            .map_err(|error| format!("create PDF working copy: {error}"))?;
        std::fs::rename(&temporary_copy, &working_copy)
            .map_err(|error| format!("activate PDF working copy: {error}"))?;

        self.documents
            .get_mut(&document_id)
            .expect("document exists while creating its PDF working copy")
            .pdf_working_copy = Some(working_copy.clone());
        Ok(working_copy)
    }

    /// Snapshot for a specific window — only that window's tabs, but all
    /// documents (so the tab strip can show titles even if a doc lives in
    /// another window too).
    pub fn snapshot_for(&self, window_id: &WindowId) -> WindowSnapshot {
        let win = self.windows.get(window_id);
        let tabs: Vec<WindowTab> = win
            .map(|w| {
                w.tab_ids
                    .iter()
                    .enumerate()
                    .filter_map(|(i, id)| {
                        let t = self.tabs.get(id)?;
                        Some(WindowTab {
                            id: t.id.clone(),
                            window_id: t.window_id.clone(),
                            document_id: t.document_id.clone(),
                            title: t.title.clone(),
                            position: i,
                            active: w.active_tab.as_deref() == Some(&t.id),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();
        WindowSnapshot {
            window_id: window_id.clone(),
            tabs,
            documents: self.documents.values().cloned().collect(),
            active_tab_id: win.and_then(|w| w.active_tab.clone()),
        }
    }

    // ---- session persistence (§26) ----

    pub fn serialize(&self) -> String {
        let windows: Vec<_> = self
            .windows
            .values()
            .map(|w| PersistedWindow {
                id: w.id.clone(),
                tab_ids: w.tab_ids.clone(),
                active_tab: w.active_tab.clone(),
                bounds: w.bounds,
            })
            .collect();
        let tabs: Vec<_> = self.tabs.values().cloned().collect();
        let docs: Vec<_> = self.documents.values().cloned().collect();
        serde_json::to_string(&PersistedSession {
            windows,
            documents: docs,
            tabs,
        })
        .unwrap_or_default()
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn restore(serialized: &str) -> Option<AppWorkspace> {
        let s: PersistedSession = serde_json::from_str(serialized).ok()?;
        let mut ws = AppWorkspace::default();
        for w in s.windows {
            ws.windows.insert(
                w.id.clone(),
                WindowState {
                    id: w.id,
                    tab_ids: w.tab_ids,
                    active_tab: w.active_tab,
                    bounds: w.bounds,
                },
            );
        }
        for t in s.tabs {
            let id = t.id.clone();
            ws.tabs.insert(id, t);
        }
        for mut d in s.documents {
            // Working copies are intentionally process-local. A legacy/crash
            // session can therefore not truthfully restore a dirty PDF.
            if d.doc_type == DocumentType::Pdf && d.dirty {
                d.dirty = false;
                d.last_saved_revision = d.revision;
            }
            ws.documents.insert(d.id.clone(), d);
        }

        // A document is globally unique in the workspace. Older session files
        // may contain duplicate tabs from the pre-fix ID-counter collision;
        // collapse them while preserving the first tab in window order.
        let mut seen_documents = HashSet::new();
        let mut retained_tabs = HashSet::new();
        for window in ws.windows.values_mut() {
            window.tab_ids.retain(|tab_id| {
                let Some(tab) = ws.tabs.get(tab_id) else {
                    return false;
                };
                if let Some(document_id) = &tab.document_id {
                    if !ws.documents.contains_key(document_id)
                        || !seen_documents.insert(document_id.clone())
                    {
                        return false;
                    }
                }
                retained_tabs.insert(tab_id.clone());
                true
            });
            if window
                .active_tab
                .as_ref()
                .is_none_or(|tab_id| !window.tab_ids.contains(tab_id))
            {
                window.active_tab = window.tab_ids.last().cloned();
            }
        }
        ws.tabs.retain(|id, _| retained_tabs.contains(id));
        let retained_documents: HashSet<_> = ws
            .tabs
            .values()
            .filter_map(|tab| tab.document_id.clone())
            .collect();
        ws.documents.retain(|id, _| retained_documents.contains(id));

        // fresh_id() uses a process-local counter. Resume it beyond every
        // persisted numeric suffix so opening a file after restore cannot
        // overwrite a restored document, tab, or window.
        ws.next_id = ws
            .documents
            .keys()
            .chain(ws.tabs.keys())
            .chain(ws.windows.keys())
            .filter_map(|id| id.rsplit('-').next()?.parse::<u64>().ok())
            .max()
            .unwrap_or(0);
        ws.ensure_main();
        Some(ws)
    }
}

fn remove_pdf_working_copy(document: &DocumentSession) {
    if let Some(path) = &document.pdf_working_copy {
        if let Err(error) = std::fs::remove_file(path) {
            if error.kind() != std::io::ErrorKind::NotFound {
                log::warn!("remove PDF working copy '{}': {error}", path.display());
            }
        }
    }
}

pub type SharedWorkspace = Mutex<AppWorkspace>;

pub fn new_shared() -> SharedWorkspace {
    Mutex::new(AppWorkspace::default())
}

// ---- session persistence types (§26) ----

#[derive(Serialize, Deserialize)]
struct PersistedSession {
    windows: Vec<PersistedWindow>,
    documents: Vec<DocumentSession>,
    tabs: Vec<WindowTab>,
}

#[derive(Serialize, Deserialize)]
struct PersistedWindow {
    id: WindowId,
    tab_ids: Vec<TabId>,
    active_tab: Option<TabId>,
    bounds: Option<WindowBounds>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_file(name: &str, body: &str) -> PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!(
            "reader-test-{}-{name}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        std::fs::write(&p, body).unwrap();
        p
    }

    #[test]
    fn open_document_creates_one_tab_per_unique_file() {
        let mut ws = AppWorkspace::default();
        ws.ensure_main();
        let a = tmp_file("a.pdf", "%PDF-1.4");
        let b = tmp_file("b.md", "# hi");
        let c = tmp_file("c.markdown", "# md");
        let d = tmp_file("d.txt", "plain");

        let t1 = ws
            .open_document(a.to_str().unwrap(), &MAIN_WINDOW.into())
            .unwrap();
        let t2 = ws
            .open_document(b.to_str().unwrap(), &MAIN_WINDOW.into())
            .unwrap();
        let t3 = ws
            .open_document(c.to_str().unwrap(), &MAIN_WINDOW.into())
            .unwrap();
        let t4 = ws
            .open_document(d.to_str().unwrap(), &MAIN_WINDOW.into())
            .unwrap();
        assert_ne!(t1, t2);
        assert_ne!(t2, t3);
        assert_ne!(t3, t4);

        let snap = ws.snapshot_for(&MAIN_WINDOW.into());
        assert_eq!(snap.tabs.len(), 4);
        assert_eq!(snap.documents.len(), 4);
        // doc_type detection
        assert_eq!(
            snap.documents
                .iter()
                .find(|d| d.file_name.ends_with("a.pdf"))
                .unwrap()
                .doc_type,
            DocumentType::Pdf
        );
        assert_eq!(
            snap.documents
                .iter()
                .find(|d| d.file_name.ends_with("b.md"))
                .unwrap()
                .doc_type,
            DocumentType::Markdown
        );
    }

    #[test]
    fn open_document_dedupes_same_file() {
        let mut ws = AppWorkspace::default();
        ws.ensure_main();
        let path = tmp_file("dedup.pdf", "%PDF");
        let t1 = ws
            .open_document(path.to_str().unwrap(), &MAIN_WINDOW.into())
            .unwrap();
        let t2 = ws
            .open_document(path.to_str().unwrap(), &MAIN_WINDOW.into())
            .unwrap();
        assert_eq!(t1, t2, "same path must return the existing tab id");
        let snap = ws.snapshot_for(&MAIN_WINDOW.into());
        assert_eq!(snap.tabs.len(), 1);
        assert_eq!(snap.documents.len(), 1);
    }

    #[test]
    fn new_open_becomes_active_and_dedup_focuses() {
        let mut ws = AppWorkspace::default();
        ws.ensure_main();
        let a = tmp_file("x.pdf", "%PDF");
        let b = tmp_file("y.md", "# y");
        let ta = ws
            .open_document(a.to_str().unwrap(), &MAIN_WINDOW.into())
            .unwrap();
        let tb = ws
            .open_document(b.to_str().unwrap(), &MAIN_WINDOW.into())
            .unwrap();
        let snap = ws.snapshot_for(&MAIN_WINDOW.into());
        assert_eq!(snap.active_tab_id, Some(tb));
        // re-open a → a becomes active again, no new tab
        let ta2 = ws
            .open_document(a.to_str().unwrap(), &MAIN_WINDOW.into())
            .unwrap();
        assert_eq!(ta2, ta);
        let snap2 = ws.snapshot_for(&MAIN_WINDOW.into());
        assert_eq!(snap2.tabs.len(), 2);
        assert_eq!(snap2.active_tab_id, Some(ta));
    }

    #[test]
    fn close_tab_repacks_and_picks_neighbour_active() {
        let mut ws = AppWorkspace::default();
        ws.ensure_main();
        let a = tmp_file("a.pdf", "%PDF");
        let b = tmp_file("b.md", "# b");
        let c = tmp_file("c.pdf", "%PDF");
        let ta = ws
            .open_document(a.to_str().unwrap(), &MAIN_WINDOW.into())
            .unwrap();
        let tb = ws
            .open_document(b.to_str().unwrap(), &MAIN_WINDOW.into())
            .unwrap();
        let tc = ws
            .open_document(c.to_str().unwrap(), &MAIN_WINDOW.into())
            .unwrap();
        ws.close_tab(&tb).unwrap();
        let snap = ws.snapshot_for(&MAIN_WINDOW.into());
        assert_eq!(snap.tabs.len(), 2);
        // repacked positions 0,1
        assert_eq!(
            snap.tabs.iter().map(|t| t.position).collect::<Vec<_>>(),
            vec![0, 1]
        );
        // remaining tabs are a and c
        let ids: Vec<_> = snap.tabs.iter().map(|t| t.id.clone()).collect();
        assert!(ids.contains(&ta) && ids.contains(&tc));
    }

    #[test]
    fn close_last_main_tab_creates_a_new_tab() {
        let mut ws = AppWorkspace::default();
        ws.ensure_main();
        let a = tmp_file("only.pdf", "%PDF");
        let ta = ws
            .open_document(a.to_str().unwrap(), &MAIN_WINDOW.into())
            .unwrap();
        ws.close_tab(&ta).unwrap();
        let snap = ws.snapshot_for(&MAIN_WINDOW.into());
        assert_eq!(snap.tabs.len(), 1);
        assert!(snap.documents.is_empty());
        assert_eq!(snap.tabs[0].document_id, None);
        assert_eq!(snap.tabs[0].title, NEW_TAB_TITLE);
        assert_eq!(snap.active_tab_id, Some(snap.tabs[0].id.clone()));
        assert_ne!(snap.tabs[0].id, ta);
    }

    #[test]
    fn opening_a_document_reuses_the_active_new_tab() {
        let mut ws = AppWorkspace::default();
        ws.ensure_main();
        let new_tab = ws.create_new_tab(&MAIN_WINDOW.into());
        let path = tmp_file("new-tab-target.md", "# target");

        let opened = ws
            .open_document(path.to_str().unwrap(), &MAIN_WINDOW.into())
            .unwrap();
        let snap = ws.snapshot_for(&MAIN_WINDOW.into());

        assert_eq!(opened, new_tab);
        assert_eq!(snap.tabs.len(), 1);
        assert!(snap.tabs[0].document_id.is_some());
        assert_eq!(snap.documents.len(), 1);
        assert_eq!(snap.active_tab_id, Some(new_tab));
    }

    #[test]
    fn creating_markdown_reuses_new_tab_without_choosing_a_path() {
        let mut ws = AppWorkspace::default();
        ws.ensure_main();
        let new_tab = ws.create_new_tab(&MAIN_WINDOW.into());

        let markdown_tab = ws
            .create_markdown_document(&MAIN_WINDOW.into())
            .expect("create untitled Markdown");
        let snapshot = ws.snapshot_for(&MAIN_WINDOW.into());
        let document = snapshot.documents.first().expect("Markdown document");

        assert_eq!(markdown_tab, new_tab);
        assert_eq!(snapshot.tabs.len(), 1);
        assert_eq!(snapshot.tabs[0].title, UNTITLED_MARKDOWN_TITLE);
        assert_eq!(document.doc_type, DocumentType::Markdown);
        assert!(document.path.as_os_str().is_empty());
        assert!(document.untitled);
        assert!(document.dirty);
    }

    #[test]
    fn first_markdown_save_keeps_identity_and_updates_tab_title() {
        let mut ws = AppWorkspace::default();
        ws.ensure_main();
        let tab_id = ws
            .create_markdown_document(&MAIN_WINDOW.into())
            .expect("create untitled Markdown");
        let document_id = ws.tabs[&tab_id].document_id.clone().unwrap();
        let saved_path = tmp_file("saved-note.md", "# saved").canonicalize().unwrap();

        ws.finalize_markdown_save(&document_id, saved_path.clone())
            .expect("finalize first save");
        let snapshot = ws.snapshot_for(&MAIN_WINDOW.into());
        let document = snapshot
            .documents
            .iter()
            .find(|document| document.id == document_id)
            .expect("same document identity");

        assert_eq!(snapshot.tabs[0].id, tab_id);
        assert_eq!(snapshot.tabs[0].document_id.as_ref(), Some(&document_id));
        assert_eq!(snapshot.tabs[0].title, document.file_name);
        assert_eq!(document.path, saved_path);
        assert!(!document.untitled);
        assert!(!document.dirty);
    }

    #[test]
    fn multiple_new_tabs_survive_serialization_without_documents() {
        let mut ws = AppWorkspace::default();
        ws.ensure_main();
        let first = ws.create_new_tab(&MAIN_WINDOW.into());
        let second = ws.create_new_tab(&MAIN_WINDOW.into());

        let restored = AppWorkspace::restore(&ws.serialize()).expect("restore");
        let snap = restored.snapshot_for(&MAIN_WINDOW.into());

        assert_eq!(snap.tabs.len(), 2);
        assert!(snap.tabs.iter().all(|tab| tab.document_id.is_none()));
        assert!(snap.documents.is_empty());
        assert_eq!(snap.active_tab_id, Some(second));
        assert_ne!(first, snap.active_tab_id.unwrap());
    }

    #[test]
    fn detach_tab_moves_session_not_recreates() {
        // Test 10: dragging a tab out must not recreate the DocumentSession.
        let mut ws = AppWorkspace::default();
        ws.ensure_main();
        let a = tmp_file("detach.pdf", "%PDF");
        let ta = ws
            .open_document(a.to_str().unwrap(), &MAIN_WINDOW.into())
            .unwrap();
        let doc_id = ws.tabs.get(&ta).unwrap().document_id.clone().unwrap();

        // mark dirty to prove dirty state survives the detach
        ws.set_dirty(&doc_id, true);

        let new_win = ws.detach_tab(&ta).unwrap();
        assert_ne!(new_win, MAIN_WINDOW);

        // session still exists, still dirty
        let doc = ws
            .documents
            .get(&doc_id)
            .expect("session must survive detach");
        assert!(doc.dirty, "dirty state must survive detach");

        // tab now lives in the new window
        let snap_main = ws.snapshot_for(&MAIN_WINDOW.into());
        assert!(
            snap_main.tabs.is_empty(),
            "main should be empty after detach"
        );
        let snap_new = ws.snapshot_for(&new_win);
        assert_eq!(snap_new.tabs.len(), 1);
        assert_eq!(snap_new.tabs[0].id, ta);
    }

    #[test]
    fn move_tab_between_windows_keeps_dirty() {
        let mut ws = AppWorkspace::default();
        ws.ensure_main();
        let a = tmp_file("move.pdf", "%PDF");
        let ta = ws
            .open_document(a.to_str().unwrap(), &MAIN_WINDOW.into())
            .unwrap();
        let doc_id = ws.tabs.get(&ta).unwrap().document_id.clone().unwrap();
        ws.set_dirty(&doc_id, true);

        let other = "win-other".to_string();
        ws.move_tab(&ta, &other, 0).unwrap();

        // dirty preserved
        assert!(ws.documents.get(&doc_id).unwrap().dirty);
        // main empty, other has the tab
        assert!(ws.snapshot_for(&MAIN_WINDOW.into()).tabs.is_empty());
        assert_eq!(ws.snapshot_for(&other).tabs.len(), 1);
    }

    #[test]
    fn reorder_tabs_changes_order() {
        let mut ws = AppWorkspace::default();
        ws.ensure_main();
        let a = tmp_file("a.pdf", "%PDF");
        let b = tmp_file("b.md", "# b");
        let c = tmp_file("c.pdf", "%PDF");
        let ta = ws
            .open_document(a.to_str().unwrap(), &MAIN_WINDOW.into())
            .unwrap();
        let tb = ws
            .open_document(b.to_str().unwrap(), &MAIN_WINDOW.into())
            .unwrap();
        let tc = ws
            .open_document(c.to_str().unwrap(), &MAIN_WINDOW.into())
            .unwrap();

        // reverse order
        ws.reorder_tabs(&MAIN_WINDOW.into(), &[tc.clone(), tb.clone(), ta.clone()])
            .unwrap();
        let snap = ws.snapshot_for(&MAIN_WINDOW.into());
        assert_eq!(snap.tabs[0].id, tc);
        assert_eq!(snap.tabs[1].id, tb);
        assert_eq!(snap.tabs[2].id, ta);
        assert_eq!(
            snap.tabs.iter().map(|t| t.position).collect::<Vec<_>>(),
            vec![0, 1, 2]
        );
    }

    #[test]
    fn serialize_restore_round_trip() {
        let mut ws = AppWorkspace::default();
        ws.ensure_main();
        let a = tmp_file("persist.pdf", "%PDF");
        ws.open_document(a.to_str().unwrap(), &MAIN_WINDOW.into())
            .unwrap();

        let serialized = ws.serialize();
        let restored = AppWorkspace::restore(&serialized).expect("restore");
        let snap = restored.snapshot_for(&MAIN_WINDOW.into());
        assert_eq!(snap.tabs.len(), 1);
        assert_eq!(snap.documents.len(), 1);
    }

    #[test]
    fn pdf_working_copy_keeps_original_untouched_and_is_discarded_on_close() {
        let mut ws = AppWorkspace::default();
        ws.ensure_main();
        let original = tmp_file("working-copy.pdf", "%PDF-original");
        let tab_id = ws
            .open_document(original.to_str().unwrap(), &MAIN_WINDOW.into())
            .unwrap();

        let working_copy = ws
            .ensure_pdf_working_copy(original.to_str().unwrap())
            .expect("create working copy");
        std::fs::write(&working_copy, b"%PDF-modified").expect("mutate working copy");

        assert_eq!(std::fs::read(&original).unwrap(), b"%PDF-original");
        assert_eq!(
            ws.pdf_source_path(&original.canonicalize().unwrap()),
            Some(working_copy.clone())
        );

        ws.close_tab(&tab_id).expect("close tab");
        assert!(
            !working_copy.exists(),
            "closing without save discards the working copy"
        );
        assert_eq!(std::fs::read(&original).unwrap(), b"%PDF-original");
        let _ = std::fs::remove_file(original);
    }

    #[test]
    fn restored_session_never_claims_an_unrecoverable_pdf_is_dirty() {
        let mut ws = AppWorkspace::default();
        ws.ensure_main();
        let original = tmp_file("dirty-restore.pdf", "%PDF-original");
        let tab_id = ws
            .open_document(original.to_str().unwrap(), &MAIN_WINDOW.into())
            .unwrap();
        let document_id = ws.tabs[&tab_id].document_id.clone().unwrap();
        let working_copy = ws
            .ensure_pdf_working_copy(original.to_str().unwrap())
            .expect("create working copy");
        ws.set_dirty(&document_id, true);

        let restored = AppWorkspace::restore(&ws.serialize()).expect("restore");
        let restored_document = restored
            .documents
            .get(&document_id)
            .expect("restored document");
        assert!(!restored_document.dirty);
        assert!(restored_document.pdf_working_copy.is_none());

        let _ = std::fs::remove_file(working_copy);
        let _ = std::fs::remove_file(original);
    }

    #[test]
    fn opening_after_restore_does_not_reuse_persisted_ids() {
        let mut ws = AppWorkspace::default();
        ws.ensure_main();
        let first = tmp_file("restore-first.pdf", "%PDF");
        let second = tmp_file("restore-second.pdf", "%PDF");
        ws.open_document(first.to_str().unwrap(), &MAIN_WINDOW.into())
            .unwrap();

        let serialized = ws.serialize();
        let mut restored = AppWorkspace::restore(&serialized).expect("restore");
        restored
            .open_document(second.to_str().unwrap(), &MAIN_WINDOW.into())
            .unwrap();

        let snapshot = restored.snapshot_for(&MAIN_WINDOW.into());
        assert_eq!(snapshot.tabs.len(), 2);
        assert_eq!(snapshot.documents.len(), 2);
        assert_ne!(snapshot.tabs[0].document_id, snapshot.tabs[1].document_id);
    }

    #[test]
    fn restore_collapses_duplicate_tabs_for_one_document() {
        let mut ws = AppWorkspace::default();
        ws.ensure_main();
        let path = tmp_file("restore-duplicate.pdf", "%PDF");
        let original_tab = ws
            .open_document(path.to_str().unwrap(), &MAIN_WINDOW.into())
            .unwrap();
        let document_id = ws.tabs[&original_tab].document_id.clone().unwrap();
        let duplicate_tab = ws.fresh_id("tab");
        ws.tabs.insert(
            duplicate_tab.clone(),
            WindowTab {
                id: duplicate_tab.clone(),
                window_id: MAIN_WINDOW.into(),
                document_id: Some(document_id),
                title: "duplicate".into(),
                position: 1,
                active: true,
            },
        );
        let main = ws.windows.get_mut(MAIN_WINDOW).expect("main window");
        main.tab_ids.push(duplicate_tab.clone());
        main.active_tab = Some(duplicate_tab);

        let restored = AppWorkspace::restore(&ws.serialize()).expect("restore");
        let snapshot = restored.snapshot_for(&MAIN_WINDOW.into());
        assert_eq!(snapshot.tabs.len(), 1);
        assert_eq!(snapshot.documents.len(), 1);
    }
}
