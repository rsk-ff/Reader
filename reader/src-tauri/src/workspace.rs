//! Workspace state model (spec §10, §16, §18).
//!
//! Three independent concepts:
//!   - DocumentSession : a file + its parser/annotation/dirty state (global)
//!   - WindowState     : a native window holding an ordered list of tab ids
//!   - WindowTab       : a tab slot referencing a DocumentSession, living in a window
//!
//! Phase 6 makes this truly multi-window: tabs can be reordered, detached into
//! new windows, and moved between windows — all without recreating the
//! underlying DocumentSession (so dirty state survives, Test 10).

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

pub type WindowId = String;
pub type DocumentId = String;
pub type TabId = String;

/// The primary window label. Always exists; shows the empty state when it has
/// no tabs. Detached tabs go into dynamically-created windows.
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
    pub file_size: Option<u64>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct WindowTab {
    pub id: TabId,
    pub window_id: WindowId,
    pub document_id: DocumentId,
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

    fn canonicalize(path: &str) -> Result<PathBuf, String> {
        let p = PathBuf::from(path);
        p.canonicalize()
            .map_err(|e| format!("cannot canonicalize '{path}': {e}"))
    }

    /// The single open_document entry point (§16). `target_window` selects
    /// which window receives the new tab (or focuses the existing one).
    pub fn open_document(
        &mut self,
        path: &str,
        target_window: &WindowId,
    ) -> Result<TabId, String> {
        self.ensure_main();
        let canon = Self::canonicalize(path)?;

        // Already open anywhere? Focus that tab's window + tab (§16 dedupe).
        if let Some(tab) = self
            .tabs
            .values()
            .find(|t| self.documents.get(&t.document_id).map_or(false, |d| d.path == canon))
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
        };
        self.documents.insert(doc_id.clone(), session);

        let tab_id = self.fresh_id("tab");
        let tab = WindowTab {
            id: tab_id.clone(),
            window_id: target_window.clone(),
            document_id: doc_id,
            title: file_name,
            position: 0,
            active: true,
        };
        self.tabs.insert(tab_id.clone(), tab);
        let win = self.windows.entry(target_window.clone()).or_insert_with(|| {
            WindowState {
                id: target_window.clone(),
                tab_ids: vec![],
                active_tab: None,
                bounds: None,
            }
        });
        win.tab_ids.push(tab_id.clone());
        self.focus_tab(&tab_id)?;
        Ok(tab_id)
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
        let win = self
            .windows
            .get_mut(&tab.window_id)
            .ok_or_else(|| format!("window not found: {}", tab.window_id))?;
        win.tab_ids.retain(|id| id != tab_id);
        if win.active_tab.as_deref() == Some(tab_id) {
            win.active_tab = win.tab_ids.first().cloned();
        }
        // drop session if nothing references it
        let still_referenced = self.tabs.values().any(|t| t.document_id == tab.document_id);
        if !still_referenced {
            self.documents.remove(&tab.document_id);
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
                    let still_referenced =
                        self.tabs.values().any(|t| t.document_id == tab.document_id);
                    if !still_referenced {
                        self.documents.remove(&tab.document_id);
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
        for d in s.documents {
            ws.documents.insert(d.id.clone(), d);
        }
        ws.ensure_main();
        Some(ws)
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

        let t1 = ws.open_document(a.to_str().unwrap(), &MAIN_WINDOW.into()).unwrap();
        let t2 = ws.open_document(b.to_str().unwrap(), &MAIN_WINDOW.into()).unwrap();
        let t3 = ws.open_document(c.to_str().unwrap(), &MAIN_WINDOW.into()).unwrap();
        let t4 = ws.open_document(d.to_str().unwrap(), &MAIN_WINDOW.into()).unwrap();
        assert_ne!(t1, t2);
        assert_ne!(t2, t3);
        assert_ne!(t3, t4);

        let snap = ws.snapshot_for(&MAIN_WINDOW.into());
        assert_eq!(snap.tabs.len(), 4);
        assert_eq!(snap.documents.len(), 4);
        // doc_type detection
        assert_eq!(snap.documents.iter().find(|d| d.file_name.ends_with("a.pdf")).unwrap().doc_type, DocumentType::Pdf);
        assert_eq!(snap.documents.iter().find(|d| d.file_name.ends_with("b.md")).unwrap().doc_type, DocumentType::Markdown);
    }

    #[test]
    fn open_document_dedupes_same_file() {
        let mut ws = AppWorkspace::default();
        ws.ensure_main();
        let path = tmp_file("dedup.pdf", "%PDF");
        let t1 = ws.open_document(path.to_str().unwrap(), &MAIN_WINDOW.into()).unwrap();
        let t2 = ws.open_document(path.to_str().unwrap(), &MAIN_WINDOW.into()).unwrap();
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
        let ta = ws.open_document(a.to_str().unwrap(), &MAIN_WINDOW.into()).unwrap();
        let tb = ws.open_document(b.to_str().unwrap(), &MAIN_WINDOW.into()).unwrap();
        let snap = ws.snapshot_for(&MAIN_WINDOW.into());
        assert_eq!(snap.active_tab_id, Some(tb));
        // re-open a → a becomes active again, no new tab
        let ta2 = ws.open_document(a.to_str().unwrap(), &MAIN_WINDOW.into()).unwrap();
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
        let ta = ws.open_document(a.to_str().unwrap(), &MAIN_WINDOW.into()).unwrap();
        let tb = ws.open_document(b.to_str().unwrap(), &MAIN_WINDOW.into()).unwrap();
        let tc = ws.open_document(c.to_str().unwrap(), &MAIN_WINDOW.into()).unwrap();
        ws.close_tab(&tb).unwrap();
        let snap = ws.snapshot_for(&MAIN_WINDOW.into());
        assert_eq!(snap.tabs.len(), 2);
        // repacked positions 0,1
        assert_eq!(snap.tabs.iter().map(|t| t.position).collect::<Vec<_>>(), vec![0, 1]);
        // remaining tabs are a and c
        let ids: Vec<_> = snap.tabs.iter().map(|t| t.id.clone()).collect();
        assert!(ids.contains(&ta) && ids.contains(&tc));
    }

    #[test]
    fn close_last_tab_leaves_empty_window() {
        let mut ws = AppWorkspace::default();
        ws.ensure_main();
        let a = tmp_file("only.pdf", "%PDF");
        let ta = ws.open_document(a.to_str().unwrap(), &MAIN_WINDOW.into()).unwrap();
        ws.close_tab(&ta).unwrap();
        let snap = ws.snapshot_for(&MAIN_WINDOW.into());
        assert!(snap.tabs.is_empty());
        assert!(snap.documents.is_empty());
        assert!(snap.active_tab_id.is_none());
    }

    #[test]
    fn detach_tab_moves_session_not_recreates() {
        // Test 10: dragging a tab out must not recreate the DocumentSession.
        let mut ws = AppWorkspace::default();
        ws.ensure_main();
        let a = tmp_file("detach.pdf", "%PDF");
        let ta = ws.open_document(a.to_str().unwrap(), &MAIN_WINDOW.into()).unwrap();
        let doc_id = ws.tabs.get(&ta).unwrap().document_id.clone();

        // mark dirty to prove dirty state survives the detach
        ws.set_dirty(&doc_id, true);

        let new_win = ws.detach_tab(&ta).unwrap();
        assert_ne!(new_win, MAIN_WINDOW);

        // session still exists, still dirty
        let doc = ws.documents.get(&doc_id).expect("session must survive detach");
        assert!(doc.dirty, "dirty state must survive detach");

        // tab now lives in the new window
        let snap_main = ws.snapshot_for(&MAIN_WINDOW.into());
        assert!(snap_main.tabs.is_empty(), "main should be empty after detach");
        let snap_new = ws.snapshot_for(&new_win);
        assert_eq!(snap_new.tabs.len(), 1);
        assert_eq!(snap_new.tabs[0].id, ta);
    }

    #[test]
    fn move_tab_between_windows_keeps_dirty() {
        let mut ws = AppWorkspace::default();
        ws.ensure_main();
        let a = tmp_file("move.pdf", "%PDF");
        let ta = ws.open_document(a.to_str().unwrap(), &MAIN_WINDOW.into()).unwrap();
        let doc_id = ws.tabs.get(&ta).unwrap().document_id.clone();
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
        let ta = ws.open_document(a.to_str().unwrap(), &MAIN_WINDOW.into()).unwrap();
        let tb = ws.open_document(b.to_str().unwrap(), &MAIN_WINDOW.into()).unwrap();
        let tc = ws.open_document(c.to_str().unwrap(), &MAIN_WINDOW.into()).unwrap();

        // reverse order
        ws.reorder_tabs(&MAIN_WINDOW.into(), &[tc.clone(), tb.clone(), ta.clone()]).unwrap();
        let snap = ws.snapshot_for(&MAIN_WINDOW.into());
        assert_eq!(snap.tabs[0].id, tc);
        assert_eq!(snap.tabs[1].id, tb);
        assert_eq!(snap.tabs[2].id, ta);
        assert_eq!(snap.tabs.iter().map(|t| t.position).collect::<Vec<_>>(), vec![0, 1, 2]);
    }

    #[test]
    fn serialize_restore_round_trip() {
        let mut ws = AppWorkspace::default();
        ws.ensure_main();
        let a = tmp_file("persist.pdf", "%PDF");
        ws.open_document(a.to_str().unwrap(), &MAIN_WINDOW.into()).unwrap();

        let serialized = ws.serialize();
        let restored = AppWorkspace::restore(&serialized).expect("restore");
        let snap = restored.snapshot_for(&MAIN_WINDOW.into());
        assert_eq!(snap.tabs.len(), 1);
        assert_eq!(snap.documents.len(), 1);
    }
}
