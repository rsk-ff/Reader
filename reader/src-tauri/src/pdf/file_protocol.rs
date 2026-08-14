//! Custom URI scheme `reader-file://` serving file bytes with HTTP Range support
//! (spec §27 Phase 7: "switch to the asset protocol for true range streaming").
//!
//! Replaces the whole-file `read_file_bytes` IPC path for PDFs: pdf.js calls
//! `fetch(url)` with `Range: bytes=start-end` headers and we serve only the
//! requested byte slice, so opening a 1000-page PDF no longer slurps the entire
//! file into memory before the first page can render.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};

use http::{Response, StatusCode};
use tauri::{UriSchemeContext, UriSchemeResponder};

/// URL-decode a percent-encoded path segment.
fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(h) = u8::from_str_radix(
                std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or(""),
                16,
            ) {
                out.push(h);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Extract the file path from the request URI. The scheme is
/// `reader-file://localhost/<url-encoded-absolute-path>`.
fn path_from_uri(uri: &str) -> Option<String> {
    // Strip scheme + host. Handle both `reader-file://localhost/...` and
    // `http://reader-file.localhost/...` (Windows form).
    let after_scheme = uri
        .strip_prefix("reader-file://")
        .or_else(|| uri.strip_prefix("http://reader-file.localhost"))
        .or_else(|| uri.strip_prefix("https://reader-file.localhost"))?;
    // Skip the host (everything up to the first `/`).
    let path_start = after_scheme.find('/')?;
    let encoded = &after_scheme[path_start + 1..];
    // Drop any query string.
    let encoded = encoded.split('?').next().unwrap_or(encoded);
    let decoded = percent_decode(encoded);
    Some(decoded)
}

/// Parse a `Range: bytes=start-end` header into (start, end_inclusive).
/// `end` may be None (open-ended). Returns None if the header is absent or
/// not a simple byte range.
fn parse_range(header: Option<&str>, total: u64) -> Option<(u64, Option<u64>)> {
    let h = header?;
    let h = h.trim();
    let unit = h.strip_prefix("bytes=")?;
    let mut parts = unit.splitn(2, '-');
    let start_s = parts.next()?.trim();
    let end_s = parts.next().unwrap_or("").trim();
    let start: u64 = start_s.parse().ok()?;
    let end: u64 = if end_s.is_empty() {
        total.saturating_sub(1)
    } else {
        end_s.parse::<u64>().ok()?.min(total.saturating_sub(1))
    };
    Some((start, Some(end)))
}

/// Build the file URL the frontend hands to pdf.js `getDocument({url})`.
/// Windows form: `http://reader-file.localhost/<encoded-path>`.
pub fn file_url(path: &str) -> String {
    let encoded = urlencoding::encode(path);
    format!("http://reader-file.localhost/{encoded}")
}

/// The URI scheme handler. Reads the requested byte range from the file.
/// CORS headers are set because the webview origin (localhost:1420 in dev,
/// tauri://localhost in prod) differs from `reader-file.localhost`.
pub fn handle_reader_file<R: tauri::Runtime>(
    _ctx: UriSchemeContext<'_, R>,
    request: http::Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    // Handle CORS preflight.
    if request.method() == http::Method::OPTIONS {
        let resp = Response::builder()
            .status(StatusCode::NO_CONTENT)
            .header("Access-Control-Allow-Origin", "*")
            .header("Access-Control-Allow-Methods", "GET, OPTIONS")
            .header("Access-Control-Allow-Headers", "range")
            .header("Access-Control-Max-Age", "86400")
            .body(Vec::new())
            .unwrap();
        responder.respond(resp);
        return;
    }
    let uri = request.uri().to_string();
    let path = match path_from_uri(&uri) {
        Some(p) => p,
        None => {
            let resp = Response::builder()
                .status(StatusCode::BAD_REQUEST)
                .body(Vec::new())
                .unwrap();
            responder.respond(resp);
            return;
        }
    };

    let file = match File::open(&path) {
        Ok(f) => f,
        Err(e) => {
            let status = if e.kind() == std::io::ErrorKind::NotFound {
                StatusCode::NOT_FOUND
            } else {
                StatusCode::FORBIDDEN
            };
            let resp = Response::builder()
                .status(status)
                .body(e.to_string().into_bytes())
                .unwrap();
            responder.respond(resp);
            return;
        }
    };

    let total = match file.metadata() {
        Ok(m) => m.len(),
        Err(_) => {
            let resp = Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(Vec::new())
                .unwrap();
            responder.respond(resp);
            return;
        }
    };

    let range_header = request
        .headers()
        .get("range")
        .and_then(|v| v.to_str().ok());

    if let Some((start, end_opt)) = parse_range(range_header, total) {
        if start >= total {
            let resp = Response::builder()
                .status(StatusCode::RANGE_NOT_SATISFIABLE)
                .header("Content-Range", format!("bytes */{total}"))
                .body(Vec::new())
                .unwrap();
            responder.respond(resp);
            return;
        }
        let end = end_opt.unwrap_or_else(|| total.saturating_sub(1));
        let len = (end - start + 1) as usize;
        let mut buf = vec![0u8; len];
        let mut f = file;
        if f.seek(SeekFrom::Start(start)).is_err() {
            let resp = Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(Vec::new())
                .unwrap();
            responder.respond(resp);
            return;
        }
        if f.read_exact(&mut buf).is_err() {
            // partial read: shrink to what we got
            let read_len = f.stream_position().unwrap_or(start) as usize - start as usize;
            buf.truncate(read_len);
        }
        let resp = Response::builder()
            .status(StatusCode::PARTIAL_CONTENT)
            .header("Content-Type", "application/pdf")
            .header("Content-Length", buf.len().to_string())
            .header("Content-Range", format!("bytes {start}-{end}/{total}"))
            .header("Accept-Ranges", "bytes")
            .header("Access-Control-Allow-Origin", "*")
            .header("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length")
            .body(buf)
            .unwrap();
        responder.respond(resp);
    } else {
        // Full file (no Range header) — small files / initial metadata fetch.
        let mut f = file;
        let mut buf = Vec::with_capacity(total.min(1 << 20) as usize);
        if f.read_to_end(&mut buf).is_err() {
            let resp = Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(Vec::new())
                .unwrap();
            responder.respond(resp);
            return;
        }
        let resp = Response::builder()
            .status(StatusCode::OK)
            .header("Content-Type", "application/pdf")
            .header("Content-Length", buf.len().to_string())
            .header("Accept-Ranges", "bytes")
            .header("Access-Control-Allow-Origin", "*")
            .header("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length")
            .body(buf)
            .unwrap();
        responder.respond(resp);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_range_basic() {
        assert_eq!(parse_range(Some("bytes=0-99"), 1000), Some((0, Some(99))));
        assert_eq!(parse_range(Some("bytes=500-"), 1000), Some((500, Some(999))));
        assert_eq!(parse_range(Some("bytes=0-"), 1000), Some((0, Some(999))));
        assert_eq!(parse_range(Some("bytes=990-2000"), 1000), Some((990, Some(999))));
        assert_eq!(parse_range(None, 1000), None);
        assert_eq!(parse_range(Some("items=0-1"), 1000), None);
    }

    #[test]
    fn path_from_uri_forms() {
        assert_eq!(
            path_from_uri("reader-file://localhost/C%3A%2FUsers%2Ffoo.pdf"),
            Some("C:/Users/foo.pdf".to_string())
        );
        assert_eq!(
            path_from_uri("http://reader-file.localhost/D%3A%2Fdocs%2Fa.pdf"),
            Some("D:/docs/a.pdf".to_string())
        );
        // with query string
        assert_eq!(
            path_from_uri("http://reader-file.localhost/x.pdf?foo=bar"),
            Some("x.pdf".to_string())
        );
    }

    #[test]
    fn percent_decode_roundtrip() {
        let path = r"C:SERSAN	EST FILE.PDF";
        let encoded = urlencoding::encode(path);
        assert_eq!(percent_decode(&encoded), path);
    }

    #[test]
    fn file_url_format() {
        let url = file_url("D:/docs/foo.pdf");
        assert!(url.starts_with("http://reader-file.localhost/"), "url={}", url);
        assert!(url.contains("foo.pdf"), "url={}", url);
    }
}
