//! CPU-only preview image analysis.
//!
//! This module owns metadata and heuristic projection detection that does not
//! require GPU resources.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Read;
use std::path::Path;

const GPANO_METADATA_PREFIX_BYTES: usize = 256 * 1024;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PreviewProjectionType {
    Flat,
    Equirectangular,
    Cubemap,
    Fisheye,
    Unknown,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PreviewProjectionConfidence {
    Explicit,
    Manual,
    TrustedFilename,
    Heuristic,
    None,
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

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PreviewDimensions {
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
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

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
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

#[derive(Clone, Debug, Default)]
pub struct ProjectionInferenceInput {
    pub sidecar_projection: Option<PreviewProjectionType>,
    pub expected_projection: Option<PreviewProjectionType>,
    pub explicit_open: bool,
}

pub fn default_panorama_view_state() -> PanoramaViewState {
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

pub fn manual_projection_metadata(
    projection_type: PreviewProjectionType,
) -> (PreviewProjectionType, PreviewProjectionConfidence, String) {
    (
        projection_type,
        PreviewProjectionConfidence::Manual,
        "manual".to_string(),
    )
}

pub fn infer_projection(
    path: &Path,
    input: &ProjectionInferenceInput,
) -> PreviewProjectionMetadata {
    if let Some((projection_type, confidence, source)) = input
        .sidecar_projection
        .clone()
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

    if let Some(expected) = &input.expected_projection {
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

    let extension = normalized_extension(path);
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
                requires_confirmation: Some(!input.explicit_open),
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

pub fn contains_gpano_metadata(path: &Path) -> bool {
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

pub fn probe_dimensions(path: &Path) -> Option<PreviewDimensions> {
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
    fn detects_gpano_metadata_marker() {
        let dir = tempdir().expect("tempdir");
        let image_path = dir.path().join("ordinary.jpg");
        std::fs::write(
            &image_path,
            b"<x:xmpmeta><GPano:ProjectionType>equirectangular</GPano:ProjectionType><GPano:FullPanoWidthPixels>4000</GPano:FullPanoWidthPixels></x:xmpmeta>",
        )
        .expect("write metadata marker");

        assert!(contains_gpano_metadata(&image_path));
    }

    #[test]
    fn infers_heuristic_projection_from_two_to_one_aspect() {
        let dir = tempdir().expect("tempdir");
        let image_path = dir.path().join("wide.png");
        let image: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::from_pixel(8, 4, Rgb([10, 10, 10]));
        image.save(&image_path).expect("save image");

        let projection = infer_projection(
            &image_path,
            &ProjectionInferenceInput {
                explicit_open: false,
                ..ProjectionInferenceInput::default()
            },
        );

        assert_eq!(
            projection.projection_type,
            PreviewProjectionType::Equirectangular
        );
        assert_eq!(
            projection.confidence,
            PreviewProjectionConfidence::Heuristic
        );
        assert_eq!(projection.requires_confirmation, Some(true));
    }
}
