//! Markdown text read/save commands, limited to open Markdown documents.

use super::*;

/// The canonical path of a saved Markdown document open in the workspace.
/// Text read/write commands only reach these files, never arbitrary paths.
pub(crate) fn open_markdown_path(ws: &SharedWorkspace, path: &str) -> Result<PathBuf, String> {
    let canonical =
        std::fs::canonicalize(path).map_err(|e| format!("canonicalize '{path}': {e}"))?;
    let guard = ws
        .lock()
        .map_err(|e| format!("workspace lock poisoned: {e}"))?;
    guard
        .documents
        .values()
        .any(|document| {
            !document.untitled
                && document.doc_type == DocumentType::Markdown
                && document.path == canonical
        })
        .then_some(canonical)
        .ok_or_else(|| format!("Markdown document is not open in this workspace: {path}"))
}

/// Read a Markdown file as editor text and the on-disk format it came from.
pub(crate) fn read_markdown_file(path: &Path) -> Result<(String, MarkdownDiskState), String> {
    let stamp = disk_stamp(path);
    let bytes = std::fs::read(path).map_err(|e| format!("read '{}': {e}", path.display()))?;
    let (text, bom, crlf) = decode_markdown(bytes)?;
    Ok((text, MarkdownDiskState { stamp, bom, crlf }))
}

pub(crate) fn remember_markdown_disk(ws: &SharedWorkspace, path: &Path, state: MarkdownDiskState) {
    if let Ok(mut guard) = ws.lock() {
        if let Some(document) = guard
            .documents
            .values_mut()
            .find(|document| !document.untitled && document.path == path)
        {
            document.markdown_disk = Some(state);
        }
    }
}

/// Read an open Markdown document as UTF-8 editor text (LF, no BOM). Used by
/// the Markdown adapter; the original BOM and line endings are remembered.
#[tauri::command]
pub fn read_file_text(path: String, ws: State<'_, SharedWorkspace>) -> Result<String, String> {
    let canonical = open_markdown_path(&ws, &path)?;
    let (text, state) = read_markdown_file(&canonical)?;
    remember_markdown_disk(&ws, &canonical, state);
    Ok(text)
}

pub(crate) fn save_file_text_impl(path: &Path, content: &[u8]) -> Result<(), String> {
    let tmp = PathBuf::from(format!("{}.tmp", path.to_string_lossy()));
    std::fs::write(&tmp, content).map_err(|e| format!("write tmp '{}': {e}", tmp.display()))?;
    let f = std::fs::OpenOptions::new()
        .write(true)
        .open(&tmp)
        .map_err(|e| format!("reopen tmp '{}': {e}", tmp.display()))?;
    f.sync_all()
        .map_err(|e| format!("fsync tmp '{}': {e}", tmp.display()))?;
    drop(f);
    std::fs::rename(&tmp, path)
        .map_err(|e| format!("rename '{}' -> '{}': {e}", tmp.display(), path.display()))?;
    Ok(())
}

/// Save an open Markdown document with its original BOM and line endings.
/// Unless `overwrite`, refuse when the file changed on disk since Reader last
/// read or wrote it, so another program's edits are not silently replaced.
pub(crate) fn save_open_markdown(
    ws: &SharedWorkspace,
    path: &Path,
    content: &str,
    overwrite: bool,
) -> Result<(), String> {
    let mut guard = ws
        .lock()
        .map_err(|e| format!("workspace lock poisoned: {e}"))?;
    let document = guard
        .documents
        .values_mut()
        .find(|document| !document.untitled && document.path == path)
        .ok_or_else(|| format!("Markdown document is not open: {}", path.display()))?;
    let state = document.markdown_disk.unwrap_or_default();
    if !overwrite && state.stamp.is_some() && disk_stamp(path) != state.stamp {
        return Err(format!(
            "{EXTERNAL_CHANGE_ERROR}“{}”在 Reader 外被修改过。",
            path.display()
        ));
    }
    save_file_text_impl(path, &encode_markdown(content, state.bom, state.crlf))?;
    document.markdown_disk = Some(MarkdownDiskState {
        stamp: disk_stamp(path),
        ..state
    });
    Ok(())
}

/// Atomically write `content` to `path` (§7 transactional save):
///   foo.md → foo.md.tmp → fsync → rename → foo.md
#[tauri::command]
pub fn save_file_text(
    path: String,
    content: String,
    overwrite: Option<bool>,
    ws: State<'_, SharedWorkspace>,
) -> Result<(), String> {
    let canonical = open_markdown_path(&ws, &path)?;
    save_open_markdown(&ws, &canonical, &content, overwrite.unwrap_or(false))
}

pub(crate) fn canonical_markdown_target(path: &str) -> Result<PathBuf, String> {
    let requested = PathBuf::from(path);
    if !requested.is_absolute() {
        return Err(format!("save path must be absolute: {path}"));
    }
    let extension = requested
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase);
    if !matches!(extension.as_deref(), Some("md" | "markdown")) {
        return Err(format!(
            "Markdown save path must end in .md or .markdown: {path}"
        ));
    }
    let file_name = requested
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| format!("save path has no valid file name: {path}"))?;
    let parent = requested
        .parent()
        .ok_or_else(|| format!("save path has no parent directory: {path}"))?
        .canonicalize()
        .map_err(|error| format!("cannot canonicalize save directory for '{path}': {error}"))?;
    let target = parent.join(file_name);
    if target.exists() {
        target
            .canonicalize()
            .map_err(|error| format!("cannot canonicalize save path '{path}': {error}"))
    } else {
        Ok(target)
    }
}

