//! ImageController - handles images:* actions

use crate::controllers::utils::{base64_decode, base64_encode};
use crate::controllers::Controller;
use crate::error::{ApiError, ApiResult};
use crate::registry::ResourceRegistry;
use neko_native_core::domain::CaptureOptions;
use neko_native_core::media_service::{diff_media, DiffCategory};
use neko_native_core::services::{IImageService, ImageService};
use neko_types::{ActionResponse, FrameFormat, ResourceId};
use serde::Deserialize;
use serde_json::Value;
use std::path::Path;
use std::sync::Arc;

/// Controller for image-related actions
pub struct ImageController {
    image_service: Arc<ImageService>,
    resource_registry: Arc<ResourceRegistry>,
}

impl ImageController {
    /// Create a new ImageController
    pub fn new(
        image_service: Arc<ImageService>,
        resource_registry: Arc<ResourceRegistry>,
    ) -> Self {
        Self {
            image_service,
            resource_registry,
        }
    }

    /// Resolve resource: either by ID or by source path (self-healing)
    async fn resolve_resource(
        &self,
        id: Option<&str>,
        source: Option<&str>,
    ) -> ApiResult<ResourceId> {
        if let Some(id_str) = id {
            let resource_id = ResourceId::from_string(id_str.to_string());
            if self.resource_registry.resolve(&resource_id).await.is_some() {
                return Ok(resource_id);
            }
        }

        if let Some(source_path) = source {
            let path = Path::new(source_path);
            let resource_id = self.resource_registry.register(path).await;
            return Ok(resource_id);
        }

        Err(ApiError::InvalidRequest(
            "Either resource_id or source path required".to_string(),
        ))
    }
}

/// Options for images:probe
#[derive(Debug, Deserialize, Default)]
struct ProbeOptions {
    source: Option<String>,
}

/// Options for images:capture
#[derive(Debug, Deserialize, Default)]
struct CaptureRequestOptions {
    /// Source path (alternative to resource_id)
    source: Option<String>,
    /// JPEG quality (1-100)
    #[serde(default = "default_quality")]
    quality: u32,
    /// Output format (jpeg, png, rgba)
    #[serde(default = "default_format")]
    format: String,
    /// Output width (optional)
    width: Option<u32>,
    /// Output height (optional)
    height: Option<u32>,
}

fn default_quality() -> u32 {
    85
}

fn default_format() -> String {
    "jpeg".to_string()
}

/// Options for images:encode
#[derive(Debug, Deserialize, Default)]
struct EncodeRequestOptions {
    /// Base64-encoded RGBA pixel data
    data: Option<String>,
    /// Image width in pixels
    width: Option<u32>,
    /// Image height in pixels
    height: Option<u32>,
    /// JPEG quality (1-100, default 85)
    #[serde(default = "default_quality")]
    quality: u32,
}

/// Options for images:diff
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ImageDiffRequestOptions {
    /// Source A file path
    source_a: Option<String>,
    /// Source B file path
    source_b: Option<String>,
}

