//! Read-only, one-directory-at-a-time browsing for the new tab page.
use std::{path::PathBuf, time::UNIX_EPOCH};

use serde::Serialize;
use tauri::Manager;

#[derive(Serialize)]
pub struct LocalLocation {
    name: String,
    path: String,
}

#[derive(Serialize)]
pub struct LocalLocations {
    roots: Vec<LocalLocation>,
    shortcuts: Vec<LocalLocation>,
}

#[derive(Serialize)]
pub struct LocalEntry {
    name: String,
    path: String,
    is_dir: bool,
    file_size: Option<u64>,
    modified_at: Option<u64>,
}

#[derive(Serialize)]
pub struct LocalDirectory {
    path: String,
    parent: Option<String>,
    entries: Vec<LocalEntry>,
    skipped: usize,
}

fn display_path(path: &std::path::Path) -> String {
    let value = path.to_string_lossy();
    if let Some(unc) = value.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{unc}")
    } else {
        value.strip_prefix(r"\\?\").unwrap_or(&value).to_string()
    }
}

#[cfg(target_os = "windows")]
fn local_roots() -> Vec<LocalLocation> {
    #[link(name = "kernel32")]
    extern "system" {
        fn GetLogicalDrives() -> u32;
        fn GetDriveTypeW(root: *const u16) -> u32;
    }
    // Enumerate without touching remote shares or probing removable media.
    let drives = unsafe { GetLogicalDrives() };
    (0..26)
        .filter_map(|index| {
            if drives & (1 << index) == 0 {
                return None;
            }
            let letter = char::from(b'A' + index);
            let path = format!("{letter}:\\");
            let wide: Vec<u16> = path.encode_utf16().chain(Some(0)).collect();
            let kind = unsafe { GetDriveTypeW(wide.as_ptr()) };
            if !matches!(kind, 2 | 3 | 5 | 6) {
                return None;
            }
            Some(LocalLocation {
                name: format!("本地磁盘 ({letter}:)"),
                path,
            })
        })
        .collect()
}

#[cfg(not(target_os = "windows"))]
fn local_roots() -> Vec<LocalLocation> {
    vec![LocalLocation {
        name: "文件系统".into(),
        path: "/".into(),
    }]
}

#[tauri::command]
pub fn get_local_locations(app: tauri::AppHandle) -> LocalLocations {
    let resolver = app.path();
    let shortcuts = [
        ("桌面", resolver.desktop_dir()),
        ("下载", resolver.download_dir()),
        ("文档", resolver.document_dir()),
        ("用户文件夹", resolver.home_dir()),
    ]
    .into_iter()
    .filter_map(|(name, result)| {
        result.ok().map(|path| LocalLocation {
            name: name.into(),
            path: display_path(&path),
        })
    })
    .collect();
    LocalLocations {
        roots: local_roots(),
        shortcuts,
    }
}

fn supported_file(path: &std::path::Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            ["pdf", "md", "markdown"]
                .iter()
                .any(|known| extension.eq_ignore_ascii_case(known))
        })
}

fn read_directory(path: PathBuf) -> Result<LocalDirectory, String> {
    // Absolute paths keep navigation independent of the process working directory.
    if !path.is_absolute() {
        return Err("请输入完整的文件夹路径".into());
    }
    let path = std::fs::canonicalize(path).map_err(|error| format!("无法访问文件夹：{error}"))?;
    let directory = std::fs::read_dir(&path).map_err(|error| format!("无法读取文件夹：{error}"))?;
    let mut entries = Vec::new();
    let mut skipped = 0;
    for result in directory {
        let Ok(entry) = result else {
            skipped += 1;
            continue;
        };
        let entry_path = entry.path();
        // No recursion, no file content reads. Follow directory links on demand.
        let metadata = match std::fs::metadata(&entry_path) {
            Ok(metadata) => metadata,
            Err(_) => {
                skipped += 1;
                continue;
            }
        };
        if !(metadata.is_dir() || metadata.is_file() && supported_file(&entry_path)) {
            continue;
        }
        entries.push(LocalEntry {
            name: entry.file_name().to_string_lossy().into_owned(),
            path: display_path(&entry_path),
            is_dir: metadata.is_dir(),
            file_size: metadata.is_file().then_some(metadata.len()),
            modified_at: metadata
                .modified()
                .ok()
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .map(|duration| duration.as_millis() as u64),
        });
    }
    entries.sort_by(|left, right| {
        right
            .is_dir
            .cmp(&left.is_dir)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
            .then_with(|| left.name.cmp(&right.name))
    });
    Ok(LocalDirectory {
        parent: path.parent().map(display_path),
        path: display_path(&path),
        entries,
        skipped,
    })
}

#[tauri::command]
pub async fn list_local_directory(path: String) -> Result<LocalDirectory, String> {
    tauri::async_runtime::spawn_blocking(move || read_directory(PathBuf::from(path)))
        .await
        .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn directory_is_read_only_filtered_sorted_and_resolves_parent() {
        let root = std::env::temp_dir().join(format!("reader-local-files-{}", std::process::id()));
        std::fs::create_dir_all(root.join("Nested")).unwrap();
        for name in ["z.PDF", "a.md", "b.markdown", "omit.txt"] {
            std::fs::write(root.join(name), "test").unwrap();
        }
        let listing = read_directory(root.clone()).unwrap();
        assert_eq!(
            listing
                .entries
                .iter()
                .map(|entry| entry.name.as_str())
                .collect::<Vec<_>>(),
            ["Nested", "a.md", "b.markdown", "z.PDF"]
        );
        assert!(listing.entries[0].is_dir);
        assert_eq!(listing.entries[1].file_size, Some(4));
        assert!(listing.entries[1].modified_at.is_some());
        assert!(listing.parent.is_some());
        assert_eq!(std::fs::read(root.join("a.md")).unwrap(), b"test");
        assert!(read_directory(root.join("missing")).is_err());
        assert!(read_directory(root.join("a.md")).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_relative_paths_and_hides_extended_prefix() {
        assert!(read_directory(PathBuf::from("relative")).is_err());
        assert_eq!(
            display_path(std::path::Path::new(r"\\?\C:\Notes")),
            r"C:\Notes"
        );
        assert_eq!(
            display_path(std::path::Path::new(r"\\?\UNC\server\share")),
            r"\\server\share"
        );
    }
}
