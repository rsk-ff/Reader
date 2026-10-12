//! Discover local sync folders from current client configuration; never persist guessed paths.
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub struct CloudLocation {
    pub id: String,
    pub provider: String,
    pub name: String,
    pub path: String,
}

fn add_location(
    result: &mut Vec<CloudLocation>,
    provider: &str,
    account: &str,
    name: String,
    path: PathBuf,
) {
    if !path.is_absolute() || !path.is_dir() {
        return;
    }
    let path = crate::local_files::display_path(&path);
    if result
        .iter()
        .any(|item| item.path.eq_ignore_ascii_case(&path))
    {
        return;
    }
    result.push(CloudLocation {
        id: format!("{provider}:{account}"),
        provider: provider.into(),
        name,
        path,
    });
}

#[derive(Deserialize)]
struct DropboxAccount {
    path: PathBuf,
}

fn dropbox_locations(
    installed: bool,
    info_files: &[PathBuf],
    registered: &[PathBuf],
) -> Vec<CloudLocation> {
    if !installed {
        return Vec::new();
    }
    // Dropbox documents these two info.json locations. Prefer the newest valid configuration.
    let mut configs: Vec<_> = info_files
        .iter()
        .filter_map(|path| {
            let modified = std::fs::metadata(path).ok()?.modified().ok()?;
            let value: std::collections::BTreeMap<String, DropboxAccount> =
                serde_json::from_slice(&std::fs::read(path).ok()?).ok()?;
            Some((modified, value))
        })
        .collect();
    configs.sort_by_key(|(modified, _)| std::cmp::Reverse(*modified));
    let Some((_, accounts)) = configs.first() else {
        return Vec::new();
    };
    let mut result = Vec::new();
    for (account, value) in accounts {
        if !matches!(account.as_str(), "personal" | "business") || !value.path.is_dir() {
            continue;
        }
        // Team-space configuration may point inside the registered Dropbox root.
        // Only use a root containing the CURRENT configured folder, never a stale registration.
        let path = registered
            .iter()
            .filter(|root| {
                let parent = crate::local_files::display_path(root).to_lowercase();
                let child = crate::local_files::display_path(&value.path).to_lowercase();
                (child == parent
                    || child.starts_with(&format!("{parent}{}", std::path::MAIN_SEPARATOR)))
                    && root.is_dir()
            })
            .max_by_key(|root| root.components().count())
            .unwrap_or(&value.path)
            .clone();
        let name = if account == "business" {
            "Dropbox（工作）"
        } else {
            "Dropbox"
        };
        add_location(&mut result, "dropbox", account, name.into(), path);
    }
    result
}

fn onedrive_locations(installed: bool, accounts: &[(String, PathBuf)]) -> Vec<CloudLocation> {
    let mut result = Vec::new();
    if installed {
        for (account, path) in accounts {
            let name = if account.eq_ignore_ascii_case("Personal") {
                "OneDrive".into()
            } else {
                format!(
                    "OneDrive（{}）",
                    path.file_name().unwrap_or_default().to_string_lossy()
                )
            };
            add_location(&mut result, "onedrive", account, name, path.clone());
        }
    }
    result
}

#[cfg(target_os = "windows")]
mod windows {
    use super::*;
    use std::{ffi::c_void, ptr};

    const HKCU: isize = 0x80000001u32 as i32 as isize;
    const HKLM: isize = 0x80000002u32 as i32 as isize;
    #[link(name = "advapi32")]
    extern "system" {
        fn RegOpenKeyExW(
            root: isize,
            path: *const u16,
            options: u32,
            access: u32,
            key: *mut isize,
        ) -> i32;
        fn RegCloseKey(key: isize) -> i32;
        fn RegGetValueW(
            key: isize,
            subkey: *const u16,
            name: *const u16,
            flags: u32,
            kind: *mut u32,
            data: *mut c_void,
            size: *mut u32,
        ) -> i32;
        fn RegEnumKeyExW(
            key: isize,
            index: u32,
            name: *mut u16,
            size: *mut u32,
            reserved: *mut u32,
            class: *mut u16,
            class_size: *mut u32,
            time: *mut c_void,
        ) -> i32;
        fn GetTokenInformation(
            token: isize,
            kind: u32,
            data: *mut c_void,
            size: u32,
            needed: *mut u32,
        ) -> i32;
        fn ConvertSidToStringSidW(sid: *const c_void, text: *mut *mut u16) -> i32;
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn LocalFree(memory: *mut c_void) -> *mut c_void;
    }

