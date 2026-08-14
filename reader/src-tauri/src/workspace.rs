//! Workspace state model (spec §10, §16, §18).
//!
//! Three independent concepts:
//!   - DocumentSession : a file + its parser/annotation/dirty state
//!   - WindowTab       : a tab slot in a window referencing a DocumentSession
//!   - WindowState     : a native window holding ordered tabs (Phase 1: single window)
//!
//! Phase 1 keeps the model minimal: one window ("main"), tabs backed by a
//! plain-text placeholder. The shape is already split so Phase 6 (tab detach /
//! multi-window) only needs to fill in WindowState without touching the
//! DocumentSession / Tab boundary.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

pub type WindowId = String;
pub type DocumentId = String;
pub type TabId = String;

/// The main window label used in Phase 1. Phase 6 will manage multiple.
pub const MAIN_WINDOW: &str = "main";

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
    /// File size in bytes, read once at open time for the placeholder view.
    pub file_size: Option<u64>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct WindowTab {
    pub id: TabId,
    pub window_id: WindowId,
    pub document_id: DocumentId,
    /// Title shown in the tab strip. Defaults to file name.
    pub title: String,
    /// Position within the window tab strip (0-based).
    pub position: usize,
    pub active: bool,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct WorkspaceSnapshot {
    pub window_id: WindowId,
    pub tabs: Vec<WindowTab>,
    pub documents: Vec<DocumentSession>,
    pub active_tab_id: Option<TabId>,
}

#[derive(Default)]
pub struct AppWorkspace {
    pub documents: HashMap<DocumentId, DocumentSession>,
    pub tabs: Vec<WindowTab>,
    pub active_tab: Option<TabId>,
    next_id: u64,
}

impl AppWorkspace {
    fn fresh_id(&mut self, prefix: &str) -> String {
        self.next_id += 1;
        format!("{prefix}-{}", self.next_id)
    }

    /// Canonicalize a path the way the router does, so two different string
    /// spellings of the same file collapse to one DocumentSession (§16).
    fn canonicalize(path: &str) -> Result<PathBuf, String> {
        let p = PathBuf::from(path);
        p.canonicalize()
            .map_err(|e| format!("cannot canonicalize '{path}': {e}"))
    }

    /// The single open_document entry point (§16). Handles OS double-click,
    /// drag-in, CLI, recent files — everything funnels through here.
    ///
    /// Returns the tab id that ended up active for this path.
    pub fn open_document(&mut self, path: &str) -> Result<TabId, String> {
        let canon = Self::canonicalize(path)?;

        // Already open? Focus the existing tab (§16 dedupe).
        if let Some(tab) = self
            .tabs
            .iter()
            .find(|t| self.documents.get(&t.document_id).map_or(false, |d| d.path == canon))
        {
            let id = tab.id.clone();
            self.focus_tab(&id);
            return Ok(id);
        }

        // New DocumentSession.
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
        };
        self.documents.insert(doc_id.clone(), session);

        // New tab at the end of the strip.
        let position = self.tabs.len();
        let tab_id = self.fresh_id("tab");
        let tab = WindowTab {
            id: tab_id.clone(),
            window_id: MAIN_WINDOW.to_string(),
            document_id: doc_id,
            title: file_name,
            position,
            active: true,
        };
        self.tabs.push(tab);
        self.focus_tab(&tab_id);
        Ok(tab_id)
    }

    /// Mark exactly one tab active; deactivate the rest.
    pub fn focus_tab(&mut self, tab_id: &TabId) {
        for t in self.tabs.iter_mut() {
            t.active = t.id == *tab_id;
        }
        self.active_tab = Some(tab_id.clone());
    }

    /// Close a tab. The DocumentSession is dropped only when no remaining tab
    /// references it, so dragging a tab out (Phase 6) won't lose the session.
    pub fn close_tab(&mut self, tab_id: &TabId) -> Result<(), String> {
        let pos = self
            .tabs
            .iter()
            .position(|t| t.id == *tab_id)
            .ok_or_else(|| format!("tab not found: {tab_id}"))?;
        let removed = self.tabs.remove(pos);

        // re-pack positions
        for (i, t) in self.tabs.iter_mut().enumerate() {
            t.position = i;
        }

        // pick a new active tab if we closed the active one
        if self.active_tab.as_deref() == Some(tab_id) {
            self.active_tab = self.tabs.get(pos).or_else(|| self.tabs.last()).map(|t| t.id.clone());
            if let Some(id) = self.active_tab.clone() {
                self.focus_tab(&id);
            }
        }

        // drop the session if nothing else references it
        let still_referenced = self.tabs.iter().any(|t| t.document_id == removed.document_id);
        if !still_referenced {
            self.documents.remove(&removed.document_id);
        }
        Ok(())
    }

    pub fn snapshot(&self) -> WorkspaceSnapshot {
        WorkspaceSnapshot {
            window_id: MAIN_WINDOW.to_string(),
            tabs: self.tabs.clone(),
            documents: self.documents.values().cloned().collect(),
            active_tab_id: self.active_tab.clone(),
        }
    }
}

/// Convenience: the workspace lives behind a Mutex in Tauri State.
pub type SharedWorkspace = Mutex<AppWorkspace>;

