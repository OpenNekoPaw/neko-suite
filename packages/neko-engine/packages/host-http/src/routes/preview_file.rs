//! Static file serving with HTTP Range support for preview surfaces.
//!
//! Registers file paths under opaque UUID tokens so webviews can fetch them
//! via `http://127.0.0.1:{port}/v1/preview/file/{token}` with full
//! Range request support (206 Partial Content).
//!
//! Endpoints:
//!   POST   /v1/preview/register         — register a path, receive token
//!   POST   /v1/preview/assets           — register a source, receive manifest
//!   POST   /v1/preview/assets/:id/variants — request a manifest-linked variant
//!   DELETE /v1/preview/assets/:id       — release a manifest asset
//!   DELETE /v1/preview/unregister/:token — release a token
//!   GET    /v1/preview/file/:token       — serve file, supports Range

use super::preview_asset::{
    cleanup_generated_file, contains_gpano_metadata, default_panorama_view_state,
    generate_initial_proxy, generate_preview_variant, is_exr_path, is_hdr_path,
    manual_projection_metadata, read_sidecar, write_sidecar_update,
};
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
    path::{Path as StdPath, PathBuf},
    sync::{Arc, RwLock},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio_util::io::ReaderStream;
use uuid::Uuid;

const PREVIEW_TOKEN_TTL_SECS: u64 = 60 * 60;
const MAX_PREVIEW_TOKENS: usize = 4096;
const MAX_PREVIEW_ASSETS: usize = 1024;

// ── Registry ──────────────────────────────────────────────────────────────────

/// Thread-safe map of opaque tokens → registered file paths.
pub struct PreviewFileRegistry {
    inner: RwLock<HashMap<String, PreviewTokenRecord>>,
    assets: RwLock<HashMap<String, PreviewAssetRecord>>,
    allowed_roots: Vec<PathBuf>,
}

impl PreviewFileRegistry {
    pub fn new() -> Self {
        let roots = std::env::current_dir().ok().into_iter().collect();
        Self::with_allowed_roots(roots)
    }

    pub fn with_allowed_roots(allowed_roots: Vec<PathBuf>) -> Self {
        let mut canonical_roots: Vec<PathBuf> = allowed_roots
            .into_iter()
            .filter_map(|path| match path.canonicalize() {
                Ok(canonical) => Some(canonical),
                Err(error) => {
                    tracing::warn!(
                        "Ignoring invalid preview allowed root {:?}: {}",
                        path,
                        error
                    );
                    None
                }
            })
            .collect();
        if canonical_roots.is_empty() {
            if let Ok(current_dir) = std::env::current_dir().and_then(|path| path.canonicalize()) {
                canonical_roots.push(current_dir);
            }
        }
        Self {
            inner: RwLock::new(HashMap::new()),
            assets: RwLock::new(HashMap::new()),
            allowed_roots: canonical_roots,
        }
    }

    /// Register a path and return a fresh UUID token.
    pub fn register(&self, path: PathBuf) -> Result<String, StatusCode> {
        let path = self.authorize_source_path(path)?;
        let token = Uuid::new_v4().to_string();
        self.register_token(token, path)
    }

