//! Static file serving with HTTP Range support for document preview.
//!
//! Registers file paths under opaque UUID tokens so webviews can fetch them
//! via `http://127.0.0.1:{port}/v1/preview/file/{token}` with full
//! Range request support (206 Partial Content).
//!
//! Endpoints:
//!   POST   /v1/preview/register         — register a path, receive token
//!   DELETE /v1/preview/unregister/:token — release a token
//!   GET    /v1/preview/file/:token       — serve file, supports Range

use axum::{
    body::Body,
    extract::{Extension, Path},
    http::{header, HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, RwLock},
};
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio_util::io::ReaderStream;
use uuid::Uuid;

// ── Registry ──────────────────────────────────────────────────────────────────

/// Thread-safe map of opaque tokens → registered file paths.
#[derive(Default)]
pub struct PreviewFileRegistry {
    inner: RwLock<HashMap<String, PathBuf>>,
}

impl PreviewFileRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Register a path and return a fresh UUID token.
    pub fn register(&self, path: PathBuf) -> String {
        let token = Uuid::new_v4().to_string();
        self.inner.write().unwrap().insert(token.clone(), path);
        token
    }

    /// Remove a previously registered token. No-op if unknown.
    pub fn unregister(&self, token: &str) {
        self.inner.write().unwrap().remove(token);
    }

    fn lookup(&self, token: &str) -> Option<PathBuf> {
        self.inner.read().unwrap().get(token).cloned()
    }
}

// ── Wire-types ────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct RegisterRequest {
    #[serde(rename = "filePath")]
    pub file_path: String,
}

