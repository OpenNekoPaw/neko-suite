//! Preview provider contracts and CPU-backed default providers.

use crate::error::{Error, Result};
use neko_runtime_media::{
    infer_projection, read_sidecar, ImageVariantFormat, ImageVariantRequest, ImageVariantRole,
    PreviewDimensions, PreviewProjectionMetadata, PreviewProjectionType, ProjectionInferenceInput,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PreviewProviderKind {
    Image,
    Video,
    Scene,
    Puppet,
    Document,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PreviewArtifactKind {
    Analysis,
    Variant,
    Snapshot,
    Stream,
    Unsupported,
}

#[derive(Clone, Debug)]
pub struct PreviewRequest {
    pub source: PathBuf,
    pub kind: PreviewProviderKind,
    pub expected_projection: Option<PreviewProjectionType>,
    pub explicit_open: bool,
    pub variant: Option<PreviewProviderVariantRequest>,
}

#[derive(Clone, Debug)]
pub struct PreviewProviderVariantRequest {
    pub output_path: PathBuf,
    pub role: ImageVariantRole,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub quality: Option<u8>,
    pub format: ImageVariantFormat,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewArtifact {
    pub provider_id: String,
    pub kind: PreviewArtifactKind,
    pub source: String,
    pub projection: Option<PreviewProjectionMetadata>,
    pub output_path: Option<String>,
    pub mime_type: Option<String>,
    pub dimensions: Option<PreviewDimensions>,
    pub file_size_bytes: Option<u64>,
    pub metadata: Option<Value>,
    pub error: Option<String>,
}

pub trait PreviewProvider: Send + Sync {
    fn id(&self) -> &'static str;

    fn supports(&self, request: &PreviewRequest) -> bool;

    fn generate(&self, request: &PreviewRequest) -> Result<PreviewArtifact>;
}

#[derive(Default)]
pub struct PreviewProviderRegistry {
    providers: HashMap<&'static str, Arc<dyn PreviewProvider>>,
}

impl PreviewProviderRegistry {
    pub fn new() -> Self {
        Self {
            providers: HashMap::new(),
        }
    }

    pub fn with_defaults() -> Self {
        let mut registry = Self::new();
        registry.register(ImagePreviewProvider);
        registry.register(VideoPreviewProvider);
        registry.register(ScenePreviewProvider);
        registry.register(PuppetPreviewProvider);
        registry.register(DocumentPreviewProvider);
        registry
    }

    pub fn register<P>(&mut self, provider: P)
    where
        P: PreviewProvider + 'static,
    {
        self.providers.insert(provider.id(), Arc::new(provider));
    }

    pub fn get(&self, id: &str) -> Option<Arc<dyn PreviewProvider>> {
        self.providers.get(id).cloned()
    }

    pub fn generate(&self, request: &PreviewRequest) -> Result<PreviewArtifact> {
        let Some(provider) = self
            .providers
            .values()
            .find(|provider| provider.supports(request))
        else {
            return Err(Error::UnsupportedCapability(format!(
                "No preview provider supports {:?}",
                request.source
            )));
        };
        provider.generate(request)
    }

    pub fn provider_ids(&self) -> Vec<&'static str> {
        let mut ids: Vec<_> = self.providers.keys().copied().collect();
        ids.sort_unstable();
        ids
    }
}

pub struct ImagePreviewProvider;

impl PreviewProvider for ImagePreviewProvider {
    fn id(&self) -> &'static str {
        "image"
    }

    fn supports(&self, request: &PreviewRequest) -> bool {
        matches!(request.kind, PreviewProviderKind::Image) || is_supported_image(&request.source)
    }

    fn generate(&self, request: &PreviewRequest) -> Result<PreviewArtifact> {
        let sidecar_projection =
            read_sidecar(&request.source).and_then(|sidecar| sidecar.projection_type);
        let projection = infer_projection(
            &request.source,
            &ProjectionInferenceInput {
                sidecar_projection,
                expected_projection: request.expected_projection.clone(),
                explicit_open: request.explicit_open,
            },
        );

        if let Some(variant) = &request.variant {
            let artifact = neko_runtime_media::generate_preview_variant(
                &request.source,
                &variant.output_path,
                &ImageVariantRequest {
                    role: variant.role.clone(),
                    view_state: None,
                    width: variant.width,
                    height: variant.height,
                    quality: variant.quality,
                    format: variant.format,
                },
            )
            .map_err(|error| Error::Other(error.to_string()))?;

            return Ok(PreviewArtifact {
                provider_id: self.id().to_string(),
                kind: PreviewArtifactKind::Variant,
                source: request.source.to_string_lossy().to_string(),
                projection: Some(projection),
                output_path: Some(artifact.path.to_string_lossy().to_string()),
                mime_type: Some(artifact.mime_type.to_string()),
                dimensions: Some(artifact.dimensions),
                file_size_bytes: Some(artifact.file_size_bytes),
                metadata: None,
                error: None,
            });
        }

        Ok(PreviewArtifact {
            provider_id: self.id().to_string(),
            kind: PreviewArtifactKind::Analysis,
            source: request.source.to_string_lossy().to_string(),
            projection: Some(projection),
            output_path: None,
            mime_type: None,
            dimensions: None,
            file_size_bytes: None,
            metadata: None,
            error: None,
        })
    }
}

pub struct DocumentPreviewProvider;

impl PreviewProvider for DocumentPreviewProvider {
    fn id(&self) -> &'static str {
        "document"
    }

    fn supports(&self, request: &PreviewRequest) -> bool {
        matches!(request.kind, PreviewProviderKind::Document)
            || matches!(
                extension(&request.source).as_deref(),
                Some("pdf" | "epub" | "cbz" | "docx")
            )
    }

    fn generate(&self, request: &PreviewRequest) -> Result<PreviewArtifact> {
        Ok(PreviewArtifact {
            provider_id: self.id().to_string(),
            kind: PreviewArtifactKind::Unsupported,
            source: request.source.to_string_lossy().to_string(),
            projection: None,
            output_path: None,
            mime_type: None,
            dimensions: None,
            file_size_bytes: None,
            metadata: None,
            error: Some("Document preview generation is not implemented yet".to_string()),
        })
    }
}