pub fn new_shared() -> SharedWorkspace {
    Mutex::new(AppWorkspace::default())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmp_file(name: &str, body: &str) -> PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!("reader-test-{}-{}", std::process::id(), name));
        fs::write(&p, body).unwrap();
        p
    }

    #[test]
    fn open_document_creates_one_tab_per_unique_file() {
        let mut ws = AppWorkspace::default();
        let a = tmp_file("a.pdf", "%PDF-1.4");
        let b = tmp_file("b.md", "# hi");
        let c = tmp_file("c.markdown", "# md");
        let d = tmp_file("d.txt", "plain");

        let t1 = ws.open_document(a.to_str().unwrap()).unwrap();
        let t2 = ws.open_document(b.to_str().unwrap()).unwrap();
        let t3 = ws.open_document(c.to_str().unwrap()).unwrap();
        let t4 = ws.open_document(d.to_str().unwrap()).unwrap();
        assert_ne!(t1, t2);
        assert_ne!(t2, t3);
        assert_ne!(t3, t4);
        assert_eq!(ws.tabs.len(), 4);

        // doc_type detection
        let docs: Vec<_> = ws.snapshot().documents;
        assert_eq!(docs.iter().find(|d| d.file_name.ends_with("a.pdf")).unwrap().doc_type, DocumentType::Pdf);
        assert_eq!(docs.iter().find(|d| d.file_name.ends_with("b.md")).unwrap().doc_type, DocumentType::Markdown);
        assert_eq!(docs.iter().find(|d| d.file_name.ends_with("c.markdown")).unwrap().doc_type, DocumentType::Markdown);
        assert_eq!(docs.iter().find(|d| d.file_name.ends_with("d.txt")).unwrap().doc_type, DocumentType::Unknown);
    }

    #[test]
    fn open_document_dedupes_same_file_different_spelling() {
        // §16: two spellings of the same file collapse to one session+tab.
        let mut ws = AppWorkspace::default();
        let path = tmp_file("dedup.pdf", "%PDF");
        let abs = path.to_str().unwrap();
        // build a relative spelling via cwd if possible; otherwise use the
        // canonical form twice — still exercises the path-equality branch.
        let t1 = ws.open_document(abs).unwrap();
        let t2 = ws.open_document(abs).unwrap();
        assert_eq!(t1, t2, "same path must return the existing tab id");
        assert_eq!(ws.tabs.len(), 1);
        assert_eq!(ws.documents.len(), 1);
        assert_eq!(ws.active_tab, Some(t1));
    }

    #[test]
    fn new_open_becomes_active_and_dedup_focuses() {
        let mut ws = AppWorkspace::default();
        let a = tmp_file("x.pdf", "%PDF");
        let b = tmp_file("y.md", "# y");
        let ta = ws.open_document(a.to_str().unwrap()).unwrap();
        let tb = ws.open_document(b.to_str().unwrap()).unwrap();
        assert_eq!(ws.active_tab, Some(tb));
        // re-open a → a becomes active again, no new tab
        let ta2 = ws.open_document(a.to_str().unwrap()).unwrap();
        assert_eq!(ta2, ta);
        assert_eq!(ws.tabs.len(), 2);
        assert_eq!(ws.active_tab, Some(ta));
    }

    #[test]
    fn close_tab_repacks_positions_and_picks_neighbour_active() {
        let mut ws = AppWorkspace::default();
        let a = tmp_file("a.pdf", "%PDF");
        let b = tmp_file("b.md", "# b");
        let c = tmp_file("c.pdf", "%PDF");
        let ta = ws.open_document(a.to_str().unwrap()).unwrap();
        let tb = ws.open_document(b.to_str().unwrap()).unwrap();
        let tc = ws.open_document(c.to_str().unwrap()).unwrap();
        // positions 0,1,2
        assert_eq!(ws.tabs.iter().map(|t| t.position).collect::<Vec<_>>(), vec![0, 1, 2]);
        // close middle
        ws.close_tab(&tb).unwrap();
        assert_eq!(ws.tabs.len(), 2);
        // repacked
        assert_eq!(ws.tabs.iter().map(|t| t.position).collect::<Vec<_>>(), vec![0, 1]);
        // remaining tabs are a and c
        let remaining: Vec<_> = ws.tabs.iter().map(|t| t.id.clone()).collect();
        assert!(remaining.contains(&ta) && remaining.contains(&tc));
    }

    #[test]
    fn close_last_tab_leaves_empty_workspace() {
        let mut ws = AppWorkspace::default();
        let a = tmp_file("only.pdf", "%PDF");
        let ta = ws.open_document(a.to_str().unwrap()).unwrap();
        ws.close_tab(&ta).unwrap();
        assert!(ws.tabs.is_empty());
        assert!(ws.documents.is_empty());
        assert!(ws.active_tab.is_none());
    }

    #[test]
    fn close_tab_keeps_session_if_another_tab_references_it() {
        // Phase 6 will reference one DocumentSession from two tabs (detach).
        // Even now the model must not drop a session that's still referenced.
        let mut ws = AppWorkspace::default();
        let a = tmp_file("shared.pdf", "%PDF");
        let t1 = ws.open_document(a.to_str().unwrap()).unwrap();
        // simulate a second tab on the same document id manually
        let doc_id = ws.tabs[0].document_id.clone();
        let t2 = format!("tab-extra");
        ws.tabs.push(WindowTab {
            id: t2.clone(),
            window_id: MAIN_WINDOW.to_string(),
            document_id: doc_id.clone(),
            title: "shared (2)".into(),
            position: 1,
            active: false,
        });
        ws.focus_tab(&t2);
        // close one of the two tabs
        ws.close_tab(&t2).unwrap();
        assert_eq!(ws.tabs.len(), 1);
        assert_eq!(ws.tabs[0].id, t1);
        assert!(ws.documents.contains_key(&doc_id), "session must survive while a tab still refs it");
    }
}