/// First save for an in-memory Markdown document. The caller chooses the path
/// only at save time; the existing document/tab identity remains stable.
#[tauri::command]
pub fn save_markdown_document_as(
    document_id: String,
    path: String,
    content: String,
    app: AppHandle,
    ws: State<'_, SharedWorkspace>,
) -> Result<String, String> {
    let target = canonical_markdown_target(&path)?;
    let mut guard = ws
        .lock()
        .map_err(|error| format!("workspace lock poisoned: {error}"))?;
    guard.validate_markdown_save_target(&document_id, &target)?;
    save_file_text_impl(&target, content.as_bytes())?;
    let canonical = target.canonicalize().map_err(|error| {
        format!(
            "cannot canonicalize saved Markdown '{}': {error}",
            target.display()
        )
    })?;
    guard.finalize_markdown_save(&document_id, canonical.clone())?;
    if let Some(document) = guard.documents.get_mut(&document_id) {
        document.markdown_disk = Some(MarkdownDiskState {
            stamp: disk_stamp(&canonical),
            ..Default::default()
        });
    }
    drop(guard);
    broadcast(&app, &ws);
    Ok(canonical.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn markdown_save_replaces_an_existing_file_atomically() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        let path = std::env::temp_dir().join(format!("reader-markdown-save-{unique}.md"));
        std::fs::write(&path, "old").expect("seed markdown file");
        let path_string = path.to_string_lossy().into_owned();

        save_file_text_impl(&path, b"first").expect("first save");
        save_file_text_impl(&path, b"second").expect("replacement save");

        assert_eq!(
            read_markdown_file(&path).expect("read saved file").0,
            "second"
        );
        assert!(!std::path::Path::new(&format!("{path_string}.tmp")).exists());

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn text_commands_only_reach_open_markdown_documents() {
        use crate::workspace::{AppWorkspace, MAIN_WINDOW};
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        let open = std::env::temp_dir().join(format!("reader-open-{unique}.md"));
        let closed = std::env::temp_dir().join(format!("reader-closed-{unique}.md"));
        let pdf = std::env::temp_dir().join(format!("reader-open-{unique}.pdf"));
        for path in [&open, &closed, &pdf] {
            std::fs::write(path, "x").unwrap();
        }
        let ws = std::sync::Mutex::new(AppWorkspace::default());
        {
            let mut guard = ws.lock().unwrap();
            guard.ensure_main();
            guard
                .open_document(open.to_str().unwrap(), &MAIN_WINDOW.into())
                .unwrap();
            guard
                .open_document(pdf.to_str().unwrap(), &MAIN_WINDOW.into())
                .unwrap();
        }

        assert_eq!(
            open_markdown_path(&ws, open.to_str().unwrap()).unwrap(),
            open.canonicalize().unwrap()
        );
        assert!(open_markdown_path(&ws, closed.to_str().unwrap()).is_err());
        assert!(open_markdown_path(&ws, pdf.to_str().unwrap()).is_err());
        for path in [open, closed, pdf] {
            let _ = std::fs::remove_file(path);
        }
    }

    #[test]
    fn markdown_save_keeps_crlf_and_refuses_an_outside_edit_unless_overwriting() {
        use crate::workspace::{AppWorkspace, MAIN_WINDOW};
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        let path = std::env::temp_dir().join(format!("reader-crlf-{unique}.md"));
        std::fs::write(&path, "# A\r\nbody\r\n").unwrap();
        let ws = std::sync::Mutex::new(AppWorkspace::default());
        ws.lock()
            .unwrap()
            .open_document(path.to_str().unwrap(), &MAIN_WINDOW.into())
            .unwrap();
        let canonical = path.canonicalize().unwrap();
        let (text, state) = read_markdown_file(&canonical).unwrap();
        assert_eq!(text, "# A\nbody\n");
        ws.lock()
            .unwrap()
            .documents
            .values_mut()
            .next()
            .unwrap()
            .markdown_disk = Some(state);

        save_open_markdown(&ws, &canonical, "# A\nedited\n", false).unwrap();
        assert_eq!(std::fs::read(&canonical).unwrap(), b"# A\r\nedited\r\n");

        // Another program rewrites the file (different length => new stamp).
        std::fs::write(&canonical, "# outside edit\r\n").unwrap();
        let refused = save_open_markdown(&ws, &canonical, "# mine\n", false).unwrap_err();
        assert!(refused.starts_with(super::EXTERNAL_CHANGE_ERROR));
        assert_eq!(std::fs::read(&canonical).unwrap(), b"# outside edit\r\n");
        save_open_markdown(&ws, &canonical, "# mine\n", true).unwrap();
        assert_eq!(std::fs::read(&canonical).unwrap(), b"# mine\r\n");
        // The overwrite refreshed the stamp, so the next save is allowed.
        save_open_markdown(&ws, &canonical, "# again\n", false).unwrap();
        let _ = std::fs::remove_file(canonical);
    }

    #[test]
    fn markdown_save_target_requires_an_absolute_markdown_path() {
        assert!(canonical_markdown_target("relative-note.md").is_err());
        let invalid = std::env::temp_dir().join("reader-note.txt");
        assert!(canonical_markdown_target(invalid.to_str().unwrap()).is_err());

        let valid = std::env::temp_dir().join("reader-note.md");
        let canonical = canonical_markdown_target(valid.to_str().unwrap()).unwrap();
        assert!(canonical.is_absolute());
        assert_eq!(
            canonical.extension().and_then(|value| value.to_str()),
            Some("md")
        );
    }
}