    fn register_token(&self, token: String, path: PathBuf) -> Result<String, StatusCode> {
        let mut guard = self.inner.write().map_err(|error| {
            tracing::error!("PreviewFileRegistry write lock poisoned: {}", error);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
        prune_expired_tokens(&mut guard);
        if guard.len() >= MAX_PREVIEW_TOKENS {
            tracing::warn!("Preview token registry is full");
            return Err(StatusCode::TOO_MANY_REQUESTS);
        }
        guard.insert(
            token.clone(),
            PreviewTokenRecord {
                path,
                expires_at: Some(SystemTime::now() + Duration::from_secs(PREVIEW_TOKEN_TTL_SECS)),
            },
        );
        Ok(token)
    }

    /// Remove a previously registered token. No-op if unknown.
    pub fn unregister(&self, token: &str) -> Result<(), StatusCode> {
        let mut guard = self.inner.write().map_err(|error| {
            tracing::error!("PreviewFileRegistry write lock poisoned: {}", error);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
        guard.remove(token);
        Ok(())
    }

    fn register_asset(
        &self,
        path: PathBuf,
        body: &RegisterPreviewAssetRequest,
    ) -> Result<PreviewAssetRecord, StatusCode> {
        let asset_id = Uuid::new_v4().to_string();
        let path = self.authorize_source_path(path)?;
        let token = self.register_token(asset_id.clone(), path.clone())?;
        let mut manifest = build_preview_manifest(&asset_id, &token, &path, body)?;
        let initial_proxy = generate_initial_proxy(&asset_id, &path, &manifest);
        let mut variant_tokens = Vec::new();
        let mut generated_variant_paths = Vec::new();
        if let Some(generated) = &initial_proxy {
            self.register_token(generated.token.clone(), generated.path.clone())?;
            if matches!(manifest.status, PreviewManifestStatus::RequiresProxy) {
                manifest.source_url = generated.variant.url.clone();
            }
            manifest.variants.push(generated.variant.clone());
            variant_tokens.push(generated.token.clone());
            generated_variant_paths.push(generated.path.clone());
        }
        let record = PreviewAssetRecord {
            path,
            token: token.clone(),
            manifest,
            variant_tokens,
            generated_variant_paths,
        };
        let mut guard = self.assets.write().map_err(|error| {
            tracing::error!("Preview asset registry write lock poisoned: {}", error);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
        if guard.len() >= MAX_PREVIEW_ASSETS {
            drop(guard);
            self.unregister(&token)?;
            for token in &record.variant_tokens {
                self.unregister(&token)?;
            }
            for path in &record.generated_variant_paths {
                cleanup_generated_file(&path);
            }
            return Err(StatusCode::TOO_MANY_REQUESTS);
        }
        guard.insert(asset_id, record.clone());
        Ok(record)
    }

    fn lookup_asset(&self, asset_id: &str) -> Result<Option<PreviewAssetRecord>, StatusCode> {
        let guard = self.assets.read().map_err(|error| {
            tracing::error!("Preview asset registry read lock poisoned: {}", error);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
        Ok(guard.get(asset_id).cloned())
    }

    fn register_asset_variant_token(
        &self,
        asset_id: &str,
        token: String,
        path: PathBuf,
    ) -> Result<(), StatusCode> {
        self.register_token(token.clone(), path)?;
        let mut guard = self.assets.write().map_err(|error| {
            tracing::error!("Preview asset registry write lock poisoned: {}", error);
            let _ = self.unregister(&token);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
        let Some(record) = guard.get_mut(asset_id) else {
            self.unregister(&token)?;
            return Err(StatusCode::NOT_FOUND);
        };
        if record.token == token || record.variant_tokens.iter().any(|item| item == &token) {
            return Ok(());
        }
        record.variant_tokens.push(token);
        Ok(())
    }

    fn register_asset_generated_variant(
        &self,
        asset_id: &str,
        token: String,
        path: PathBuf,
    ) -> Result<(), StatusCode> {
        self.register_token(token.clone(), path.clone())?;
        let mut guard = self.assets.write().map_err(|error| {
            tracing::error!("Preview asset registry write lock poisoned: {}", error);
            let _ = self.unregister(&token);
            cleanup_generated_file(&path);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
        let Some(record) = guard.get_mut(asset_id) else {
            self.unregister(&token)?;
            cleanup_generated_file(&path);
            return Err(StatusCode::NOT_FOUND);
        };
        if record.token == token {
            return Ok(());
        }
        if !record.variant_tokens.iter().any(|item| item == &token) {
            record.variant_tokens.push(token);
        }
        if !record
            .generated_variant_paths
            .iter()
            .any(|item| item == &path)
        {
            record.generated_variant_paths.push(path);
        }
        Ok(())
    }

    fn update_asset_metadata(
        &self,
        asset_id: &str,
        body: &UpdatePreviewAssetMetadataRequest,
    ) -> Result<PreviewManifest, StatusCode> {
        let mut guard = self.assets.write().map_err(|error| {
            tracing::error!("Preview asset registry write lock poisoned: {}", error);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
        let Some(record) = guard.get_mut(asset_id) else {
            return Err(StatusCode::NOT_FOUND);
        };
        write_sidecar_update(
            &record.path,
            body.projection_type.clone(),
            body.default_view_state.clone(),
        )?;
        let existing_variants: Vec<PreviewVariant> = record
            .manifest
            .variants
            .iter()
            .filter(|variant| {
                !matches!(
                    variant.role,
                    PreviewVariantRole::Source | PreviewVariantRole::Unsupported
                )
            })
            .cloned()
            .collect();
        let mut manifest = build_preview_manifest(
            &record.manifest.asset_id,
            &record.token,
            &record.path,
            &RegisterPreviewAssetRequest {
                source: record.path.to_string_lossy().to_string(),
                kind: Some(record.manifest.kind.clone()),
                expected_projection: None,
                explicit_open: None,
            },
        )?;
        if matches!(manifest.status, PreviewManifestStatus::RequiresProxy) {
            manifest.source_url = existing_variants
                .iter()
                .find(|variant| matches!(variant.role, PreviewVariantRole::Proxy))
                .and_then(|variant| variant.url.clone());
        }
        manifest.variants.extend(existing_variants);
        record.manifest = manifest;
        Ok(record.manifest.clone())
    }

    fn unregister_asset(&self, asset_id_or_token: &str) -> Result<(), StatusCode> {
        let record = {
            let mut guard = self.assets.write().map_err(|error| {
                tracing::error!("Preview asset registry write lock poisoned: {}", error);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
            if let Some(record) = guard.remove(asset_id_or_token) {
                Some(record)
            } else {
                let matching_asset_id = guard.iter().find_map(|(asset_id, record)| {
                    if record.token == asset_id_or_token
                        || record
                            .variant_tokens
                            .iter()
                            .any(|token| token == asset_id_or_token)
                    {
                        Some(asset_id.clone())
                    } else {
                        None
                    }
                });
                matching_asset_id.and_then(|asset_id| guard.remove(&asset_id))
            }
        };

        if let Some(record) = record {
            self.unregister(&record.token)?;
            for token in record.variant_tokens {
                self.unregister(&token)?;
            }
            for path in record.generated_variant_paths {
                cleanup_generated_file(&path);
            }
        } else {
            self.unregister(asset_id_or_token)?;
        }
        Ok(())
    }

    fn lookup(&self, token: &str) -> Result<Option<PathBuf>, StatusCode> {
        let mut guard = self.inner.write().map_err(|error| {
            tracing::error!("PreviewFileRegistry write lock poisoned: {}", error);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
        prune_expired_tokens(&mut guard);
        Ok(guard.get(token).map(|record| record.path.clone()))
    }

    fn authorize_source_path(&self, path: PathBuf) -> Result<PathBuf, StatusCode> {
        let canonical = path.canonicalize().map_err(|error| {
            tracing::warn!("Rejected preview path {:?}: {}", path, error);
            StatusCode::NOT_FOUND
        })?;
        if !canonical.is_file() {
            tracing::warn!("Rejected non-file preview path {:?}", canonical);
            return Err(StatusCode::BAD_REQUEST);
        }
        if self.allowed_roots.is_empty()
            || self
                .allowed_roots
                .iter()
                .any(|allowed_root| canonical.starts_with(allowed_root))
        {
            return Ok(canonical);
        }
        tracing::warn!(
            "Rejected preview path outside allowed roots: {:?}",
            canonical
        );
        Err(StatusCode::FORBIDDEN)
    }
}

#[derive(Clone)]
struct PreviewTokenRecord {
    path: PathBuf,
    expires_at: Option<SystemTime>,
}

fn prune_expired_tokens(tokens: &mut HashMap<String, PreviewTokenRecord>) {
    let now = SystemTime::now();
    tokens.retain(|_, record| record.expires_at.is_none_or(|expires_at| expires_at > now));
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

#[derive(Clone)]
struct PreviewAssetRecord {
    path: PathBuf,
    token: String,
    manifest: PreviewManifest,
    variant_tokens: Vec<String>,
    generated_variant_paths: Vec<PathBuf>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterPreviewAssetRequest {
    pub source: String,
    pub kind: Option<PreviewAssetKind>,
    pub expected_projection: Option<PreviewProjectionType>,
    pub explicit_open: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewVariantRequest {
    pub role: PreviewVariantRole,
    pub view_state: Option<PanoramaViewState>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub quality: Option<u8>,
    pub format: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePreviewAssetMetadataRequest {
    pub projection_type: Option<PreviewProjectionType>,
    pub default_view_state: Option<PanoramaViewState>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewManifest {
    pub manifest_version: u8,
    pub asset_id: String,
    pub token: String,
    pub kind: PreviewAssetKind,
    pub status: PreviewManifestStatus,
    pub source_name: String,
    pub source_url: Option<String>,
    pub projection: PreviewProjectionMetadata,
    pub media: PreviewMediaMetadata,
    pub default_view_state: Option<PanoramaViewState>,
    pub variants: Vec<PreviewVariant>,
    pub error: Option<PreviewErrorState>,
    pub created_at: String,
    pub expires_at: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PreviewAssetKind {
    Image,
    Video,
    Audio,
    Document,
    Unknown,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PreviewManifestStatus {
    Ready,
    RequiresProxy,
    StreamRequired,
    Unsupported,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PreviewProjectionType {
    Flat,
    Equirectangular,
    Cubemap,
    Fisheye,
    Unknown,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PreviewProjectionConfidence {
    Explicit,
    Manual,
    TrustedFilename,
    Heuristic,
    None,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PreviewDynamicRange {
    Sdr,
    Hdr,
    Unknown,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PreviewVariantRole {
    Source,
    Proxy,
    Thumbnail,
    FovCrop,
    Tile,
    Stream,
    Screenshot,
    Unsupported,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PreviewToneMapping {
    None,
    Aces,
    Reinhard,
    Filmic,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PanoramaViewMode {
    Sphere,
    Flat,
    LittlePlanet,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewDimensions {
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewProjectionMetadata {
    #[serde(rename = "type")]
    pub projection_type: PreviewProjectionType,
    pub confidence: PreviewProjectionConfidence,
    pub source: String,
    pub requires_confirmation: Option<bool>,
    pub cropped_area_pixels: Option<PreviewDimensions>,
    pub full_pano_pixels: Option<PreviewDimensions>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewCodecMetadata {
    pub container: Option<String>,
    pub image_format: Option<String>,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub pixel_format: Option<String>,
    pub color_space: Option<String>,
    pub duration_secs: Option<f64>,
    pub fps: Option<f64>,
    pub has_audio: Option<bool>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewMediaMetadata {
    pub dimensions: Option<PreviewDimensions>,
    pub file_size_bytes: u64,
    pub mime_type: String,
    pub dynamic_range: PreviewDynamicRange,
    pub bit_depth: Option<u8>,
    pub codec: Option<PreviewCodecMetadata>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewErrorState {
    pub code: String,
    pub message: String,
    pub recoverable: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PanoramaViewState {
    pub mode: PanoramaViewMode,
    pub yaw_deg: f64,
    pub pitch_deg: f64,
    pub roll_deg: f64,
    pub fov_deg: f64,
    pub exposure: f64,
    pub tone_mapping: PreviewToneMapping,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewVariant {
    pub id: String,
    pub asset_id: String,
    pub role: PreviewVariantRole,
    pub url: Option<String>,
    pub token: Option<String>,
    pub mime_type: Option<String>,
    pub dimensions: Option<PreviewDimensions>,
    pub file_size_bytes: Option<u64>,
    pub tile_template: Option<serde_json::Value>,
    pub stream: Option<serde_json::Value>,
    pub view_state: Option<PanoramaViewState>,
    pub error: Option<PreviewErrorState>,
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/// POST /v1/preview/register
pub async fn handle_register(
    Extension(registry): Extension<Arc<PreviewFileRegistry>>,
    Json(body): Json<RegisterRequest>,
) -> impl IntoResponse {
    let result =
        tokio::task::spawn_blocking(move || registry.register(PathBuf::from(body.file_path))).await;
    match result {
        Ok(Ok(token)) => Json(RegisterResponse { token }).into_response(),
        Ok(Err(status)) => status.into_response(),
        Err(error) => {
            tracing::error!("Preview register task failed: {}", error);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

/// DELETE /v1/preview/unregister/:token
pub async fn handle_unregister(
    Extension(registry): Extension<Arc<PreviewFileRegistry>>,
    Path(token): Path<String>,
) -> impl IntoResponse {
    match registry.unregister(&token) {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(status) => status.into_response(),
    }
}

/// POST /v1/preview/assets
pub async fn handle_register_asset(
    Extension(registry): Extension<Arc<PreviewFileRegistry>>,
    Json(body): Json<RegisterPreviewAssetRequest>,
) -> impl IntoResponse {
    let path = PathBuf::from(&body.source);
    let result = tokio::task::spawn_blocking(move || registry.register_asset(path, &body)).await;
    match result {
        Ok(Ok(record)) => Json(record.manifest).into_response(),
        Ok(Err(status)) => status.into_response(),
        Err(error) => {
            tracing::error!("Preview asset register task failed: {}", error);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

/// POST /v1/preview/assets/:asset_id/variants
pub async fn handle_request_variant(
    Extension(registry): Extension<Arc<PreviewFileRegistry>>,
    Path(asset_id): Path<String>,
    Json(body): Json<PreviewVariantRequest>,
) -> impl IntoResponse {
    let result = tokio::task::spawn_blocking(move || {
        let Some(record) = registry.lookup_asset(&asset_id)? else {
            return Err(StatusCode::NOT_FOUND);
        };

        let build_result = build_preview_variant(&record, &body)?;
        if let Some((token, path)) = build_result.token_registration.clone() {
            registry.register_asset_generated_variant(&asset_id, token, path)?;
        }
        Ok(build_result.variant)
    })
    .await;
    match result {
        Ok(Ok(variant)) => Json(variant).into_response(),
        Ok(Err(StatusCode::NOT_FOUND)) => {
            (StatusCode::NOT_FOUND, "asset not found").into_response()
        }
        Ok(Err(status)) => status.into_response(),
        Err(error) => {
            tracing::error!("Preview variant task failed: {}", error);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

/// PUT /v1/preview/assets/:asset_id/metadata
pub async fn handle_update_asset_metadata(
    Extension(registry): Extension<Arc<PreviewFileRegistry>>,
    Path(asset_id): Path<String>,
    Json(body): Json<UpdatePreviewAssetMetadataRequest>,
) -> impl IntoResponse {
    let result =
        tokio::task::spawn_blocking(move || registry.update_asset_metadata(&asset_id, &body)).await;
    match result {
        Ok(Ok(manifest)) => Json(manifest).into_response(),
        Ok(Err(status)) => status.into_response(),
        Err(error) => {
            tracing::error!("Preview metadata update task failed: {}", error);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

/// DELETE /v1/preview/assets/:asset_id_or_token
pub async fn handle_unregister_asset(
    Extension(registry): Extension<Arc<PreviewFileRegistry>>,
    Path(asset_id_or_token): Path<String>,
) -> impl IntoResponse {
    let result =
        tokio::task::spawn_blocking(move || registry.unregister_asset(&asset_id_or_token)).await;
    match result {
        Ok(Ok(())) => StatusCode::NO_CONTENT.into_response(),
        Ok(Err(status)) => status.into_response(),
        Err(error) => {
            tracing::error!("Preview asset unregister task failed: {}", error);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
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
    let Some(path) = (match registry.lookup(&token) {
        Ok(path) => path,
        Err(status) => return status.into_response(),
    }) else {
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
                [(header::CONTENT_RANGE, format!("bytes */{file_size}"))],
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
                (header::CACHE_CONTROL, "public, max-age=3600".to_string()),
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
                (header::CACHE_CONTROL, "public, max-age=3600".to_string()),
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
        end_str
            .parse::<u64>()
            .ok()?
            .min(file_size.saturating_sub(1))
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
        Some("hdr") => "image/vnd.radiance".to_string(),
        Some("exr") => "image/x-exr".to_string(),
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

fn build_preview_manifest(
    asset_id: &str,
    token: &str,
    path: &StdPath,
    request: &RegisterPreviewAssetRequest,
) -> Result<PreviewManifest, StatusCode> {
    let metadata = std::fs::metadata(path).map_err(|_| StatusCode::NOT_FOUND)?;
    let file_size = metadata.len();
    let mime_type = mime_for_path(path);
    let kind = request
        .kind
        .clone()
        .unwrap_or_else(|| infer_asset_kind(path, &mime_type));
    let source_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("preview-asset")
        .to_string();
    let projection = probe_projection(path, request);
    let dimensions = probe_dimensions(path);
    let dynamic_range = infer_dynamic_range(path);
    let status = preview_manifest_status(path, &kind, &dynamic_range, file_size);
    let error = manifest_error(path, &status, &dynamic_range);
    let source_url = if matches!(status, PreviewManifestStatus::Ready) {
        Some(preview_file_url(token))
    } else {
        None
    };
    let source_variant = PreviewVariant {
        id: format!("{asset_id}:source"),
        asset_id: asset_id.to_string(),
        role: if matches!(status, PreviewManifestStatus::Unsupported) {
            PreviewVariantRole::Unsupported
        } else {
            PreviewVariantRole::Source
        },
        url: source_url.clone(),
        token: Some(token.to_string()),
        mime_type: Some(mime_type.clone()),
        dimensions: dimensions.clone(),
        file_size_bytes: Some(file_size),
        tile_template: None,
        stream: None,
        view_state: None,
        error: error.clone(),
    };

    Ok(PreviewManifest {
        manifest_version: 1,
        asset_id: asset_id.to_string(),
        token: token.to_string(),
        kind,
        status,
        source_name,
        source_url,
        projection,
        media: PreviewMediaMetadata {
            dimensions,
            file_size_bytes: file_size,
            mime_type,
            dynamic_range,
            bit_depth: None,
            codec: Some(PreviewCodecMetadata {
                container: path
                    .extension()
                    .and_then(|extension| extension.to_str())
                    .map(|extension| extension.to_ascii_lowercase()),
                image_format: image_format_for_path(path),
                video_codec: None,
                audio_codec: None,
                pixel_format: None,
                color_space: None,
                duration_secs: None,
                fps: None,
                has_audio: None,
            }),
        },
        default_view_state: read_sidecar(path)
            .and_then(|sidecar| sidecar.default_view_state)
            .or_else(|| Some(default_panorama_view_state())),
        variants: vec![source_variant],
        error,
        created_at: unix_timestamp_string(),
        expires_at: None,
    })
}

struct PreviewVariantBuildResult {
    variant: PreviewVariant,
    token_registration: Option<(String, PathBuf)>,
}

fn build_preview_variant(
    record: &PreviewAssetRecord,
    request: &PreviewVariantRequest,
) -> Result<PreviewVariantBuildResult, StatusCode> {
    if matches!(request.role, PreviewVariantRole::Source) {
        let variant = record
            .manifest
            .variants
            .iter()
            .find(|variant| matches!(variant.role, PreviewVariantRole::Source))
            .cloned()
            .unwrap_or_else(|| PreviewVariant {
                id: format!("{}:source", record.manifest.asset_id),
                asset_id: record.manifest.asset_id.clone(),
                role: PreviewVariantRole::Source,
                url: record.manifest.source_url.clone(),
                token: Some(record.token.clone()),
                mime_type: Some(record.manifest.media.mime_type.clone()),
                dimensions: record.manifest.media.dimensions.clone(),
                file_size_bytes: Some(record.manifest.media.file_size_bytes),
                tile_template: None,
                stream: None,
                view_state: None,
                error: record.manifest.error.clone(),
            });
        return Ok(PreviewVariantBuildResult {
            variant,
            token_registration: None,
        });
    }

    let generated = generate_preview_variant(
        &record.manifest.asset_id,
        &record.path,
        &record.manifest,
        request,
    )?;
    let token_registration = generated
        .variant
        .token
        .as_ref()
        .map(|token| (token.clone(), generated.path.clone()));

    Ok(PreviewVariantBuildResult {
        variant: generated.variant,
        token_registration,
    })
}

fn infer_asset_kind(path: &StdPath, mime_type: &str) -> PreviewAssetKind {
    if mime_type.starts_with("image/") {
        return PreviewAssetKind::Image;
    }
    if mime_type.starts_with("video/") {
        return PreviewAssetKind::Video;
    }

    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
        .as_deref()
    {
        Some("hdr") | Some("exr") | Some("jpg") | Some("jpeg") | Some("png") | Some("webp") => {
            PreviewAssetKind::Image
        }
        Some("mp4") | Some("mov") | Some("mkv") | Some("webm") | Some("m4v") => {
            PreviewAssetKind::Video
        }
        Some("pdf") | Some("epub") | Some("cbz") | Some("docx") => PreviewAssetKind::Document,
        _ => PreviewAssetKind::Unknown,
    }
}

fn probe_projection(
    path: &StdPath,
    request: &RegisterPreviewAssetRequest,
) -> PreviewProjectionMetadata {
    if let Some((projection_type, confidence, source)) = read_sidecar(path)
        .and_then(|sidecar| sidecar.projection_type)
        .map(manual_projection_metadata)
    {
        return PreviewProjectionMetadata {
            projection_type,
            confidence,
            source,
            requires_confirmation: Some(false),
            cropped_area_pixels: None,
            full_pano_pixels: probe_dimensions(path),
        };
    }

    if let Some(expected) = &request.expected_projection {
        return PreviewProjectionMetadata {
            projection_type: expected.clone(),
            confidence: PreviewProjectionConfidence::Explicit,
            source: "manual".to_string(),
            requires_confirmation: Some(false),
            cropped_area_pixels: None,
            full_pano_pixels: None,
        };
    }

    let dimensions = probe_dimensions(path);
    if contains_gpano_metadata(path) {
        return PreviewProjectionMetadata {
            projection_type: PreviewProjectionType::Equirectangular,
            confidence: PreviewProjectionConfidence::Explicit,
            source: "metadata".to_string(),
            requires_confirmation: Some(false),
            cropped_area_pixels: None,
            full_pano_pixels: dimensions,
        };
    }

    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase());
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if matches!(extension.as_deref(), Some("hdr") | Some("exr"))
        || file_name.contains("_360")
        || file_name.contains("_pano")
        || file_name.contains("_equirect")
    {
        return PreviewProjectionMetadata {
            projection_type: PreviewProjectionType::Equirectangular,
            confidence: PreviewProjectionConfidence::TrustedFilename,
            source: "filename".to_string(),
            requires_confirmation: Some(false),
            cropped_area_pixels: None,
            full_pano_pixels: dimensions,
        };
    }

    if let Some(dimensions) = dimensions {
        if is_near_equirectangular_aspect(dimensions.width, dimensions.height) {
            return PreviewProjectionMetadata {
                projection_type: PreviewProjectionType::Equirectangular,
                confidence: PreviewProjectionConfidence::Heuristic,
                source: "aspect-ratio".to_string(),
                requires_confirmation: Some(!request.explicit_open.unwrap_or(false)),
                cropped_area_pixels: None,
                full_pano_pixels: Some(dimensions),
            };
        }
    }

    PreviewProjectionMetadata {
        projection_type: PreviewProjectionType::Flat,
        confidence: PreviewProjectionConfidence::None,
        source: "unknown".to_string(),
        requires_confirmation: Some(false),
        cropped_area_pixels: None,
        full_pano_pixels: None,
    }
}

fn probe_dimensions(path: &StdPath) -> Option<PreviewDimensions> {
    image::image_dimensions(path)
        .ok()
        .map(|(width, height)| PreviewDimensions { width, height })
}

fn is_near_equirectangular_aspect(width: u32, height: u32) -> bool {
    if height == 0 {
        return false;
    }
    let ratio = width as f64 / height as f64;
    (ratio - 2.0).abs() <= 0.02
}

fn infer_dynamic_range(path: &StdPath) -> PreviewDynamicRange {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
        .as_deref()
    {
        Some("hdr") | Some("exr") => PreviewDynamicRange::Hdr,
        Some("jpg") | Some("jpeg") | Some("png") | Some("webp") | Some("gif") => {
            PreviewDynamicRange::Sdr
        }
        _ => PreviewDynamicRange::Unknown,
    }
}

fn preview_manifest_status(
    path: &StdPath,
    kind: &PreviewAssetKind,
    _dynamic_range: &PreviewDynamicRange,
    file_size: u64,
) -> PreviewManifestStatus {
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase());
    if matches!(extension.as_deref(), Some("exr")) {
        return PreviewManifestStatus::Unsupported;
    }
    if is_hdr_path(path) {
        return PreviewManifestStatus::RequiresProxy;
    }
    if matches!(kind, PreviewAssetKind::Video) {
        return PreviewManifestStatus::StreamRequired;
    }
    const LARGE_IMAGE_PROXY_THRESHOLD_BYTES: u64 = 64 * 1024 * 1024;
    if matches!(kind, PreviewAssetKind::Image) && file_size > LARGE_IMAGE_PROXY_THRESHOLD_BYTES {
        return PreviewManifestStatus::RequiresProxy;
    }
    PreviewManifestStatus::Ready
}

fn manifest_error(
    path: &StdPath,
    status: &PreviewManifestStatus,
    _dynamic_range: &PreviewDynamicRange,
) -> Option<PreviewErrorState> {
    if !matches!(status, PreviewManifestStatus::Unsupported) {
        return None;
    }
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("unknown");
    let message = if is_exr_path(path) {
        format!("EXR preview requires a decoder that is not available for .{extension}")
    } else {
        format!("Unsupported preview format .{extension}")
    };
    Some(PreviewErrorState {
        code: "unsupported-format".to_string(),
        message,
        recoverable: true,
    })
}

fn image_format_for_path(path: &StdPath) -> Option<String> {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
        .as_deref()
    {
        Some("jpg") | Some("jpeg") => Some("jpeg".to_string()),
        Some("png") => Some("png".to_string()),
        Some("webp") => Some("webp".to_string()),
        Some("gif") => Some("gif".to_string()),
        Some("hdr") => Some("hdr".to_string()),
        Some("exr") => Some("exr".to_string()),
        _ => None,
    }
}

fn preview_file_url(token: &str) -> String {
    format!("/v1/preview/file/{token}")
}

fn unix_timestamp_string() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    seconds.to_string()
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
    let Some(epub_path) = (match registry.lookup(&token) {
        Ok(path) => path,
        Err(status) => return status.into_response(),
    }) else {
        return (StatusCode::NOT_FOUND, "token not found").into_response();
    };

    // axum 0.7 wildcard captures may include a leading '/' — strip it so the
    // path matches the ZIP entry name (e.g. "META-INF/container.xml").
    let entry_path = entry_path.trim_start_matches('/').to_string();
    let entry_path_for_mime = entry_path.clone();

    let result = tokio::task::spawn_blocking(move || -> Result<Vec<u8>, StatusCode> {
        let file = std::fs::File::open(&epub_path).map_err(|e| {
            tracing::error!("EPUB: cannot open file {:?}: {}", epub_path, e);
            StatusCode::NOT_FOUND
        })?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| {
            tracing::error!("EPUB: cannot read ZIP archive: {}", e);
            StatusCode::BAD_REQUEST
        })?;
        let mut entry = archive.by_name(&entry_path).map_err(|e| {
            tracing::error!("EPUB: entry '{}' not found in archive: {}", entry_path, e);
            StatusCode::NOT_FOUND
        })?;

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

#[cfg(test)]
mod tests {
    use super::*;
    use image::{codecs::hdr::HdrEncoder, ImageBuffer, Rgb};
    use std::fs::File;
    use tempfile::tempdir;

    #[test]
    fn test_parse_byte_range_accepts_open_ended_range() {
        assert_eq!(parse_byte_range("bytes=10-", 100), Some((10, 99)));
    }

    #[test]
    fn test_parse_byte_range_rejects_invalid_bounds() {
        assert_eq!(parse_byte_range("bytes=20-10", 100), None);
        assert_eq!(parse_byte_range("bytes=a-b", 100), None);
    }

    #[test]
    fn test_preview_file_registry_register_lookup_unregister() {
        let dir = tempdir().expect("tempdir");
        let file_path = dir.path().join("preview.pdf");
        std::fs::write(&file_path, b"%PDF").expect("write preview");
        let registry = PreviewFileRegistry::with_allowed_roots(vec![dir.path().to_path_buf()]);

        let token = registry
            .register(file_path.clone())
            .expect("register token");
        assert_eq!(
            registry.lookup(&token).expect("lookup token"),
            Some(file_path.canonicalize().expect("canonical file"))
        );

        registry.unregister(&token).expect("unregister token");
        assert_eq!(registry.lookup(&token).expect("lookup removed token"), None);
    }

    #[test]
    fn test_preview_file_registry_rejects_path_outside_allowed_roots() {
        let allowed = tempdir().expect("allowed tempdir");
        let outside = tempdir().expect("outside tempdir");
        let outside_file = outside.path().join("secret.txt");
        std::fs::write(&outside_file, b"secret").expect("write outside file");

        let registry = PreviewFileRegistry::with_allowed_roots(vec![allowed.path().to_path_buf()]);

        assert_eq!(
            registry
                .register(outside_file)
                .expect_err("outside root rejected"),
            StatusCode::FORBIDDEN
        );
    }

    #[test]
    fn test_preview_asset_manifest_registers_range_url_and_projection_metadata() {
        let dir = tempdir().expect("tempdir");
        let image_path = dir.path().join("studio_360.jpg");
        let image: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::from_pixel(4, 2, Rgb([20, 40, 60]));
        image.save(&image_path).expect("save image");

        let registry = PreviewFileRegistry::with_allowed_roots(vec![dir.path().to_path_buf()]);
        let record = registry
            .register_asset(
                image_path.clone(),
                &RegisterPreviewAssetRequest {
                    source: image_path.to_string_lossy().to_string(),
                    kind: Some(PreviewAssetKind::Image),
                    expected_projection: None,
                    explicit_open: None,
                },
            )
            .expect("register asset");

        assert_eq!(record.manifest.kind, PreviewAssetKind::Image);
        assert_eq!(record.manifest.status, PreviewManifestStatus::Ready);
        assert_eq!(
            record.manifest.projection.projection_type,
            PreviewProjectionType::Equirectangular
        );
        assert_eq!(
            record.manifest.projection.confidence,
            PreviewProjectionConfidence::TrustedFilename
        );
        assert_eq!(
            record
                .manifest
                .media
                .dimensions
                .as_ref()
                .map(|d| (d.width, d.height)),
            Some((4, 2))
        );
        assert_eq!(
            record.manifest.source_url.as_deref(),
            Some(preview_file_url(&record.token).as_str())
        );
        assert_eq!(
            registry.lookup(&record.token).expect("lookup token"),
            Some(image_path.canonicalize().expect("canonical image"))
        );
    }

    #[test]
    fn test_preview_asset_heuristic_projection_requires_confirmation() {
        let dir = tempdir().expect("tempdir");
        let image_path = dir.path().join("ordinary-wide.png");
        let image: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::from_pixel(8, 4, Rgb([10, 10, 10]));
        image.save(&image_path).expect("save image");

        let manifest = build_preview_manifest(
            "asset",
            "token",
            &image_path,
            &RegisterPreviewAssetRequest {
                source: image_path.to_string_lossy().to_string(),
                kind: Some(PreviewAssetKind::Image),
                expected_projection: None,
                explicit_open: Some(false),
            },
        )
        .expect("manifest");

        assert_eq!(
            manifest.projection.projection_type,
            PreviewProjectionType::Equirectangular
        );
        assert_eq!(
            manifest.projection.confidence,
            PreviewProjectionConfidence::Heuristic
        );
        assert_eq!(manifest.projection.requires_confirmation, Some(true));
    }

    #[test]
    fn test_preview_asset_manual_sidecar_projection_takes_priority() {
        let dir = tempdir().expect("tempdir");
        let image_path = dir.path().join("ordinary-wide.png");
        let image: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::from_pixel(8, 4, Rgb([10, 10, 10]));
        image.save(&image_path).expect("save image");
        write_sidecar_update(
            &image_path,
            Some(PreviewProjectionType::Flat),
            Some(PanoramaViewState {
                yaw_deg: 42.0,
                ..default_panorama_view_state()
            }),
        )
        .expect("write sidecar");

        let manifest = build_preview_manifest(
            "asset",
            "token",
            &image_path,
            &RegisterPreviewAssetRequest {
                source: image_path.to_string_lossy().to_string(),
                kind: Some(PreviewAssetKind::Image),
                expected_projection: None,
                explicit_open: Some(false),
            },
        )
        .expect("manifest");

        assert_eq!(
            manifest.projection.projection_type,
            PreviewProjectionType::Flat
        );
        assert_eq!(
            manifest.projection.confidence,
            PreviewProjectionConfidence::Manual
        );
        assert_eq!(manifest.projection.requires_confirmation, Some(false));
        assert_eq!(
            manifest
                .default_view_state
                .as_ref()
                .map(|state| state.yaw_deg),
            Some(42.0)
        );
    }

    #[test]
    fn test_preview_asset_gpano_metadata_is_explicit() {
        let dir = tempdir().expect("tempdir");
        let image_path = dir.path().join("ordinary.jpg");
        std::fs::write(
            &image_path,
            b"<x:xmpmeta><GPano:ProjectionType>equirectangular</GPano:ProjectionType><GPano:FullPanoWidthPixels>4000</GPano:FullPanoWidthPixels></x:xmpmeta>",
        )
        .expect("write metadata marker");

        let manifest = build_preview_manifest(
            "asset",
            "token",
            &image_path,
            &RegisterPreviewAssetRequest {
                source: image_path.to_string_lossy().to_string(),
                kind: Some(PreviewAssetKind::Image),
                expected_projection: None,
                explicit_open: None,
            },
        )
        .expect("manifest");

        assert_eq!(
            manifest.projection.projection_type,
            PreviewProjectionType::Equirectangular
        );
        assert_eq!(
            manifest.projection.confidence,
            PreviewProjectionConfidence::Explicit
        );
        assert_eq!(manifest.projection.source, "metadata");
    }

    #[test]
    fn test_preview_asset_hdr_proxy_and_exr_typed_unsupported_state() {
        let dir = tempdir().expect("tempdir");
        let hdr_path = dir.path().join("studio.hdr");
        write_test_hdr(&hdr_path);
        let exr_path = dir.path().join("studio.exr");
        std::fs::write(&exr_path, b"v/1\x01").expect("write exr");

        let registry = PreviewFileRegistry::with_allowed_roots(vec![dir.path().to_path_buf()]);
        let hdr_record = registry
            .register_asset(
                hdr_path.clone(),
                &RegisterPreviewAssetRequest {
                    source: hdr_path.to_string_lossy().to_string(),
                    kind: Some(PreviewAssetKind::Image),
                    expected_projection: None,
                    explicit_open: None,
                },
            )
            .expect("register hdr asset");
        assert_eq!(
            hdr_record.manifest.status,
            PreviewManifestStatus::RequiresProxy
        );
        assert_eq!(
            hdr_record.manifest.media.dynamic_range,
            PreviewDynamicRange::Hdr
        );
        assert!(hdr_record.manifest.error.is_none());
        let proxy = hdr_record
            .manifest
            .variants
            .iter()
            .find(|variant| matches!(variant.role, PreviewVariantRole::Proxy))
            .expect("hdr proxy variant");
        assert_eq!(proxy.mime_type.as_deref(), Some("image/jpeg"));
        assert_eq!(hdr_record.manifest.source_url, proxy.url);

        let exr_manifest = build_preview_manifest(
            "asset",
            "token",
            &exr_path,
            &RegisterPreviewAssetRequest {
                source: exr_path.to_string_lossy().to_string(),
                kind: Some(PreviewAssetKind::Image),
                expected_projection: None,
                explicit_open: None,
            },
        )
        .expect("exr manifest");
        assert_eq!(exr_manifest.status, PreviewManifestStatus::Unsupported);
        assert_eq!(exr_manifest.media.dynamic_range, PreviewDynamicRange::Hdr);
        assert_eq!(
            exr_manifest.error.as_ref().map(|error| error.code.as_str()),
            Some("unsupported-format")
        );
    }

    #[test]
    fn test_preview_asset_unregister_cleans_source_token() {
        let dir = tempdir().expect("tempdir");
        let image_path = dir.path().join("preview.jpg");
        let image: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::from_pixel(2, 2, Rgb([0, 0, 0]));
        image.save(&image_path).expect("save image");

        let registry = PreviewFileRegistry::with_allowed_roots(vec![dir.path().to_path_buf()]);
        let record = registry
            .register_asset(
                image_path,
                &RegisterPreviewAssetRequest {
                    source: "preview.jpg".to_string(),
                    kind: Some(PreviewAssetKind::Image),
                    expected_projection: None,
                    explicit_open: None,
                },
            )
            .expect("register asset");

        registry
            .unregister_asset(&record.manifest.asset_id)
            .expect("unregister asset");
        assert_eq!(
            registry.lookup(&record.token).expect("lookup removed"),
            None
        );
        assert!(registry
            .lookup_asset(&record.manifest.asset_id)
            .expect("lookup asset")
            .is_none());
    }

    #[test]
    fn test_preview_variant_generates_file_token_and_view_state() {
        let dir = tempdir().expect("tempdir");
        let image_path = dir.path().join("preview.jpg");
        let image: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::from_pixel(2, 2, Rgb([0, 0, 0]));
        image.save(&image_path).expect("save image");
        let registry = PreviewFileRegistry::with_allowed_roots(vec![dir.path().to_path_buf()]);
        let record = registry
            .register_asset(
                image_path,
                &RegisterPreviewAssetRequest {
                    source: "preview.jpg".to_string(),
                    kind: Some(PreviewAssetKind::Image),
                    expected_projection: None,
                    explicit_open: None,
                },
            )
            .expect("register asset");
        let view_state = default_panorama_view_state();

        let build_result = build_preview_variant(
            &record,
            &PreviewVariantRequest {
                role: PreviewVariantRole::FovCrop,
                view_state: Some(view_state),
                width: Some(320),
                height: Some(180),
                quality: Some(80),
                format: Some("jpeg".to_string()),
            },
        )
        .expect("build variant");
        let variant = build_result.variant;

        assert_eq!(variant.asset_id, record.manifest.asset_id);
        assert_ne!(variant.token.as_deref(), Some(record.token.as_str()));
        assert!(variant
            .url
            .as_deref()
            .unwrap_or_default()
            .starts_with("/v1/preview/file/"));
        assert_eq!(variant.mime_type.as_deref(), Some("image/jpeg"));
        assert_eq!(
            variant.dimensions.as_ref().map(|d| (d.width, d.height)),
            Some((320, 180))
        );
        assert_eq!(
            variant.view_state.as_ref().map(|state| state.fov_deg),
            Some(75.0)
        );
        let (token, path) = build_result
            .token_registration
            .expect("variant token registration");
        assert_eq!(variant.token.as_deref(), Some(token.as_str()));
        assert!(path.exists());
        cleanup_generated_file(&path);
    }

    #[test]
    fn test_unregister_asset_cleans_generated_variant_files() {
        let dir = tempdir().expect("tempdir");
        let image_path = dir.path().join("preview.jpg");
        let image: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::from_pixel(4, 2, Rgb([20, 20, 20]));
        image.save(&image_path).expect("save image");
        let registry = PreviewFileRegistry::with_allowed_roots(vec![dir.path().to_path_buf()]);
        let record = registry
            .register_asset(
                image_path,
                &RegisterPreviewAssetRequest {
                    source: "preview.jpg".to_string(),
                    kind: Some(PreviewAssetKind::Image),
                    expected_projection: None,
                    explicit_open: None,
                },
            )
            .expect("register asset");
        let build_result = build_preview_variant(
            &record,
            &PreviewVariantRequest {
                role: PreviewVariantRole::Thumbnail,
                view_state: None,
                width: Some(128),
                height: Some(64),
                quality: Some(80),
                format: Some("png".to_string()),
            },
        )
        .expect("build thumbnail");
        let (token, path) = build_result
            .token_registration
            .expect("variant token registration");
        registry
            .register_asset_generated_variant(
                &record.manifest.asset_id,
                token.clone(),
                path.clone(),
            )
            .expect("register generated variant");
        assert!(path.exists());
        assert!(registry.lookup(&token).expect("lookup token").is_some());

        registry
            .unregister_asset(&record.manifest.asset_id)
            .expect("unregister asset");

        assert!(!path.exists());
        assert_eq!(registry.lookup(&token).expect("lookup removed token"), None);
    }

    #[test]
    fn test_unregister_asset_cleans_variant_tokens() {
        let dir = tempdir().expect("tempdir");
        let source_path = dir.path().join("preview.jpg");
        let variant_path = dir.path().join("preview-thumb.jpg");
        let image: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::from_pixel(2, 2, Rgb([0, 0, 0]));
        image.save(&source_path).expect("save source image");
        image.save(&variant_path).expect("save variant image");

        let registry = PreviewFileRegistry::with_allowed_roots(vec![dir.path().to_path_buf()]);
        let record = registry
            .register_asset(
                source_path,
                &RegisterPreviewAssetRequest {
                    source: "preview.jpg".to_string(),
                    kind: Some(PreviewAssetKind::Image),
                    expected_projection: None,
                    explicit_open: None,
                },
            )
            .expect("register asset");
        let variant_token = format!("{}:thumbnail", record.manifest.asset_id);

        registry
            .register_asset_variant_token(
                &record.manifest.asset_id,
                variant_token.clone(),
                variant_path,
            )
            .expect("register variant token");
        assert!(registry
            .lookup(&variant_token)
            .expect("lookup variant token")
            .is_some());

        registry
            .unregister_asset(&record.manifest.asset_id)
            .expect("unregister asset");
        assert_eq!(
            registry.lookup(&record.token).expect("lookup source token"),
            None
        );
        assert_eq!(
            registry
                .lookup(&variant_token)
                .expect("lookup variant token"),
            None
        );
    }

    #[test]
    fn test_unregister_variant_token_cleans_owning_asset() {
        let dir = tempdir().expect("tempdir");
        let source_path = dir.path().join("preview.jpg");
        let variant_path = dir.path().join("preview-thumb.jpg");
        let image: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::from_pixel(2, 2, Rgb([0, 0, 0]));
        image.save(&source_path).expect("save source image");
        image.save(&variant_path).expect("save variant image");

        let registry = PreviewFileRegistry::with_allowed_roots(vec![dir.path().to_path_buf()]);
        let record = registry
            .register_asset(
                source_path,
                &RegisterPreviewAssetRequest {
                    source: "preview.jpg".to_string(),
                    kind: Some(PreviewAssetKind::Image),
                    expected_projection: None,
                    explicit_open: None,
                },
            )
            .expect("register asset");
        let variant_token = format!("{}:thumbnail", record.manifest.asset_id);
        registry
            .register_asset_variant_token(
                &record.manifest.asset_id,
                variant_token.clone(),
                variant_path,
            )
            .expect("register variant token");

        registry
            .unregister_asset(&variant_token)
            .expect("unregister by variant token");
        assert_eq!(
            registry.lookup(&record.token).expect("lookup source token"),
            None
        );
        assert!(registry
            .lookup_asset(&record.manifest.asset_id)
            .expect("lookup asset")
            .is_none());
    }

    fn write_test_hdr(path: &StdPath) {
        let file = File::create(path).expect("create hdr");
        let pixels = vec![
            Rgb([0.25_f32, 0.5, 1.0]),
            Rgb([1.5, 0.2, 0.1]),
            Rgb([0.1, 1.0, 0.2]),
            Rgb([2.0, 2.0, 2.0]),
            Rgb([0.25_f32, 0.5, 1.0]),
            Rgb([1.5, 0.2, 0.1]),
            Rgb([0.1, 1.0, 0.2]),
            Rgb([2.0, 2.0, 2.0]),
        ];
        HdrEncoder::new(file)
            .encode(&pixels, 4, 2)
            .expect("encode hdr");
    }
}