impl Controller for ImageController {
    async fn handle(
        &self,
        action: &str,
        resource_id: Option<&str>,
        options: Value,
        _body: Option<Value>,
    ) -> ApiResult<ActionResponse> {
        match action {
            "probe" => {
                let opts: ProbeOptions = serde_json::from_value(options).unwrap_or_default();

                let source = opts.source.as_deref().or(resource_id).ok_or_else(|| {
                    ApiError::InvalidRequest("source path required for images:probe".to_string())
                })?;

                let path = Path::new(source);
                let media_info = self.image_service.probe(path).await?;

                // Register the resource
                let id = self.resource_registry.register(path).await;

                // Include resource_id in response
                let mut response = serde_json::to_value(media_info)?;
                if let Value::Object(ref mut map) = response {
                    map.insert(
                        "resourceId".to_string(),
                        Value::String(id.as_str().to_string()),
                    );
                }

                Ok(ActionResponse::ok("", response))
            }
            "capture" => {
                let opts: CaptureRequestOptions =
                    serde_json::from_value(options).unwrap_or_default();

                // Resolve resource (by ID or source path)
                let res_id = self
                    .resolve_resource(resource_id, opts.source.as_deref())
                    .await?;

                // Parse format
                let format = match opts.format.to_lowercase().as_str() {
                    "jpeg" | "jpg" => FrameFormat::Jpeg,
                    "png" => FrameFormat::Png,
                    "rgba" => FrameFormat::Rgba,
                    _ => FrameFormat::Jpeg,
                };

                // Build capture options (no time parameter for images)
                let capture_opts = CaptureOptions {
                    quality: opts.quality,
                    format,
                    width: opts.width,
                    height: opts.height,
                };

                // Capture image
                let frame_data = self.image_service.capture(&res_id, capture_opts).await?;

                // Build response
                let response = serde_json::json!({
                    "resourceId": res_id.as_str(),
                    "width": frame_data.width,
                    "height": frame_data.height,
                    "format": format!("{:?}", frame_data.format).to_lowercase(),
                    "timestamp": frame_data.timestamp,
                    "size": frame_data.data.len(),
                    "data": base64_encode(&frame_data.data),
                });

                Ok(ActionResponse::ok("", response))
            }
            "encode" => {
                let opts: EncodeRequestOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let data_b64 = opts.data.ok_or_else(|| {
                    ApiError::InvalidRequest("RGBA data required for images:encode".to_string())
                })?;

                let width = opts.width.ok_or_else(|| {
                    ApiError::InvalidRequest("width required for images:encode".to_string())
                })?;

                let height = opts.height.ok_or_else(|| {
                    ApiError::InvalidRequest("height required for images:encode".to_string())
                })?;

                // Decode base64 RGBA data
                let rgba_data = base64_decode(&data_b64).map_err(|e| {
                    ApiError::InvalidRequest(format!("Invalid base64 data: {}", e))
                })?;

                // Encode RGBA to JPEG
                use neko_native_core::media_service::encode_rgba_to_jpeg;
                let jpeg_data = encode_rgba_to_jpeg(&rgba_data, width, height, opts.quality)
                    .map_err(|e| ApiError::ServiceError(format!("JPEG encoding failed: {}", e)))?;

                let response = serde_json::json!({
                    "width": width,
                    "height": height,
                    "format": "jpeg",
                    "size": jpeg_data.len(),
                    "data": base64_encode(&jpeg_data),
                });

                Ok(ActionResponse::ok("", response))
            }
            "diff" => {
                let opts: ImageDiffRequestOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let source_a = opts.source_a.ok_or_else(|| {
                    ApiError::InvalidRequest("sourceA path required for images:diff".to_string())
                })?;
                let source_b = opts.source_b.ok_or_else(|| {
                    ApiError::InvalidRequest("sourceB path required for images:diff".to_string())
                })?;

                let result = diff_media(&source_a, &source_b, DiffCategory::Image)
                    .map_err(|e| ApiError::ServiceError(format!("Diff failed: {}", e)))?;

                let response = serde_json::to_value(&result)?;
                Ok(ActionResponse::ok("", response))
            }
            _ => Err(ApiError::UnknownAction {
                group: "images".to_string(),
                action: action.to_string(),
            }),
        }
    }

    fn group(&self) -> &'static str {
        "images"
    }

    fn actions(&self) -> &'static [&'static str] {
        &["probe", "capture", "encode", "diff"]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_controller() -> ImageController {
        let image_service = Arc::new(ImageService::new(None));
        let resource_registry = Arc::new(ResourceRegistry::new());
        ImageController::new(image_service, resource_registry)
    }

    #[tokio::test]
    async fn test_image_controller_probe_missing_source() {
        let controller = create_test_controller();

        let result = controller
            .handle("probe", None, Value::Null, None)
            .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_image_controller_unknown_action() {
        let controller = create_test_controller();

        let result = controller
            .handle("unknown", None, Value::Null, None)
            .await;

        assert!(result.is_err());
    }

    #[test]
    fn test_image_controller_actions() {
        let controller = create_test_controller();
        let actions = controller.actions();

        assert!(actions.contains(&"probe"));
        assert!(actions.contains(&"capture"));
        assert!(actions.contains(&"encode"));
        assert_eq!(actions.len(), 3);
    }
}
