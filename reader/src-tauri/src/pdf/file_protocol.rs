//! Range-capable, workspace-scoped PDF byte serving for PDF.js.
//!
//! The WebView cannot hand a native file handle to a PDF.js worker. This
//! protocol exposes only PDF files that are already open in `AppWorkspace` and
//! supports HTTP byte ranges so large documents do not need to cross Tauri IPC
//! as one JSON payload.

use std::fs::File;
use std::path::{Path, PathBuf};
use std::sync::Arc;

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

/// The PDF.js load token carried as `?rev=<token>` in the request URL.
fn requested_view_token(uri: &http::Uri) -> Option<String> {
    uri.query()?
        .split('&')
        .find_map(|pair| pair.strip_prefix("rev="))
        .filter(|token| !token.is_empty())
        .map(str::to_owned)
}

fn open_pdf_view<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    path: &Path,
    token: Option<&str>,
) -> Result<Arc<File>, (StatusCode, String)> {
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
    let workspace = app.state::<crate::workspace::SharedWorkspace>();
    let mut guard = workspace.lock().map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("workspace lock poisoned: {error}"),
        )
    })?;
    match guard.pdf_view_file(&canonical, token) {
        Some(Ok(file)) => Ok(file),
        Some(Err(error)) => Err((StatusCode::NOT_FOUND, format!("open PDF: {error}"))),
        None => Err((
            StatusCode::FORBIDDEN,
            "PDF is not open in this workspace".into(),
        )),
    }
}

/// Read exactly `length` bytes at `offset` without touching a shared cursor,
/// so concurrent range requests can read one pinned handle.
fn read_exact_at(file: &File, offset: u64, length: u64) -> std::io::Result<Vec<u8>> {
    let length = usize::try_from(length)
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "range too large"))?;
    let mut body = vec![0; length];
    let mut filled = 0;
    while filled < length {
        let position = offset + filled as u64;
        #[cfg(windows)]
        let read = std::os::windows::fs::FileExt::seek_read(file, &mut body[filled..], position)?;
        #[cfg(unix)]
        let read = std::os::unix::fs::FileExt::read_at(file, &mut body[filled..], position)?;
        if read == 0 {
            return Err(std::io::ErrorKind::UnexpectedEof.into());
        }
        filled += read;
    }
    Ok(body)
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

fn error_response(status: StatusCode, message: String) -> Response<Vec<u8>> {
    response_builder(status)
        .body(message.into_bytes())
        .expect("static PDF protocol error response")
}

pub fn handle_reader_file<R: tauri::Runtime>(
    ctx: UriSchemeContext<'_, R>,
    request: http::Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    // The protocol callback runs on the UI thread; file and workspace access
    // happens on a blocking worker so large range reads cannot stall the UI.
    let app = ctx.app_handle().clone();
    tauri::async_runtime::spawn_blocking(move || {
        responder.respond(reader_file_response(&app, &request));
    });
}

fn reader_file_response<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    request: &http::Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    if request.method() == Method::OPTIONS {
        return Response::builder()
            .status(StatusCode::NO_CONTENT)
            .header("Access-Control-Allow-Origin", "*")
            .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
            .header("Access-Control-Allow-Headers", "Range")
            .header("Access-Control-Max-Age", "86400")
            .body(Vec::new())
            .expect("static CORS response");
    }

    if request.method() != Method::GET && request.method() != Method::HEAD {
        return error_response(
            StatusCode::METHOD_NOT_ALLOWED,
            "only GET and HEAD are supported".into(),
        );
    }

    let path = match requested_path(request.uri()) {
        Ok(path) => path,
        Err(error) => return error_response(StatusCode::BAD_REQUEST, error.into()),
    };
    let token = requested_view_token(request.uri());
    let file = match open_pdf_view(app, &path, token.as_deref()) {
        Ok(file) => file,
        Err((status, error)) => return error_response(status, error),
    };
    let total = match file.metadata() {
        Ok(metadata) => metadata.len(),
        Err(error) => {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("read PDF metadata: {error}"),
            )
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
            return response_builder(StatusCode::RANGE_NOT_SATISFIABLE)
                .header("Content-Range", format!("bytes */{total}"))
                .body(Vec::new())
                .expect("static unsatisfied range response");
        }
    };

    let (status, start, end) = match range {
        Some((start, end)) => (StatusCode::PARTIAL_CONTENT, start, end),
        None if total > 0 => (StatusCode::OK, 0, total - 1),
        None => (StatusCode::OK, 0, 0),
    };
    let expected_length = if total == 0 { 0 } else { end - start + 1 };

    let body = if request.method() == Method::GET && expected_length > 0 {
        match read_exact_at(&file, start, expected_length) {
            Ok(body) => body,
            Err(error) => {
                return error_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("read PDF: {error}"),
                )
            }
        }
    } else {
        Vec::new()
    };

    let mut builder = response_builder(status).header("Content-Length", expected_length);
    if status == StatusCode::PARTIAL_CONTENT {
        builder = builder.header("Content-Range", format!("bytes {start}-{end}/{total}"));
    }
    builder.body(body).expect("PDF byte response")
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
    fn reads_the_pdf_js_load_token_from_the_query() {
        let uri: http::Uri = "http://reader-file.localhost/a.pdf?rev=k3f9-2"
            .parse()
            .unwrap();
        assert_eq!(requested_view_token(&uri).as_deref(), Some("k3f9-2"));
        let bare: http::Uri = "http://reader-file.localhost/a.pdf".parse().unwrap();
        assert_eq!(requested_view_token(&bare), None);
        let empty: http::Uri = "http://reader-file.localhost/a.pdf?rev=".parse().unwrap();
        assert_eq!(requested_view_token(&empty), None);
    }

    #[test]
    fn a_pinned_handle_keeps_reading_bytes_replaced_by_an_atomic_write() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        let path = std::env::temp_dir().join(format!("reader-pin-{unique}.pdf"));
        std::fs::write(&path, b"%PDF-old-bytes").unwrap();
        let pinned = File::open(&path).unwrap();

        // PDFium saves and explicit saves both replace the file by rename.
        crate::pdf::pdfium::atomic_write(path.to_str().unwrap(), b"%PDF-new-longer-bytes")
            .expect("replace a file that a PDF.js load still holds open");

        assert_eq!(read_exact_at(&pinned, 5, 3).unwrap(), b"old");
        assert_eq!(pinned.metadata().unwrap().len(), 14);
        assert_eq!(std::fs::read(&path).unwrap(), b"%PDF-new-longer-bytes");
        drop(pinned);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn extracts_path_without_query_string() {
        let uri: http::Uri = "http://reader-file.localhost/D%3A%5Cdocs%5Ca.pdf?v=2"
            .parse()
            .unwrap();
        assert_eq!(requested_path(&uri), Ok(PathBuf::from(r"D:\docs\a.pdf")));
    }
}
