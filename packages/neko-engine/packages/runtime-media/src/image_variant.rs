//! CPU-only preview image variant generation.

use crate::error::{MediaError, Result};
use crate::image_analysis::{default_panorama_view_state, PanoramaViewState, PreviewDimensions};
use image::{imageops::FilterType, DynamicImage, ImageFormat, Rgba, RgbaImage};
use serde::{Deserialize, Serialize};
use std::f64::consts::PI;
use std::fs;
use std::path::{Path, PathBuf};

pub const DEFAULT_PROXY_MAX_EDGE: u32 = 4096;
pub const DEFAULT_THUMBNAIL_WIDTH: u32 = 512;
pub const DEFAULT_THUMBNAIL_HEIGHT: u32 = 256;
pub const LARGE_IMAGE_PROXY_THRESHOLD_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PreviewDynamicRange {
    Sdr,
    Hdr,
    Unknown,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ImageVariantRole {
    Source,
    Proxy,
    Thumbnail,
    FovCrop,
    Tile,
    Stream,
    Screenshot,
    Unsupported,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ImageVariantFormat {
    Jpeg,
    Png,
}

#[derive(Clone, Debug)]
pub struct ImageVariantRequest {
    pub role: ImageVariantRole,
    pub view_state: Option<PanoramaViewState>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub quality: Option<u8>,
    pub format: ImageVariantFormat,
}

#[derive(Clone, Debug)]
pub struct ImageVariantArtifact {
    pub path: PathBuf,
    pub mime_type: &'static str,
    pub dimensions: PreviewDimensions,
    pub file_size_bytes: u64,
}

impl ImageVariantFormat {
    pub fn normalize(format: Option<&str>) -> Self {
        match format {
            Some("png") => Self::Png,
            Some("jpeg") | Some("jpg") | Some("webp") | None => Self::Jpeg,
            Some(_) => Self::Jpeg,
        }
    }

    pub fn mime_type(self) -> &'static str {
        match self {
            Self::Png => "image/png",
            Self::Jpeg => "image/jpeg",
        }
    }

    pub fn extension(self) -> &'static str {
        match self {
            Self::Png => "png",
            Self::Jpeg => "jpg",
        }
    }
}

pub fn is_hdr_path(path: &Path) -> bool {
    matches!(normalized_extension(path).as_deref(), Some("hdr"))
}

pub fn is_exr_path(path: &Path) -> bool {
    matches!(normalized_extension(path).as_deref(), Some("exr"))
}

pub fn infer_dynamic_range(path: &Path) -> PreviewDynamicRange {
    match normalized_extension(path).as_deref() {
        Some("hdr") | Some("exr") => PreviewDynamicRange::Hdr,
        Some("jpg") | Some("jpeg") | Some("png") | Some("webp") | Some("gif") => {
            PreviewDynamicRange::Sdr
        }
        _ => PreviewDynamicRange::Unknown,
    }
}

pub fn generated_proxy_needed(
    dynamic_range: &PreviewDynamicRange,
    dimensions: Option<&PreviewDimensions>,
    source_name: &str,
    file_size_bytes: u64,
) -> bool {
    if matches!(dynamic_range, PreviewDynamicRange::Hdr) && !is_exr_name(source_name) {
        return true;
    }
    if file_size_bytes > LARGE_IMAGE_PROXY_THRESHOLD_BYTES {
        return true;
    }
    dimensions
        .is_some_and(|dimensions| dimensions.width.max(dimensions.height) > DEFAULT_PROXY_MAX_EDGE)
}

pub fn generate_preview_variant(
    source_path: &Path,
    output_path: &Path,
    request: &ImageVariantRequest,
) -> Result<ImageVariantArtifact> {
    if is_exr_path(source_path) {
        return Err(MediaError::Image(
            "EXR preview variants require a decoder that is not available".to_string(),
        ));
    }

    let output = match request.role {
        ImageVariantRole::Proxy => build_proxy_image(source_path)?,
        ImageVariantRole::Thumbnail => {
            let width = request.width.unwrap_or(DEFAULT_THUMBNAIL_WIDTH);
            let height = request.height.unwrap_or(DEFAULT_THUMBNAIL_HEIGHT);
            resize_exact(load_preview_image(source_path)?, width, height)
        }
        ImageVariantRole::FovCrop | ImageVariantRole::Screenshot => {
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
        ImageVariantRole::Source => load_preview_image(source_path)?,
        ImageVariantRole::Tile | ImageVariantRole::Stream | ImageVariantRole::Unsupported => {
            return Err(MediaError::Other(
                "Unsupported preview image variant role".to_string(),
            ));
        }
    };

    write_image(
        output_path,
        output,
        request.format,
        request.quality.unwrap_or(82),
    )?;
    let metadata = fs::metadata(output_path)?;
    let (width, height) = image::image_dimensions(output_path)?;
    Ok(ImageVariantArtifact {
        path: output_path.to_path_buf(),
        mime_type: request.format.mime_type(),
        dimensions: PreviewDimensions { width, height },
        file_size_bytes: metadata.len(),
    })
}

fn load_preview_image(path: &Path) -> Result<RgbaImage> {
    let extension = normalized_extension(path);
    if matches!(extension.as_deref(), Some("hdr")) {
        let image = image::open(path)?;
        return Ok(tone_map_hdr(image));
    }
    let image = image::open(path)?;
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

fn build_proxy_image(path: &Path) -> Result<RgbaImage> {
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

fn write_image(
    path: &Path,
    image: RgbaImage,
    format: ImageVariantFormat,
    quality: u8,
) -> Result<()> {
    match format {
        ImageVariantFormat::Png => {
            DynamicImage::ImageRgba8(image).save_with_format(path, ImageFormat::Png)?
        }
        ImageVariantFormat::Jpeg => {
            let file = fs::File::create(path)?;
            let rgb = DynamicImage::ImageRgba8(image).to_rgb8();
            let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(file, quality);
            encoder.encode_image(&DynamicImage::ImageRgb8(rgb))?;
        }
    }
    Ok(())
}

fn is_exr_name(name: &str) -> bool {
    Path::new(name)
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("exr"))
}

fn normalized_extension(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgb};
    use tempfile::tempdir;

    #[test]
    fn detects_hdr_and_exr_by_extension() {
        assert_eq!(
            infer_dynamic_range(Path::new("studio.hdr")),
            PreviewDynamicRange::Hdr
        );
        assert!(is_exr_path(Path::new("studio.exr")));
    }

    #[test]
    fn generates_thumbnail_variant() {
        let dir = tempdir().expect("tempdir");
        let image_path = dir.path().join("preview.png");
        let output_path = dir.path().join("thumbnail.jpg");
        let image: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::from_pixel(8, 4, Rgb([20, 40, 60]));
        image.save(&image_path).expect("save image");

        let artifact = generate_preview_variant(
            &image_path,
            &output_path,
            &ImageVariantRequest {
                role: ImageVariantRole::Thumbnail,
                view_state: None,
                width: Some(4),
                height: Some(2),
                quality: Some(82),
                format: ImageVariantFormat::Jpeg,
            },
        )
        .expect("generate thumbnail");

        assert_eq!(artifact.mime_type, "image/jpeg");
        assert_eq!(
            (artifact.dimensions.width, artifact.dimensions.height),
            (4, 2)
        );
        assert!(artifact.path.exists());
        assert!(artifact.file_size_bytes > 0);
    }
}
