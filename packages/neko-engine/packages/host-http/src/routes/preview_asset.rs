use super::preview_file::{
    PanoramaViewMode, PanoramaViewState, PreviewDimensions, PreviewDynamicRange, PreviewErrorState,
    PreviewManifest, PreviewProjectionConfidence, PreviewProjectionType, PreviewToneMapping,
    PreviewVariant, PreviewVariantRequest, PreviewVariantRole,
};
use axum::http::StatusCode;
use image::{imageops::FilterType, DynamicImage, ImageFormat, Rgba, RgbaImage};
use serde::{Deserialize, Serialize};
use std::f64::consts::PI;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use uuid::Uuid;

const GPANO_METADATA_PREFIX_BYTES: usize = 256 * 1024;
const DEFAULT_PROXY_MAX_EDGE: u32 = 4096;
const DEFAULT_THUMBNAIL_WIDTH: u32 = 512;
const DEFAULT_THUMBNAIL_HEIGHT: u32 = 256;

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PreviewAssetSidecar {
    pub projection_type: Option<PreviewProjectionType>,
    pub default_view_state: Option<PanoramaViewState>,
}

#[derive(Clone, Debug)]
pub(crate) struct GeneratedPreviewVariant {
    pub variant: PreviewVariant,
    pub token: String,
    pub path: PathBuf,
}

pub(crate) fn read_sidecar(path: &Path) -> Option<PreviewAssetSidecar> {
    let sidecar_path = sidecar_path(path);
    let text = fs::read_to_string(sidecar_path).ok()?;
    serde_json::from_str(&text).ok()
}