pub struct VideoPreviewProvider;

impl PreviewProvider for VideoPreviewProvider {
    fn id(&self) -> &'static str {
        "video"
    }

    fn supports(&self, request: &PreviewRequest) -> bool {
        matches!(request.kind, PreviewProviderKind::Video) || is_supported_video(&request.source)
    }

    fn generate(&self, request: &PreviewRequest) -> Result<PreviewArtifact> {
        let sidecar_projection =
            read_sidecar(&request.source).and_then(|sidecar| sidecar.projection_type);
        let projection = infer_projection(
            &request.source,
            &ProjectionInferenceInput {
                sidecar_projection,
                expected_projection: request.expected_projection.clone(),
                explicit_open: request.explicit_open,
            },
        );
        let is_panoramic = matches!(
            projection.projection_type,
            PreviewProjectionType::Equirectangular
                | PreviewProjectionType::Cubemap
                | PreviewProjectionType::Fisheye
        );

        Ok(PreviewArtifact {
            provider_id: self.id().to_string(),
            kind: if is_panoramic {
                PreviewArtifactKind::Stream
            } else {
                PreviewArtifactKind::Analysis
            },
            source: request.source.to_string_lossy().to_string(),
            projection: Some(projection),
            output_path: None,
            mime_type: if is_panoramic {
                Some("video/h264".to_string())
            } else {
                None
            },
            dimensions: None,
            file_size_bytes: None,
            metadata: Some(serde_json::json!({
                "ordinaryPosterFrame": !is_panoramic,
                "panoramicStream": is_panoramic,
                "streamSink": is_panoramic,
                "viewStateUpdates": is_panoramic,
            })),
            error: None,
        })
    }
}

pub struct ScenePreviewProvider;

impl PreviewProvider for ScenePreviewProvider {
    fn id(&self) -> &'static str {
        "scene"
    }

    fn supports(&self, request: &PreviewRequest) -> bool {
        matches!(request.kind, PreviewProviderKind::Scene) || is_supported_scene(&request.source)
    }

    fn generate(&self, request: &PreviewRequest) -> Result<PreviewArtifact> {
        Ok(PreviewArtifact {
            provider_id: self.id().to_string(),
            kind: PreviewArtifactKind::Snapshot,
            source: request.source.to_string_lossy().to_string(),
            projection: None,
            output_path: request
                .variant
                .as_ref()
                .map(|variant| variant.output_path.to_string_lossy().to_string()),
            mime_type: Some("image/jpeg".to_string()),
            dimensions: request
                .variant
                .as_ref()
                .and_then(|variant| variant.width.zip(variant.height))
                .map(|(width, height)| PreviewDimensions { width, height }),
            file_size_bytes: None,
            metadata: Some(serde_json::json!({
                "renderer": "SceneRenderer",
                "snapshot": true,
            })),
            error: None,
        })
    }
}

pub struct PuppetPreviewProvider;