    fn wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(Some(0)).collect()
    }
    struct Key(isize);
    impl Drop for Key {
        fn drop(&mut self) {
            unsafe {
                RegCloseKey(self.0);
            }
        }
    }
    impl Key {
        fn open(root: isize, path: &str, view: u32) -> Option<Self> {
            let mut key = 0;
            // KEY_READ plus explicit registry view; no writes or credentials are requested.
            (unsafe { RegOpenKeyExW(root, wide(path).as_ptr(), 0, 0x20019 | view, &mut key) } == 0)
                .then_some(Self(key))
        }
        fn string(&self, name: &str) -> Option<String> {
            let mut buffer = vec![0u16; 32768];
            let mut bytes = (buffer.len() * 2) as u32;
            let status = unsafe {
                RegGetValueW(
                    self.0,
                    ptr::null(),
                    wide(name).as_ptr(),
                    0x2 | 0x4,
                    ptr::null_mut(),
                    buffer.as_mut_ptr().cast(),
                    &mut bytes,
                )
            };
            if status != 0 {
                return None;
            }
            let length = buffer.iter().position(|value| *value == 0)?;
            let value = String::from_utf16(&buffer[..length]).ok()?;
            (!value.is_empty()).then_some(value)
        }
        fn children(&self) -> Vec<String> {
            let mut result = Vec::new();
            for index in 0..1024 {
                let mut buffer = [0u16; 256];
                let mut size = buffer.len() as u32;
                if unsafe {
                    RegEnumKeyExW(
                        self.0,
                        index,
                        buffer.as_mut_ptr(),
                        &mut size,
                        ptr::null_mut(),
                        ptr::null_mut(),
                        ptr::null_mut(),
                        ptr::null_mut(),
                    )
                } != 0
                {
                    break;
                }
                if let Ok(name) = String::from_utf16(&buffer[..size as usize]) {
                    result.push(name);
                }
            }
            result
        }
    }

    fn current_sid() -> Option<String> {
        let mut needed = 0;
        // Windows 8+ pseudo-handle for the current process token; TOKEN_USER = 1.
        unsafe {
            GetTokenInformation(-4, 1, ptr::null_mut(), 0, &mut needed);
        }
        if needed == 0 || needed > 65536 {
            return None;
        }
        let mut buffer = vec![0usize; (needed as usize).div_ceil(std::mem::size_of::<usize>())];
        if unsafe { GetTokenInformation(-4, 1, buffer.as_mut_ptr().cast(), needed, &mut needed) }
            == 0
        {
            return None;
        }
        let sid = unsafe { *buffer.as_ptr().cast::<*const c_void>() };
        let mut text = ptr::null_mut();
        if unsafe { ConvertSidToStringSidW(sid, &mut text) } == 0 {
            return None;
        }
        let mut length = 0;
        while length < 256 && unsafe { *text.add(length) } != 0 {
            length += 1;
        }
        let value = String::from_utf16(unsafe { std::slice::from_raw_parts(text, length) }).ok();
        unsafe {
            LocalFree(text.cast());
        }
        value
    }

    fn env_path(name: &str, suffix: &str) -> Option<PathBuf> {
        std::env::var_os(name).map(|base| PathBuf::from(base).join(suffix))
    }
    fn installed(provider: &str) -> bool {
        let (exe, local, system) = if provider == "dropbox" {
            (
                "Dropbox.exe",
                r"Dropbox\Client\Dropbox.exe",
                r"Dropbox\Client\Dropbox.exe",
            )
        } else {
            (
                "OneDrive.exe",
                r"Microsoft\OneDrive\OneDrive.exe",
                r"Microsoft OneDrive\OneDrive.exe",
            )
        };
        let mut candidates: Vec<_> = [
            env_path("LOCALAPPDATA", local),
            env_path("ProgramFiles", system),
            env_path("ProgramFiles(x86)", system),
        ]
        .into_iter()
        .flatten()
        .collect();
        for hive in [HKCU, HKLM] {
            for view in [0x100, 0x200] {
                if let Some(path) = Key::open(
                    hive,
                    &format!(r"Software\Microsoft\Windows\CurrentVersion\App Paths\{exe}"),
                    view,
                )
                .and_then(|key| key.string(""))
                {
                    candidates.push(PathBuf::from(path.trim_matches('"')));
                }
                if provider == "dropbox" {
                    if let Some(path) = Key::open(hive, r"Software\Dropbox", view)
                        .and_then(|key| key.string("InstallPath"))
                    {
                        candidates.push(PathBuf::from(&path).join(exe));
                        candidates.push(PathBuf::from(path).join("Client").join(exe));
                    }
                }
            }
        }
        candidates.iter().any(|path| path.is_file())
    }

    pub(super) fn discover() -> Vec<CloudLocation> {
        let account_key = r"Software\Microsoft\OneDrive\Accounts";
        let mut accounts = Vec::new();
        if let Some(key) = Key::open(HKCU, account_key, 0x100) {
            for account in key.children() {
                if let Some(path) = Key::open(HKCU, &format!(r"{account_key}\{account}"), 0x100)
                    .and_then(|key| key.string("UserFolder"))
                {
                    accounts.push((account, PathBuf::from(path)));
                }
            }
        }
        let mut result = onedrive_locations(installed("onedrive"), &accounts);
        let mut registered = Vec::new();
        if let Some(sid) = current_sid() {
            let base = r"Software\Microsoft\Windows\CurrentVersion\Explorer\SyncRootManager";
            if let Some(key) = Key::open(HKLM, base, 0x100) {
                for id in key
                    .children()
                    .into_iter()
                    .filter(|id| id.to_ascii_lowercase().starts_with("dropbox!"))
                {
                    if let Some(path) =
                        Key::open(HKLM, &format!(r"{base}\{id}\UserSyncRoots"), 0x100)
                            .and_then(|key| key.string(&sid))
                    {
                        registered.push(PathBuf::from(path));
                    }
                }
            }
        }
        let info_files: Vec<_> = [
            env_path("APPDATA", r"Dropbox\info.json"),
            env_path("LOCALAPPDATA", r"Dropbox\info.json"),
        ]
        .into_iter()
        .flatten()
        .collect();
        result.extend(dropbox_locations(
            installed("dropbox"),
            &info_files,
            &registered,
        ));
        result
    }
}