pub(crate) fn write_sidecar_update(
    path: &Path,
    projection_type: Option<PreviewProjectionType>,
    default_view_state: Option<PanoramaViewState>,
) -> Result<PreviewAssetSidecar, StatusCode> {
    let mut sidecar = read_sidecar(path).unwrap_or_default();
    if projection_type.is_some() {
        sidecar.projection_type = projection_type;
    }
    if default_view_state.is_some() {
        sidecar.default_view_state = default_view_state;
    }
    let sidecar_path = sidecar_path(path);
    let body = serde_json::to_vec_pretty(&sidecar).map_err(|error| {
        tracing::error!("Failed to serialize preview sidecar: {}", error);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    fs::write(sidecar_path, body).map_err(|error| {
        tracing::error!("Failed to write preview sidecar: {}", error);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    Ok(sidecar)
}

pub(crate) fn sidecar_path(path: &Path) -> PathBuf {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("preview-asset");
    path.with_file_name(format!("{file_name}.nkmeta.json"))
}

pub(crate) fn contains_gpano_metadata(path: &Path) -> bool {
    let Some(extension) = normalized_extension(path) else {
        return false;
    };
    if !matches!(extension.as_str(), "jpg" | "jpeg" | "png" | "webp") {
        return false;
    }
    let Ok(file) = fs::File::open(path) else {
        return false;
    };
    let mut bytes = Vec::with_capacity(GPANO_METADATA_PREFIX_BYTES);
    if file
        .take(GPANO_METADATA_PREFIX_BYTES as u64)
        .read_to_end(&mut bytes)
        .is_err()
    {
        return false;
    }
    let text = String::from_utf8_lossy(&bytes).to_ascii_lowercase();
    text.contains("gpano")
        && (text.contains("equirectangular")
            || text.contains("usepanoramaviewer=\"true\"")
            || text.contains("usepanoramaviewer>true")
            || text.contains("fullpanowidthpixels")
            || text.contains("croppedareaimagewidthpixels"))
}

pub(crate) fn is_hdr_path(path: &Path) -> bool {
    matches!(normalized_extension(path).as_deref(), Some("hdr"))
}

pub(crate) fn is_exr_path(path: &Path) -> bool {
    matches!(normalized_extension(path).as_deref(), Some("exr"))
}

pub(crate) fn generated_proxy_needed(manifest: &PreviewManifest, file_size_bytes: u64) -> bool {
    const LARGE_IMAGE_PROXY_THRESHOLD_BYTES: u64 = 64 * 1024 * 1024;
    if matches!(manifest.media.dynamic_range, PreviewDynamicRange::Hdr)
        && !is_exr_path(Path::new(&manifest.source_name))
    {
        return true;
    }
    if file_size_bytes > LARGE_IMAGE_PROXY_THRESHOLD_BYTES {
        return true;
    }
    manifest
        .media
        .dimensions
        .as_ref()
        .is_some_and(|dimensions| dimensions.width.max(dimensions.height) > DEFAULT_PROXY_MAX_EDGE)
}

pub(crate) fn generate_initial_proxy(
    asset_id: &str,
    source_path: &Path,
    manifest: &PreviewManifest,
) -> Option<GeneratedPreviewVariant> {
    if manifest.error.is_some() || is_exr_path(source_path) {
        return None;
    }
    if !generated_proxy_needed(manifest, manifest.media.file_size_bytes) {
        return None;
    }
    let request = PreviewVariantRequest {
        role: PreviewVariantRole::Proxy,
        view_state: manifest.default_view_state.clone(),
        width: None,
        height: None,
        quality: Some(82),
        format: Some("jpeg".to_string()),
    };
    generate_preview_variant(asset_id, source_path, manifest, &request).ok()
}

pub(crate) fn generate_preview_variant(
    asset_id: &str,
    source_path: &Path,
    manifest: &PreviewManifest,
    request: &PreviewVariantRequest,
) -> Result<GeneratedPreviewVariant, StatusCode> {
    if manifest.error.is_some() || is_exr_path(source_path) {
        return Ok(unsupported_variant(asset_id, manifest, request));
    }

    let format = normalize_variant_format(request.format.as_deref());
    let mime_type = mime_for_variant_format(format);
    let output = match request.role {
        PreviewVariantRole::Proxy => build_proxy_image(source_path)?,
        PreviewVariantRole::Thumbnail => {
            let width = request.width.unwrap_or(DEFAULT_THUMBNAIL_WIDTH);
            let height = request.height.unwrap_or(DEFAULT_THUMBNAIL_HEIGHT);
            resize_exact(load_preview_image(source_path)?, width, height)
        }
        PreviewVariantRole::FovCrop | PreviewVariantRole::Screenshot => {
            let view_state = request
                .view_state
                .clone()
                .unwrap_or_else(default_panorama_view_state);
            let width = request.width.unwrap_or(1024);
            let height = request.height.unwrap_or(1024);
            render_fov_crop(
                &load_preview_image(source_path)?,
                width,
                height,
                &view_state,
            )
        }
        PreviewVariantRole::Source => load_preview_image(source_path)?,
        _ => {
            return Ok(unsupported_variant(asset_id, manifest, request));
        }
    };

    let cache_dir = preview_cache_dir(asset_id)?;
    let token = Uuid::new_v4().to_string();
    let path = cache_dir.join(format!(
        "{}-{}.{}",
        role_slug(&request.role),
        token,
        extension_for_variant_format(format)
    ));
    write_image(&path, output, format, request.quality.unwrap_or(82))?;
    let metadata = fs::metadata(&path).map_err(|error| {
        tracing::error!(
            "Failed to stat generated preview variant {:?}: {}",
            path,
            error
        );
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    let dimensions = image::image_dimensions(&path)
        .ok()
        .map(|(width, height)| PreviewDimensions { width, height });
    let variant = PreviewVariant {
        id: format!("{}:{}", manifest.asset_id, role_slug(&request.role)),
        asset_id: manifest.asset_id.clone(),
        role: request.role.clone(),
        url: Some(format!("/v1/preview/file/{token}")),
        token: Some(token.clone()),
        mime_type: Some(mime_type.to_string()),
        dimensions,
        file_size_bytes: Some(metadata.len()),
        tile_template: None,
        stream: None,
        view_state: request.view_state.clone(),
        error: None,
    };
    Ok(GeneratedPreviewVariant {
        variant,
        token,
        path,
    })
}

pub(crate) fn cleanup_generated_file(path: &Path) {
    if let Err(error) = fs::remove_file(path) {
        if error.kind() != std::io::ErrorKind::NotFound {
            tracing::warn!(
                "Failed to remove generated preview variant {:?}: {}",
                path,
                error
            );
        }
    }
    if let Some(parent) = path.parent() {
        let _ = fs::remove_dir(parent);
    }
}

pub(crate) fn manual_projection_metadata(
    projection_type: PreviewProjectionType,
) -> (PreviewProjectionType, PreviewProjectionConfidence, String) {
    (
        projection_type,
        PreviewProjectionConfidence::Manual,
        "manual".to_string(),
    )
}

pub(crate) fn default_panorama_view_state() -> PanoramaViewState {
    PanoramaViewState {
        mode: PanoramaViewMode::Sphere,
        yaw_deg: 0.0,
        pitch_deg: 0.0,
        roll_deg: 0.0,
        fov_deg: 75.0,
        exposure: 0.0,
        tone_mapping: PreviewToneMapping::Aces,
    }
}

fn unsupported_variant(
    asset_id: &str,
    manifest: &PreviewManifest,
    request: &PreviewVariantRequest,
) -> GeneratedPreviewVariant {
    let token = Uuid::new_v4().to_string();
    let path = PathBuf::new();
    GeneratedPreviewVariant {
        variant: PreviewVariant {
            id: format!("{}:{}", asset_id, role_slug(&request.role)),
            asset_id: asset_id.to_string(),
            role: PreviewVariantRole::Unsupported,
            url: None,
            token: None,
            mime_type: None,
            dimensions: request
                .width
                .zip(request.height)
                .map(|(width, height)| PreviewDimensions { width, height }),
            file_size_bytes: None,
            tile_template: None,
            stream: None,
            view_state: request.view_state.clone(),
            error: manifest.error.clone().or_else(|| {
                Some(PreviewErrorState {
                    code: "unsupported-format".to_string(),
                    message: "Unsupported preview variant".to_string(),
                    recoverable: true,
                })
            }),
        },
        token,
        path,
    }
}

fn load_preview_image(path: &Path) -> Result<RgbaImage, StatusCode> {
    let extension = normalized_extension(path);
    if matches!(extension.as_deref(), Some("hdr")) {
        let image = image::open(path).map_err(|error| {
            tracing::error!("Failed to decode HDR preview {:?}: {}", path, error);
            StatusCode::UNSUPPORTED_MEDIA_TYPE
        })?;
        return Ok(tone_map_hdr(image));
    }
    let image = image::open(path).map_err(|error| {
        tracing::error!("Failed to decode preview image {:?}: {}", path, error);
        StatusCode::UNSUPPORTED_MEDIA_TYPE
    })?;
    Ok(image.to_rgba8())
}

fn tone_map_hdr(image: DynamicImage) -> RgbaImage {
    let rgba = image.to_rgba32f();
    let (width, height) = rgba.dimensions();
    let mut out = RgbaImage::new(width, height);
    for (x, y, pixel) in rgba.enumerate_pixels() {
        let [r, g, b, a] = pixel.0;
        out.put_pixel(
            x,
            y,
            Rgba([
                tone_map_channel(r),
                tone_map_channel(g),
                tone_map_channel(b),
                (a.clamp(0.0, 1.0) * 255.0).round() as u8,
            ]),
        );
    }
    out
}

fn tone_map_channel(value: f32) -> u8 {
    let mapped = value.max(0.0) / (1.0 + value.max(0.0));
    let gamma = mapped.powf(1.0 / 2.2);
    (gamma.clamp(0.0, 1.0) * 255.0).round() as u8
}

fn build_proxy_image(path: &Path) -> Result<RgbaImage, StatusCode> {
    let source = load_preview_image(path)?;
    let max_edge = source.width().max(source.height());
    if max_edge <= DEFAULT_PROXY_MAX_EDGE {
        return Ok(source);
    }
    let scale = DEFAULT_PROXY_MAX_EDGE as f32 / max_edge as f32;
    let width = ((source.width() as f32 * scale).round() as u32).max(1);
    let height = ((source.height() as f32 * scale).round() as u32).max(1);
    Ok(image::imageops::resize(
        &source,
        width,
        height,
        FilterType::Lanczos3,
    ))
}

fn resize_exact(source: RgbaImage, width: u32, height: u32) -> RgbaImage {
    image::imageops::resize(&source, width.max(1), height.max(1), FilterType::Lanczos3)
}

fn render_fov_crop(
    source: &RgbaImage,
    width: u32,
    height: u32,
    view_state: &PanoramaViewState,
) -> RgbaImage {
    let width = width.max(1);
    let height = height.max(1);
    let mut out = RgbaImage::new(width, height);
    let aspect = width as f64 / height as f64;
    let fov = view_state
        .fov_deg
        .to_radians()
        .clamp(1.0_f64.to_radians(), PI - 0.01);
    let tan_half_fov = (fov * 0.5).tan();
    let yaw = view_state.yaw_deg.to_radians();
    let pitch = view_state.pitch_deg.to_radians();

    for y in 0..height {
        for x in 0..width {
            let nx = (((x as f64 + 0.5) / width as f64) * 2.0 - 1.0) * aspect * tan_half_fov;
            let ny = (1.0 - ((y as f64 + 0.5) / height as f64) * 2.0) * tan_half_fov;
            let direction = normalize3([nx, ny, -1.0]);
            let direction = rotate_x(direction, pitch);
            let direction = rotate_y(direction, yaw);
            let u = 0.5 + direction[2].atan2(direction[0]) / (2.0 * PI);
            let v = 0.5 - direction[1].clamp(-1.0, 1.0).asin() / PI;
            out.put_pixel(x, y, sample_equirect(source, u, v));
        }
    }
    out
}

fn sample_equirect(source: &RgbaImage, u: f64, v: f64) -> Rgba<u8> {
    let width = source.width();
    let height = source.height();
    let wrapped_u = u.rem_euclid(1.0);
    let clamped_v = v.clamp(0.0, 1.0);
    let x = (wrapped_u * width as f64).floor() as u32 % width;
    let y = ((clamped_v * (height.saturating_sub(1)) as f64).round() as u32)
        .min(height.saturating_sub(1));
    *source.get_pixel(x, y)
}

fn normalize3(value: [f64; 3]) -> [f64; 3] {
    let length = (value[0] * value[0] + value[1] * value[1] + value[2] * value[2]).sqrt();
    if length <= f64::EPSILON {
        [0.0, 0.0, -1.0]
    } else {
        [value[0] / length, value[1] / length, value[2] / length]
    }
}

fn rotate_x(p: [f64; 3], angle: f64) -> [f64; 3] {
    let (s, c) = angle.sin_cos();
    [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]
}

fn rotate_y(p: [f64; 3], angle: f64) -> [f64; 3] {
    let (s, c) = angle.sin_cos();
    [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]
}

fn write_image(path: &Path, image: RgbaImage, format: &str, quality: u8) -> Result<(), StatusCode> {
    match format {
        "png" => DynamicImage::ImageRgba8(image)
            .save_with_format(path, ImageFormat::Png)
            .map_err(|error| {
                tracing::error!("Failed to write PNG preview variant {:?}: {}", path, error);
                StatusCode::INTERNAL_SERVER_ERROR
            }),
        _ => {
            let file = fs::File::create(path).map_err(|error| {
                tracing::error!(
                    "Failed to create JPEG preview variant {:?}: {}",
                    path,
                    error
                );
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
            let rgb = DynamicImage::ImageRgba8(image).to_rgb8();
            let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(file, quality);
            encoder
                .encode_image(&DynamicImage::ImageRgb8(rgb))
                .map_err(|error| {
                    tracing::error!("Failed to write JPEG preview variant {:?}: {}", path, error);
                    StatusCode::INTERNAL_SERVER_ERROR
                })
        }
    }
}

fn preview_cache_dir(asset_id: &str) -> Result<PathBuf, StatusCode> {
    let dir = std::env::temp_dir()
        .join("neko-preview-cache")
        .join(asset_id);
    fs::create_dir_all(&dir).map_err(|error| {
        tracing::error!("Failed to create preview cache dir {:?}: {}", dir, error);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    Ok(dir)
}

fn normalize_variant_format(format: Option<&str>) -> &str {
    match format {
        Some("png") => "png",
        Some("jpeg") | Some("jpg") | Some("webp") | None => "jpeg",
        Some(_) => "jpeg",
    }
}

fn mime_for_variant_format(format: &str) -> &'static str {
    match format {
        "png" => "image/png",
        _ => "image/jpeg",
    }
}

fn extension_for_variant_format(format: &str) -> &'static str {
    match format {
        "png" => "png",
        _ => "jpg",
    }
}

fn role_slug(role: &PreviewVariantRole) -> &'static str {
    match role {
        PreviewVariantRole::Source => "source",
        PreviewVariantRole::Proxy => "proxy",
        PreviewVariantRole::Thumbnail => "thumbnail",
        PreviewVariantRole::FovCrop => "fov-crop",
        PreviewVariantRole::Tile => "tile",
        PreviewVariantRole::Stream => "stream",
        PreviewVariantRole::Screenshot => "screenshot",
        PreviewVariantRole::Unsupported => "unsupported",
    }
}

fn normalized_extension(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
}