#[derive(Serialize)]
pub struct RegisterResponse {
    pub token: String,
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/// POST /v1/preview/register
pub async fn handle_register(
    Extension(registry): Extension<Arc<PreviewFileRegistry>>,
    Json(body): Json<RegisterRequest>,
) -> Json<RegisterResponse> {
    let token = registry.register(PathBuf::from(body.file_path));
    Json(RegisterResponse { token })
}

/// DELETE /v1/preview/unregister/:token
pub async fn handle_unregister(
    Extension(registry): Extension<Arc<PreviewFileRegistry>>,
    Path(token): Path<String>,
) -> StatusCode {
    registry.unregister(&token);
    StatusCode::NO_CONTENT
}

/// GET /v1/preview/file/:token
///
/// Serves the registered file with:
/// - `Accept-Ranges: bytes` on every response
/// - `206 Partial Content` when a valid `Range` header is present
/// - `200 OK` with streaming body otherwise
/// - `Cache-Control: public, max-age=3600` so the browser HTTP cache
///   avoids re-fetching ranges that zip.js / pdfjs already retrieved
pub async fn handle_file(
    Extension(registry): Extension<Arc<PreviewFileRegistry>>,
    Path(token): Path<String>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let Some(path) = registry.lookup(&token) else {
        return (StatusCode::NOT_FOUND, "token not found").into_response();
    };

    let metadata = match tokio::fs::metadata(&path).await {
        Ok(m) => m,
        Err(_) => return (StatusCode::NOT_FOUND, "file not found").into_response(),
    };
    let file_size = metadata.len();
    let mime = mime_for_path(&path);

    if let Some(range_hdr) = headers.get(header::RANGE) {
        // ── Range request → 206 ──────────────────────────────────────────────
        let range_str = match range_hdr.to_str() {
            Ok(s) => s,
            Err(_) => return StatusCode::BAD_REQUEST.into_response(),
        };

        let Some((start, end)) = parse_byte_range(range_str, file_size) else {
            // 416 Range Not Satisfiable
            return (
                StatusCode::RANGE_NOT_SATISFIABLE,
                [(
                    header::CONTENT_RANGE,
                    format!("bytes */{file_size}"),
                )],
                Body::empty(),
            )
                .into_response();
        };

        let length = end - start + 1;

        let mut file: tokio::fs::File = match tokio::fs::File::open(&path).await {
            Ok(f) => f,
            Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
        };

        if file.seek(std::io::SeekFrom::Start(start)).await.is_err() {
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }

        let reader = file.take(length);
        let body = Body::from_stream(ReaderStream::new(reader));

        (
            StatusCode::PARTIAL_CONTENT,
            [
                (header::CONTENT_TYPE, mime),
                (header::ACCEPT_RANGES, "bytes".to_string()),
                (
                    header::CONTENT_RANGE,
                    format!("bytes {start}-{end}/{file_size}"),
                ),
                (header::CONTENT_LENGTH, length.to_string()),
                (
                    header::CACHE_CONTROL,
                    "public, max-age=3600".to_string(),
                ),
            ],
            body,
        )
            .into_response()
    } else {
        // ── Full file → 200 ──────────────────────────────────────────────────
        let file = match tokio::fs::File::open(&path).await {
            Ok(f) => f,
            Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
        };

        let body = Body::from_stream(ReaderStream::new(file));

        (
            StatusCode::OK,
            [
                (header::CONTENT_TYPE, mime),
                (header::ACCEPT_RANGES, "bytes".to_string()),
                (header::CONTENT_LENGTH, file_size.to_string()),
                (
                    header::CACHE_CONTROL,
                    "public, max-age=3600".to_string(),
                ),
            ],
            body,
        )
            .into_response()
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Parse `bytes=start-end` or `bytes=start-` into inclusive (start, end).
/// Returns `None` if the range is syntactically invalid or out of bounds.
fn parse_byte_range(range: &str, file_size: u64) -> Option<(u64, u64)> {
    let suffix = range.strip_prefix("bytes=")?;
    let (start_str, end_str) = suffix.split_once('-')?;
    let start: u64 = start_str.parse().ok()?;
    let end: u64 = if end_str.is_empty() {
        file_size.saturating_sub(1)
    } else {
        end_str.parse::<u64>().ok()?.min(file_size.saturating_sub(1))
    };
    if start > end {
        return None;
    }
    Some((start, end))
}

fn mime_for_path(path: &std::path::Path) -> String {
    match path.extension().and_then(|e| e.to_str()) {
        Some("pdf") => "application/pdf".to_string(),
        Some("epub") => "application/epub+zip".to_string(),
        Some("cbz") | Some("zip") => "application/zip".to_string(),
        Some("html") | Some("htm") => "text/html; charset=utf-8".to_string(),
        Some("xhtml") => "application/xhtml+xml; charset=utf-8".to_string(),
        Some("css") => "text/css; charset=utf-8".to_string(),
        Some("js") => "application/javascript".to_string(),
        Some("xml") | Some("opf") | Some("ncx") => "application/xml; charset=utf-8".to_string(),
        Some("jpg") | Some("jpeg") => "image/jpeg".to_string(),
        Some("png") => "image/png".to_string(),
        Some("gif") => "image/gif".to_string(),
        Some("svg") => "image/svg+xml".to_string(),
        Some("webp") => "image/webp".to_string(),
        Some("ttf") => "font/ttf".to_string(),
        Some("otf") => "font/otf".to_string(),
        Some("woff") => "font/woff".to_string(),
        Some("woff2") => "font/woff2".to_string(),
        _ => "application/octet-stream".to_string(),
    }
}

// ── EPUB on-demand entry serving ─────────────────────────────────────────────

/// GET /v1/preview/epub/:token/*path
///
/// Serves a single entry from the registered EPUB (ZIP) archive.
///
/// epub.js operates in "directory" mode when given a URL with no file
/// extension. Instead of downloading the entire archive (~100 MB) up-front,
/// it fetches only the files it actually needs:
///
///   META-INF/container.xml  → locate OPF
///   OEBPS/content.opf       → parse spine + manifest
///   OEBPS/chapter1.xhtml    → render current chapter
///   OEBPS/style.css         → chapter styles
///   OEBPS/images/cover.jpg  → inline images
///
/// Each entry is served from the ZIP via `spawn_blocking` so the async
/// executor is never blocked by the synchronous zip I/O.
pub async fn handle_epub_entry(
    Extension(registry): Extension<Arc<PreviewFileRegistry>>,
    Path((token, entry_path)): Path<(String, String)>,
) -> impl IntoResponse {
    let Some(epub_path) = registry.lookup(&token) else {
        return (StatusCode::NOT_FOUND, "token not found").into_response();
    };

    // axum 0.7 wildcard captures may include a leading '/' — strip it so the
    // path matches the ZIP entry name (e.g. "META-INF/container.xml").
    let entry_path = entry_path.trim_start_matches('/').to_string();
    let entry_path_for_mime = entry_path.clone();

    let result = tokio::task::spawn_blocking(move || -> Result<Vec<u8>, StatusCode> {
        let file = std::fs::File::open(&epub_path).map_err(|_| StatusCode::NOT_FOUND)?;
        let mut archive = zip::ZipArchive::new(file).map_err(|_| StatusCode::BAD_REQUEST)?;
        let mut entry = archive.by_name(&entry_path).map_err(|_| StatusCode::NOT_FOUND)?;

        let capacity = entry.size() as usize;
        let mut data = Vec::with_capacity(capacity);
        use std::io::Read;
        entry
            .read_to_end(&mut data)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        Ok(data)
    })
    .await;

    match result {
        Ok(Ok(data)) => {
            let mime = mime_for_path(std::path::Path::new(&entry_path_for_mime));
            (
                StatusCode::OK,
                [
                    (header::CONTENT_TYPE, mime),
                    // Short cache — re-read if the file changes (e.g. dev editing)
                    (header::CACHE_CONTROL, "public, max-age=300".to_string()),
                ],
                data,
            )
                .into_response()
        }
        Ok(Err(status)) => status.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}
