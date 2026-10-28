//! `reader-image` protocol: local images referenced by open Markdown files.
//!
//! The webview cannot load `file:` URLs. This protocol serves an image file
//! only when it sits in the folder (or a subfolder) of a Markdown document
//! that is open in the workspace, so a document cannot reach arbitrary files.

use std::path::{Path, PathBuf};

use http::{Method, Response, StatusCode};
use tauri::{Manager, UriSchemeContext, UriSchemeResponder};

use crate::workspace::{AppWorkspace, DocumentType};

const MAX_IMAGE_BYTES: u64 = 64 * 1024 * 1024;

fn image_content_type(path: &Path) -> Option<&'static str> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    Some(match extension.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "avif" => "image/avif",
        "svg" => "image/svg+xml",
        _ => return None,
    })
}

/// Whether `image` (canonical) lies under the folder of an open Markdown file.
fn image_is_reachable(workspace: &AppWorkspace, image: &Path) -> bool {
    workspace.documents.values().any(|document| {
        !document.untitled
            && document.doc_type == DocumentType::Markdown
            && document
                .path
                .parent()
                .is_some_and(|folder| image.starts_with(folder))
    })
}

fn response(status: StatusCode, content_type: &str, body: Vec<u8>) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header("Content-Type", content_type)
        .header("Cache-Control", "no-store")
        .header("X-Content-Type-Options", "nosniff")
        // SVG is shown through <img>, where scripts never run; this keeps it
        // inert even if it is opened directly.
        .header(
            "Content-Security-Policy",
            "default-src 'none'; style-src 'unsafe-inline'",
        )
        .body(body)
        .expect("static image protocol response")
}

fn error(status: StatusCode, message: impl Into<String>) -> Response<Vec<u8>> {
    response(
        status,
        "text/plain; charset=utf-8",
        message.into().into_bytes(),
    )
}

fn requested_image(uri: &http::Uri) -> Result<PathBuf, &'static str> {
    let encoded = uri.path().trim_start_matches('/');
    if encoded.is_empty() {
        return Err("missing image path");
    }
    Ok(PathBuf::from(crate::pdf::file_protocol::percent_decode(
        encoded,
    )?))
}

pub fn handle_reader_image<R: tauri::Runtime>(
    ctx: UriSchemeContext<'_, R>,
    request: http::Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let app = ctx.app_handle().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let workspace = app.state::<crate::workspace::SharedWorkspace>();
        responder.respond(reader_image_response(&workspace, &request));
    });
}

fn reader_image_response(
    workspace: &crate::workspace::SharedWorkspace,
    request: &http::Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    if request.method() != Method::GET {
        return error(StatusCode::METHOD_NOT_ALLOWED, "only GET is supported");
    }
    let path = match requested_image(request.uri()) {
        Ok(path) => path,
        Err(message) => return error(StatusCode::BAD_REQUEST, message),
    };
    let Some(content_type) = image_content_type(&path) else {
        return error(StatusCode::UNSUPPORTED_MEDIA_TYPE, "not an image path");
    };
    let canonical = match std::fs::canonicalize(&path) {
        Ok(canonical) => canonical,
        Err(e) => return error(StatusCode::NOT_FOUND, format!("image is unavailable: {e}")),
    };
    // Recheck the extension after links are resolved.
    if image_content_type(&canonical).is_none() {
        return error(StatusCode::UNSUPPORTED_MEDIA_TYPE, "not an image path");
    }
    let reachable = match workspace.lock() {
        Ok(guard) => image_is_reachable(&guard, &canonical),
        Err(e) => {
            return error(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("workspace lock poisoned: {e}"),
            )
        }
    };
    if !reachable {
        return error(
            StatusCode::FORBIDDEN,
            "image is outside the folders of open Markdown documents",
        );
    }
    match std::fs::metadata(&canonical) {
        Ok(metadata) if !metadata.is_file() => {
            return error(StatusCode::NOT_FOUND, "image is not a file")
        }
        Ok(metadata) if metadata.len() > MAX_IMAGE_BYTES => {
            return error(StatusCode::PAYLOAD_TOO_LARGE, "image is larger than 64 MB")
        }
        Ok(_) => {}
        Err(e) => return error(StatusCode::NOT_FOUND, format!("image is unavailable: {e}")),
    }
    match std::fs::read(&canonical) {
        Ok(bytes) => response(StatusCode::OK, content_type, bytes),
        Err(e) => error(StatusCode::NOT_FOUND, format!("read image: {e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::MAIN_WINDOW;

    fn get(path: &Path) -> http::Request<Vec<u8>> {
        let encoded: String = path
            .to_string_lossy()
            .bytes()
            .map(|byte| format!("%{byte:02X}"))
            .collect();
        http::Request::builder()
            .uri(format!("http://reader-image.localhost/{encoded}"))
            .body(Vec::new())
            .unwrap()
    }

    #[test]
    fn serves_only_images_beside_an_open_markdown_document() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        let root = std::env::temp_dir().join(format!("reader-image-{unique}"));
        let notes = root.join("notes");
        std::fs::create_dir_all(notes.join("img")).unwrap();
        std::fs::write(notes.join("a.md"), "![x](img/p.png)").unwrap();
        std::fs::write(notes.join("img").join("p.png"), b"\x89PNG").unwrap();
        std::fs::write(notes.join("secret.txt"), b"no").unwrap();
        std::fs::write(root.join("outside.png"), b"\x89PNG").unwrap();

        let ws = std::sync::Mutex::new(AppWorkspace::default());
        let image = notes.join("img").join("p.png");
        // Nothing is open yet.
        assert_eq!(
            reader_image_response(&ws, &get(&image)).status(),
            StatusCode::FORBIDDEN
        );

        ws.lock()
            .unwrap()
            .open_document(notes.join("a.md").to_str().unwrap(), &MAIN_WINDOW.into())
            .unwrap();
        let served = reader_image_response(&ws, &get(&image));
        assert_eq!(served.status(), StatusCode::OK);
        assert_eq!(served.headers()["Content-Type"], "image/png");
        assert_eq!(served.body(), b"\x89PNG");

        let parent_escape = notes.join("img").join("..").join("..").join("outside.png");
        assert_eq!(
            reader_image_response(&ws, &get(&parent_escape)).status(),
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            reader_image_response(&ws, &get(&notes.join("secret.txt"))).status(),
            StatusCode::UNSUPPORTED_MEDIA_TYPE
        );
        let _ = std::fs::remove_dir_all(root);
    }
}