impl PreviewProvider for PuppetPreviewProvider {
    fn id(&self) -> &'static str {
        "puppet"
    }

    fn supports(&self, request: &PreviewRequest) -> bool {
        matches!(request.kind, PreviewProviderKind::Puppet) || is_supported_puppet(&request.source)
    }

    fn generate(&self, request: &PreviewRequest) -> Result<PreviewArtifact> {
        Ok(PreviewArtifact {
            provider_id: self.id().to_string(),
            kind: PreviewArtifactKind::Snapshot,
            source: request.source.to_string_lossy().to_string(),
            projection: None,
            output_path: request
                .variant
                .as_ref()
                .map(|variant| variant.output_path.to_string_lossy().to_string()),
            mime_type: Some("image/png".to_string()),
            dimensions: request
                .variant
                .as_ref()
                .and_then(|variant| variant.width.zip(variant.height))
                .map(|(width, height)| PreviewDimensions { width, height }),
            file_size_bytes: None,
            metadata: Some(serde_json::json!({
                "renderer": "PuppetRenderer",
                "snapshot": true,
            })),
            error: None,
        })
    }
}

fn is_supported_image(path: &Path) -> bool {
    matches!(
        extension(path).as_deref(),
        Some("hdr" | "exr" | "jpg" | "jpeg" | "png" | "webp")
    )
}

fn is_supported_video(path: &Path) -> bool {
    matches!(
        extension(path).as_deref(),
        Some("mp4" | "m4v" | "mov" | "mkv" | "webm")
    )
}

fn is_supported_scene(path: &Path) -> bool {
    matches!(extension(path).as_deref(), Some("gltf" | "glb" | "nkm"))
}

fn is_supported_puppet(path: &Path) -> bool {
    matches!(extension(path).as_deref(), Some("inp" | "moc3" | "nkp"))
}

fn extension(path: &Path) -> Option<String> {
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
    fn registry_routes_image_request_to_image_provider() {
        let dir = tempdir().expect("tempdir");
        let image_path = dir.path().join("studio_360.jpg");
        let image: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::from_pixel(4, 2, Rgb([20, 40, 60]));
        image.save(&image_path).expect("save image");
        let registry = PreviewProviderRegistry::with_defaults();

        let artifact = registry
            .generate(&PreviewRequest {
                source: image_path,
                kind: PreviewProviderKind::Image,
                expected_projection: None,
                explicit_open: false,
                variant: None,
            })
            .expect("generate image preview");

        assert_eq!(artifact.provider_id, "image");
        assert_eq!(artifact.kind, PreviewArtifactKind::Analysis);
        assert_eq!(
            artifact.projection.unwrap().projection_type,
            PreviewProjectionType::Equirectangular
        );
    }

    #[test]
    fn document_provider_returns_unsupported_artifact() {
        let registry = PreviewProviderRegistry::with_defaults();
        let artifact = registry
            .generate(&PreviewRequest {
                source: PathBuf::from("book.pdf"),
                kind: PreviewProviderKind::Document,
                expected_projection: None,
                explicit_open: false,
                variant: None,
            })
            .expect("document placeholder");

        assert_eq!(artifact.provider_id, "document");
        assert_eq!(artifact.kind, PreviewArtifactKind::Unsupported);
        assert!(artifact.error.is_some());
    }

    #[test]
    fn registry_registers_advanced_preview_providers() {
        let registry = PreviewProviderRegistry::with_defaults();
        assert_eq!(
            registry.provider_ids(),
            vec!["document", "image", "puppet", "scene", "video"]
        );
    }

    #[test]
    fn video_provider_marks_panoramic_video_as_stream() {
        let registry = PreviewProviderRegistry::with_defaults();
        let artifact = registry
            .generate(&PreviewRequest {
                source: PathBuf::from("tour_360.mp4"),
                kind: PreviewProviderKind::Video,
                expected_projection: Some(PreviewProjectionType::Equirectangular),
                explicit_open: true,
                variant: None,
            })
            .expect("video provider");

        assert_eq!(artifact.provider_id, "video");
        assert_eq!(artifact.kind, PreviewArtifactKind::Stream);
        assert_eq!(
            artifact.projection.unwrap().projection_type,
            PreviewProjectionType::Equirectangular
        );
    }

    #[test]
    fn scene_and_puppet_providers_return_snapshot_artifacts() {
        let registry = PreviewProviderRegistry::with_defaults();

        let scene = registry
            .generate(&PreviewRequest {
                source: PathBuf::from("stage.glb"),
                kind: PreviewProviderKind::Scene,
                expected_projection: None,
                explicit_open: false,
                variant: None,
            })
            .expect("scene provider");
        assert_eq!(scene.provider_id, "scene");
        assert_eq!(scene.kind, PreviewArtifactKind::Snapshot);

        let puppet = registry
            .generate(&PreviewRequest {
                source: PathBuf::from("avatar.inp"),
                kind: PreviewProviderKind::Puppet,
                expected_projection: None,
                explicit_open: false,
                variant: None,
            })
            .expect("puppet provider");
        assert_eq!(puppet.provider_id, "puppet");
        assert_eq!(puppet.kind, PreviewArtifactKind::Snapshot);
    }
}
