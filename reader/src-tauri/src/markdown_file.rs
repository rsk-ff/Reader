//! On-disk format of Markdown documents: keep what the editor cannot see.
//!
//! The editor works on LF text without a BOM. Reading records the file's BOM
//! and line-ending style so a save writes them back, and records a size/mtime
//! stamp so a save can notice that another program changed the file.

use std::path::Path;
use std::time::SystemTime;

/// Error prefix the frontend recognizes to offer "overwrite anyway".
pub const EXTERNAL_CHANGE_ERROR: &str = "EXTERNAL_CHANGE:";

const UTF8_BOM: &[u8] = b"\xEF\xBB\xBF";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DiskStamp {
    len: u64,
    modified: Option<SystemTime>,
}

/// What a Markdown document looked like on disk when Reader last read or
/// wrote it.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct MarkdownDiskState {
    pub stamp: Option<DiskStamp>,
    pub bom: bool,
    pub crlf: bool,
}

pub fn disk_stamp(path: &Path) -> Option<DiskStamp> {
    let metadata = std::fs::metadata(path).ok()?;
    Some(DiskStamp {
        len: metadata.len(),
        modified: metadata.modified().ok(),
    })
}

/// Decode file bytes into editor text (LF, no BOM) plus the format to restore.
pub fn decode_markdown(bytes: Vec<u8>, path: &Path) -> Result<(String, bool, bool), String> {
    let bom = bytes.starts_with(UTF8_BOM);
    let body = if bom {
        bytes[UTF8_BOM.len()..].to_vec()
    } else {
        bytes
    };
    let text = String::from_utf8(body).map_err(|_| {
        format!(
            "“{}”不是 UTF-8 编码（可能是 GBK 等旧编码）。Reader 目前只能打开 UTF-8 的 Markdown，请先用其他编辑器另存为 UTF-8。",
            path.display()
        )
    })?;
    // The first line break decides the file's style.
    let crlf = text
        .find('\n')
        .is_some_and(|index| index > 0 && text.as_bytes()[index - 1] == b'\r');
    Ok((text.replace("\r\n", "\n"), bom, crlf))
}

/// Encode editor text back into the file's original BOM and line endings.
pub fn encode_markdown(content: &str, bom: bool, crlf: bool) -> Vec<u8> {
    let normalized = content.replace("\r\n", "\n");
    let body = if crlf {
        normalized.replace('\n', "\r\n")
    } else {
        normalized
    };
    let mut bytes = Vec::with_capacity(body.len() + UTF8_BOM.len());
    if bom {
        bytes.extend_from_slice(UTF8_BOM);
    }
    bytes.extend_from_slice(body.as_bytes());
    bytes
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_crlf_bom_file_round_trips_through_lf_editor_text() {
        let original = b"\xEF\xBB\xBF# T\r\n\r\n- a\r\n".to_vec();
        let (text, bom, crlf) = decode_markdown(original.clone(), Path::new("a.md")).unwrap();
        assert_eq!(text, "# T\n\n- a\n");
        assert!(bom && crlf);
        assert_eq!(encode_markdown(&text, bom, crlf), original);
    }

    #[test]
    fn an_lf_file_stays_lf_and_gains_no_bom() {
        let (text, bom, crlf) = decode_markdown(b"a\nb".to_vec(), Path::new("a.md")).unwrap();
        assert!(!bom && !crlf);
        assert_eq!(
            encode_markdown(&format!("{text}\nc"), bom, crlf),
            b"a\nb\nc"
        );
    }

    #[test]
    fn a_gbk_file_reports_its_encoding_in_chinese() {
        // "中文" in GBK.
        let error = decode_markdown(vec![0xD6, 0xD0, 0xCE, 0xC4], Path::new("gbk.md")).unwrap_err();
        assert!(error.contains("UTF-8") && error.contains("GBK"));
    }
}
