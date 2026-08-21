//! Range-capable, workspace-scoped PDF byte serving for PDF.js.
//!
//! The WebView cannot hand a native file handle to a PDF.js worker. This
//! protocol exposes only PDF files that are already open in `AppWorkspace` and
//! supports HTTP byte ranges so large documents do not need to cross Tauri IPC
//! as one JSON payload.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use http::{Method, Response, StatusCode};
use tauri::{Manager, UriSchemeContext, UriSchemeResponder};

fn percent_decode(value: &str) -> Result<String, &'static str> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;

    while index < bytes.len() {
        if bytes[index] == b'%' {
            if index + 2 >= bytes.len() {
                return Err("truncated percent escape");
            }
            let high = (bytes[index + 1] as char)
                .to_digit(16)
                .ok_or("invalid percent escape")?;
            let low = (bytes[index + 2] as char)
                .to_digit(16)
                .ok_or("invalid percent escape")?;
            decoded.push(((high << 4) | low) as u8);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }

    String::from_utf8(decoded).map_err(|_| "path is not valid UTF-8")
}

fn requested_path(uri: &http::Uri) -> Result<PathBuf, &'static str> {
    let encoded = uri.path().trim_start_matches('/');
    if encoded.is_empty() {
        return Err("missing PDF path");
    }
    Ok(PathBuf::from(percent_decode(encoded)?))
}

fn canonical_open_pdf<R: tauri::Runtime>(
    ctx: &UriSchemeContext<'_, R>,
    path: &Path,
) -> Result<PathBuf, (StatusCode, String)> {
    if !path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("pdf"))
    {
        return Err((StatusCode::UNSUPPORTED_MEDIA_TYPE, "not a PDF path".into()));
    }

    let canonical = std::fs::canonicalize(path).map_err(|error| {
        (
            StatusCode::NOT_FOUND,
            format!("PDF path is unavailable: {error}"),
        )
    })?;
    let workspace = ctx
        .app_handle()
        .state::<crate::workspace::SharedWorkspace>();
    let source_path = workspace
        .lock()
        .ok()
        .and_then(|guard| guard.pdf_source_path(&canonical));

    source_path.ok_or_else(|| {
        (
            StatusCode::FORBIDDEN,
            "PDF is not open in this workspace".into(),
        )
    })
}

/// Parse one HTTP byte range into inclusive start/end offsets.
fn parse_range(value: Option<&str>, total: u64) -> Result<Option<(u64, u64)>, ()> {
    let Some(value) = value else {
        return Ok(None);
    };
    if total == 0 {
        return Err(());
    }

    let range = value.trim().strip_prefix("bytes=").ok_or(())?;
    if range.contains(',') {
        return Err(());
    }
    let (start, end) = range.split_once('-').ok_or(())?;

    if start.is_empty() {
        let suffix_length = end.parse::<u64>().map_err(|_| ())?;
        if suffix_length == 0 {
            return Err(());
        }
        return Ok(Some((
            total.saturating_sub(suffix_length.min(total)),
            total - 1,
        )));
    }

    let start = start.parse::<u64>().map_err(|_| ())?;
    if start >= total {
        return Err(());
    }
    let end = if end.is_empty() {
        total - 1
    } else {
        end.parse::<u64>().map_err(|_| ())?.min(total - 1)
    };
    if end < start {
        return Err(());
    }
    Ok(Some((start, end)))
}

fn response_builder(status: StatusCode) -> http::response::Builder {
    Response::builder()
        .status(status)
        .header("Access-Control-Allow-Origin", "*")
        .header(
            "Access-Control-Expose-Headers",
            "Accept-Ranges, Content-Length, Content-Range",
        )
        .header("Accept-Ranges", "bytes")
        .header("Cache-Control", "no-store")
        .header("Content-Type", "application/pdf")
        .header("X-Content-Type-Options", "nosniff")
}

fn respond_error(responder: UriSchemeResponder, status: StatusCode, message: String) {
    let response = response_builder(status)
        .body(message.into_bytes())
        .expect("static PDF protocol error response");
    responder.respond(response);
}