pub fn discover() -> Vec<CloudLocation> {
    #[cfg(target_os = "windows")]
    {
        windows::discover()
    }
    #[cfg(not(target_os = "windows"))]
    {
        Vec::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;
    #[test]
    fn dropbox_uninstall_and_reinstall_follow_current_configuration_without_touching_folders() {
        let root = std::env::temp_dir().join(format!("reader-cloud-{}", std::process::id()));
        let old = root.join("Old Dropbox");
        let new = root.join("New Dropbox");
        std::fs::create_dir_all(old.join("User")).unwrap();
        std::fs::create_dir_all(new.join("User")).unwrap();
        let info = root.join("info.json");
        let write = |path: &Path| {
            std::fs::write(
                &info,
                serde_json::json!({"business":{"path":path}}).to_string(),
            )
            .unwrap()
        };
        write(&old.join("User"));
        let config = [info.clone()];
        assert_eq!(
            dropbox_locations(true, &config, std::slice::from_ref(&old))[0].path,
            crate::local_files::display_path(&old)
        );
        assert!(dropbox_locations(false, &config, std::slice::from_ref(&old)).is_empty());
        assert!(old.is_dir()); // uninstall leaves files; an automatic entry must still disappear
        write(&new.join("User"));
        let refreshed = dropbox_locations(true, &config, std::slice::from_ref(&old));
        assert_eq!(
            refreshed[0].path,
            crate::local_files::display_path(&new.join("User"))
        );
        assert_eq!(refreshed[0].id, "dropbox:business");
        std::fs::write(&info, "invalid JSON").unwrap();
        assert!(dropbox_locations(true, &config, &[]).is_empty());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn onedrive_multiple_accounts_ignore_unavailable_and_duplicate_paths() {
        let root = std::env::temp_dir().join(format!("reader-onedrive-{}", std::process::id()));
        std::fs::create_dir_all(root.join("Work")).unwrap();
        let accounts = [
            ("Personal".into(), root.clone()),
            ("Business1".into(), root.join("Work")),
            ("Business2".into(), root.join("missing")),
            ("Duplicate".into(), root.clone()),
        ];
        let value = onedrive_locations(true, &accounts);
        assert_eq!(value.len(), 2);
        assert_eq!(value[0].name, "OneDrive");
        assert_eq!(value[1].id, "onedrive:Business1");
        assert!(onedrive_locations(false, &accounts).is_empty());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn dropbox_uses_latest_config_and_validates_personal_and_work_folders() {
        let root = std::env::temp_dir().join(format!("reader-cloud-config-{}", std::process::id()));
        std::fs::create_dir_all(root.join("Personal")).unwrap();
        std::fs::create_dir_all(root.join("Work")).unwrap();
        let old = root.join("old.json");
        let current = root.join("current.json");
        std::fs::write(
            &old,
            serde_json::json!({"personal":{"path":root}}).to_string(),
        )
        .unwrap();
        std::fs::OpenOptions::new()
            .write(true)
            .open(&old)
            .unwrap()
            .set_times(std::fs::FileTimes::new().set_modified(std::time::UNIX_EPOCH))
            .unwrap();
        std::fs::write(
            &current,
            serde_json::json!({"personal":{"path":root.join("Personal")},
            "business":{"path":root.join("Work")}})
            .to_string(),
        )
        .unwrap();
        assert_eq!(
            dropbox_locations(true, &[old.clone(), current.clone()], &[]).len(),
            2
        );
        std::fs::write(
            &current,
            serde_json::json!({"personal":{"path":"relative"},
            "business":{"path":root.join("missing")}})
            .to_string(),
        )
        .unwrap();
        assert!(dropbox_locations(true, &[old, current], &[]).is_empty());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn current_windows_configuration_returns_only_available_directories() {
        for location in discover() {
            assert!(Path::new(&location.path).is_absolute());
            assert!(Path::new(&location.path).is_dir());
            println!("{}: {}", location.provider, location.path);
        }
    }
}