pub fn handle_reader_file<R: tauri::Runtime>(
    ctx: UriSchemeContext<'_, R>,
    request: http::Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    if request.method() == Method::OPTIONS {
        let response = Response::builder()
            .status(StatusCode::NO_CONTENT)
            .header("Access-Control-Allow-Origin", "*")
            .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
            .header("Access-Control-Allow-Headers", "Range")
            .header("Access-Control-Max-Age", "86400")
            .body(Vec::new())
            .expect("static CORS response");
        responder.respond(response);
        return;
    }

    if request.method() != Method::GET && request.method() != Method::HEAD {
        respond_error(
            responder,
            StatusCode::METHOD_NOT_ALLOWED,
            "only GET and HEAD are supported".into(),
        );
        return;
    }

    let path = match requested_path(request.uri()) {
        Ok(path) => path,
        Err(error) => {
            respond_error(responder, StatusCode::BAD_REQUEST, error.into());
            return;
        }
    };
    let path = match canonical_open_pdf(&ctx, &path) {
        Ok(path) => path,
        Err((status, error)) => {
            respond_error(responder, status, error);
            return;
        }
    };

    let mut file = match File::open(&path) {
        Ok(file) => file,
        Err(error) => {
            respond_error(
                responder,
                StatusCode::NOT_FOUND,
                format!("open PDF: {error}"),
            );
            return;
        }
    };
    let total = match file.metadata() {
        Ok(metadata) => metadata.len(),
        Err(error) => {
            respond_error(
                responder,
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("read PDF metadata: {error}"),
            );
            return;
        }
    };

    let range = match parse_range(
        request
            .headers()
            .get("range")
            .and_then(|value| value.to_str().ok()),
        total,
    ) {
        Ok(range) => range,
        Err(()) => {
            let response = response_builder(StatusCode::RANGE_NOT_SATISFIABLE)
                .header("Content-Range", format!("bytes */{total}"))
                .body(Vec::new())
                .expect("static unsatisfied range response");
            responder.respond(response);
            return;
        }
    };

    let (status, start, end) = match range {
        Some((start, end)) => (StatusCode::PARTIAL_CONTENT, start, end),
        None if total > 0 => (StatusCode::OK, 0, total - 1),
        None => (StatusCode::OK, 0, 0),
    };
    let expected_length = if total == 0 { 0 } else { end - start + 1 };

    let mut body = Vec::new();
    if request.method() == Method::GET && expected_length > 0 {
        if let Err(error) = file.seek(SeekFrom::Start(start)) {
            respond_error(
                responder,
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("seek PDF: {error}"),
            );
            return;
        }
        let mut limited = file.take(expected_length);
        if let Err(error) = limited.read_to_end(&mut body) {
            respond_error(
                responder,
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("read PDF: {error}"),
            );
            return;
        }
    }

    let mut builder = response_builder(status).header("Content-Length", expected_length);
    if status == StatusCode::PARTIAL_CONTENT {
        builder = builder.header("Content-Range", format!("bytes {start}-{end}/{total}"));
    }
    let response = builder.body(body).expect("PDF byte response");
    responder.respond(response);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_utf8_paths() {
        assert_eq!(
            percent_decode("D%3A%5Cdocs%5C%E6%B5%8B%E8%AF%95.pdf"),
            Ok(r"D:\docs\测试.pdf".into())
        );
        assert!(percent_decode("bad%2").is_err());
        assert!(percent_decode("bad%XZ").is_err());
    }

    #[test]
    fn parses_closed_open_and_suffix_ranges() {
        assert_eq!(parse_range(Some("bytes=0-99"), 1000), Ok(Some((0, 99))));
        assert_eq!(parse_range(Some("bytes=500-"), 1000), Ok(Some((500, 999))));
        assert_eq!(parse_range(Some("bytes=-200"), 1000), Ok(Some((800, 999))));
        assert_eq!(parse_range(None, 1000), Ok(None));
    }

    #[test]
    fn rejects_unsatisfied_or_multiple_ranges() {
        assert!(parse_range(Some("bytes=1000-"), 1000).is_err());
        assert!(parse_range(Some("bytes=5-4"), 1000).is_err());
        assert!(parse_range(Some("bytes=0-1,4-5"), 1000).is_err());
        assert!(parse_range(Some("bytes=-0"), 1000).is_err());
    }

    #[test]
    fn extracts_path_without_query_string() {
        let uri: http::Uri = "http://reader-file.localhost/D%3A%5Cdocs%5Ca.pdf?v=2"
            .parse()
            .unwrap();
        assert_eq!(requested_path(&uri), Ok(PathBuf::from(r"D:\docs\a.pdf")));
    }
}
