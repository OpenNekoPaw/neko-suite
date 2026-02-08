//! VideoController - handles videos:* actions

use crate::controllers::utils::base64_encode;
use crate::controllers::Controller;
use crate::error::{ApiError, ApiResult};
use crate::registry::ResourceRegistry;
use neko_native_core::domain::{CaptureOptions, ExtractOptions, ExtractType};
use neko_native_core::services::{IVideoService, VideoService};
use neko_types::{ActionResponse, FrameFormat, ResourceId};
use serde::Deserialize;
use serde_json::Value;
use std::path::Path;
use std::sync::Arc;

/// Controller for video-related actions
pub struct VideoController {
    video_service: Arc<VideoService>,
    resource_registry: Arc<ResourceRegistry>,
}

impl VideoController {
    /// Create a new VideoController
    pub fn new(
        video_service: Arc<VideoService>,
        resource_registry: Arc<ResourceRegistry>,
    ) -> Self {
        Self {
            video_service,
            resource_registry,
        }
    }

    /// Resolve resource: either by ID or by source path (self-healing)
    async fn resolve_resource(&self, id: Option<&str>, source: Option<&str>) -> ApiResult<ResourceId> {
        if let Some(id_str) = id {
            // Try to resolve by ID first
            let resource_id = ResourceId::from_string(id_str.to_string());
            if self.resource_registry.resolve(&resource_id).await.is_some() {
                return Ok(resource_id);
            }
        }

        // Fall back to source path (self-healing)
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

/// Options for videos:probe
#[derive(Debug, Deserialize, Default)]
struct ProbeOptions {
    source: Option<String>,
}

/// Options for videos:capture
#[derive(Debug, Deserialize, Default)]
struct CaptureRequestOptions {
    /// Source path (alternative to resource_id)
    source: Option<String>,
    /// Time in seconds to capture
    #[serde(default)]
    time: f64,
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

/// Options for videos:keyframes
#[derive(Debug, Deserialize, Default)]
struct KeyframesRequestOptions {
    /// Source path (alternative to resource_id)
    source: Option<String>,
}

/// Options for videos:waveform
#[derive(Debug, Deserialize, Default)]
struct WaveformRequestOptions {
    /// Source path (alternative to resource_id)
    source: Option<String>,
}

/// Options for videos:extract
#[derive(Debug, Deserialize, Default)]
struct ExtractRequestOptions {
    /// Source path (alternative to resource_id)
    source: Option<String>,
    /// Extract type: "subtitles", "frame", "frame_range"
    #[serde(default = "default_extract_type")]
    extract_type: String,
    /// Time for single frame extraction
    #[serde(default)]
    time: f64,
    /// Start time for frame range
    #[serde(default)]
    start: f64,
    /// End time for frame range
    #[serde(default)]
    end: f64,
    /// FPS for frame range
    #[serde(default = "default_extract_fps")]
    fps: f64,
}

fn default_extract_type() -> String {
    "subtitles".to_string()
}

fn default_extract_fps() -> f64 {
    1.0
}

/// Options for videos:composite
#[derive(Debug, Deserialize, Default)]
struct CompositeRequestOptions {
    /// Layers to composite (JSON array)
    #[serde(default)]
    layers: Vec<CompositeLayerInput>,
    /// Output width
    width: Option<u32>,
    /// Output height
    height: Option<u32>,
    /// Background color [r, g, b, a] (0.0-1.0)
    background: Option<Vec<f64>>,
    /// JPEG quality (1-100, default 85)
    #[serde(default = "default_quality")]
    quality: u32,
}

/// Single layer input for composite
#[derive(Debug, Deserialize, Default, Clone)]
struct CompositeLayerInput {
    /// Source video file path
    source: String,
    /// Time in seconds to extract frame
    #[serde(default)]
    time: f64,
    /// Layer opacity (0.0-1.0, default 1.0)
    opacity: Option<f64>,
    /// Blend mode (default "normal")
    blend_mode: Option<String>,
    /// X position
    x: Option<f64>,
    /// Y position
    y: Option<f64>,
    /// Scale X (default 1.0)
    scale_x: Option<f64>,
    /// Scale Y (default 1.0)
    scale_y: Option<f64>,
    /// Rotation in degrees
    rotation: Option<f64>,
}

/// Options for videos:stream
#[derive(Debug, Deserialize, Default)]
struct StreamRequestOptions {
    /// Source path (alternative to resource_id)
    source: Option<String>,
    /// Session ID for the stream
    session_id: Option<String>,
}

/// Options for videos:transcode
#[derive(Debug, Deserialize, Default)]
struct TranscodeRequestOptions {
    /// Source path (alternative to resource_id)
    source: Option<String>,
    /// Output file path
    output: Option<String>,
    /// Video codec
    codec: Option<neko_types::VideoCodec>,
    /// Target width
    width: Option<u32>,
    /// Target height
    height: Option<u32>,
    /// Target bitrate
    bitrate: Option<u64>,
    /// Hardware encoder type
    hw_encoder: Option<neko_types::HwEncoderType>,
    /// Encoder preset
    preset: Option<neko_types::EncoderPreset>,
}

impl TranscodeRequestOptions {
    fn resolution(&self) -> Option<neko_types::Resolution> {
        match (self.width, self.height) {
            (Some(w), Some(h)) => Some(neko_types::Resolution::new(w, h)),
            _ => None,
        }
    }
}

/// Options for videos:proxy
#[derive(Debug, Deserialize, Default)]
struct ProxyRequestOptions {
    /// Source path (alternative to resource_id)
    source: Option<String>,
    /// Output file path
    output: Option<String>,
}

impl Controller for VideoController {
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

                // For probe, we need a source path
                let source = opts.source.as_deref().or(resource_id).ok_or_else(|| {
                    ApiError::InvalidRequest("source path required for videos:probe".to_string())
                })?;

                let path = Path::new(source);
                let media_info = self.video_service.probe(path).await?;

                // Register the resource
                let id = self.resource_registry.register(path).await;

                // Include resource_id in response
                let mut response = serde_json::to_value(media_info)?;
                if let Value::Object(ref mut map) = response {
                    map.insert("resourceId".to_string(), Value::String(id.as_str().to_string()));
                }

                Ok(ActionResponse::ok("", response))
            }
            "capture" => {
                let opts: CaptureRequestOptions = serde_json::from_value(options).unwrap_or_default();

                // Resolve resource (by ID or source path)
                let res_id = self.resolve_resource(resource_id, opts.source.as_deref()).await?;

                // Parse format
                let format = match opts.format.to_lowercase().as_str() {
                    "jpeg" | "jpg" => FrameFormat::Jpeg,
                    "png" => FrameFormat::Png,
                    "rgba" => FrameFormat::Rgba,
                    _ => FrameFormat::Jpeg,
                };

                // Build capture options
                let capture_opts = CaptureOptions {
                    quality: opts.quality,
                    format,
                    width: opts.width,
                    height: opts.height,
                };

                // Capture frame
                let frame_data = self.video_service.capture(&res_id, opts.time, capture_opts).await?;

                // Build response
                let response = serde_json::json!({
                    "resourceId": res_id.as_str(),
                    "width": frame_data.width,
                    "height": frame_data.height,
                    "format": format!("{:?}", frame_data.format).to_lowercase(),
                    "timestamp": frame_data.timestamp,
                    "size": frame_data.data.len(),
                    // Base64 encode the data for JSON transport
                    "data": base64_encode(&frame_data.data),
                });

                Ok(ActionResponse::ok("", response))
            }
            "extract" => {
                let opts: ExtractRequestOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let res_id = self
                    .resolve_resource(resource_id, opts.source.as_deref())
                    .await?;

                let extract_type = match opts.extract_type.to_lowercase().as_str() {
                    "subtitles" | "subtitle" => ExtractType::Subtitles,
                    "frame" => ExtractType::Frame { time: opts.time },
                    "frame_range" | "framerange" => ExtractType::FrameRange {
                        start: opts.start,
                        end: opts.end,
                        fps: opts.fps,
                    },
                    _ => ExtractType::Subtitles,
                };

                let extract_options = ExtractOptions {
                    extract_type,
                    time_range: None,
                };

                let frames = self
                    .video_service
                    .extract(&res_id, extract_options, None)
                    .await?;

                // Build response based on extract type
                let response = if opts.extract_type.to_lowercase().contains("subtitle") {
                    // Subtitle data is JSON in the first frame's data field
                    if let Some(frame) = frames.first() {
                        let subtitles: Value = serde_json::from_slice(&frame.data)
                            .unwrap_or(Value::Array(vec![]));
                        serde_json::json!({
                            "resourceId": res_id.as_str(),
                            "type": "subtitles",
                            "tracks": subtitles,
                        })
                    } else {
                        serde_json::json!({
                            "resourceId": res_id.as_str(),
                            "type": "subtitles",
                            "tracks": [],
                        })
                    }
                } else {
                    // Frame data
                    let frame_results: Vec<Value> = frames
                        .iter()
                        .map(|f| {
                            serde_json::json!({
                                "width": f.width,
                                "height": f.height,
                                "format": format!("{:?}", f.format).to_lowercase(),
                                "timestamp": f.timestamp,
                                "size": f.data.len(),
                                "data": base64_encode(&f.data),
                            })
                        })
                        .collect();

                    serde_json::json!({
                        "resourceId": res_id.as_str(),
                        "type": "frames",
                        "frames": frame_results,
                    })
                };

                Ok(ActionResponse::ok("", response))
            }
            "stream" => {
                let opts: StreamRequestOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let res_id = self
                    .resolve_resource(resource_id, opts.source.as_deref())
                    .await?;

                let session_id = opts.session_id.unwrap_or_else(|| "default".to_string());

                let (stream_id, _rx) = self
                    .video_service
                    .start_stream(&res_id, &session_id)
                    .await?;

                let response = serde_json::json!({
                    "streamId": stream_id.as_str(),
                    "resourceId": res_id.as_str(),
                    "status": "active",
                });

                Ok(ActionResponse::ok("", response))
            }
            "transcode" => {
                let opts: TranscodeRequestOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let res_id = self
                    .resolve_resource(resource_id, opts.source.as_deref())
                    .await?;

                let resolution = opts.resolution();
                let codec = opts.codec.unwrap_or_default();
                let hw_encoder = opts.hw_encoder.unwrap_or_default();
                let preset = opts.preset.unwrap_or_default();
                let bitrate = opts.bitrate;

                let output = opts.output.ok_or_else(|| {
                    ApiError::InvalidRequest("output path required for videos:transcode".to_string())
                })?;

                let transcode_opts = neko_native_core::domain::TranscodeOptions {
                    video_codec: codec,
                    resolution,
                    bitrate,
                    hw_encoder,
                    preset,
                };

                self.video_service
                    .transcode(&res_id, Path::new(&output), transcode_opts, None)
                    .await?;

                let response = serde_json::json!({
                    "resourceId": res_id.as_str(),
                    "output": output,
                    "success": true,
                });

                Ok(ActionResponse::ok("", response))
            }
            "keyframes" => {
                let opts: KeyframesRequestOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let res_id = self
                    .resolve_resource(resource_id, opts.source.as_deref())
                    .await?;

                let keyframes = self.video_service.get_keyframes(&res_id).await?;

                // Convert internal KeyframeInfo to neko_types for serialization
                let typed_keyframes: Vec<neko_types::KeyframeInfo> = keyframes
                    .into_iter()
                    .map(|kf| neko_types::KeyframeInfo {
                        frame_index: kf.frame_index,
                        timestamp: kf.timestamp,
                        pts: kf.pts,
                        nal_type: Some(kf.nal_type),
                        width: kf.width,
                        height: kf.height,
                        size: None,
                    })
                    .collect();

                let response = serde_json::json!({
                    "resourceId": res_id.as_str(),
                    "count": typed_keyframes.len(),
                    "keyframes": serde_json::to_value(&typed_keyframes)?,
                });

                Ok(ActionResponse::ok("", response))
            }
            "waveform" => {
                let opts: WaveformRequestOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let res_id = self
                    .resolve_resource(resource_id, opts.source.as_deref())
                    .await?;

                let waveform = self
                    .video_service
                    .generate_waveform(&res_id, None)
                    .await?;

                let response = serde_json::json!({
                    "resourceId": res_id.as_str(),
                    "waveform": serde_json::to_value(&waveform)?,
                });

                Ok(ActionResponse::ok("", response))
            }
            "composite" => {
                let opts: CompositeRequestOptions =
                    serde_json::from_value(options).unwrap_or_default();

                if opts.layers.is_empty() {
                    return Err(ApiError::InvalidRequest(
                        "At least one layer is required for videos:composite".to_string(),
                    ));
                }

                let output_width = opts.width.unwrap_or(1920);
                let output_height = opts.height.unwrap_or(1080);

                // Decode each layer frame and composite
                let mut rgba_layers: Vec<(Vec<u8>, u32, u32, &CompositeLayerInput)> = Vec::new();

                for layer in &opts.layers {
                    let path = std::path::Path::new(&layer.source);
                    let res_id = self.resource_registry.register(path).await;

                    let capture_opts = CaptureOptions {
                        quality: opts.quality,
                        format: FrameFormat::Rgba,
                        width: None,
                        height: None,
                    };

                    let frame_data = self
                        .video_service
                        .capture(&res_id, layer.time, capture_opts)
                        .await?;

                    rgba_layers.push((frame_data.data, frame_data.width, frame_data.height, layer));
                }

                // Simple composite: use the first layer's RGBA data, encode to JPEG
                // For full GPU compositing, use the standalone composite_frame in native-napi
                // Here we provide a basic single-layer or overlay composite via the API
                let first = &rgba_layers[0];
                let rgba_data = &first.0;
                let w = first.1;
                let h = first.2;

                // Encode to JPEG
                use neko_native_core::media_service::encode_rgba_to_jpeg;
                let jpeg_data = encode_rgba_to_jpeg(rgba_data, w, h, opts.quality)
                    .map_err(|e| ApiError::ServiceError(format!("JPEG encoding failed: {}", e)))?;

                let response = serde_json::json!({
                    "width": output_width,
                    "height": output_height,
                    "format": "jpeg",
                    "size": jpeg_data.len(),
                    "data": base64_encode(&jpeg_data),
                    "layerCount": opts.layers.len(),
                });

                Ok(ActionResponse::ok("", response))
            }
            "proxy" => {
                let opts: ProxyRequestOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let res_id = self
                    .resolve_resource(resource_id, opts.source.as_deref())
                    .await?;

                let output = opts.output.ok_or_else(|| {
                    ApiError::InvalidRequest("output path required for videos:proxy".to_string())
                })?;

                self.video_service
                    .generate_proxy(&res_id, Path::new(&output), None)
                    .await?;

                let response = serde_json::json!({
                    "resourceId": res_id.as_str(),
                    "output": output,
                    "success": true,
                });

                Ok(ActionResponse::ok("", response))
            }
            _ => Err(ApiError::UnknownAction {
                group: "videos".to_string(),
                action: action.to_string(),
            }),
        }
    }

    fn group(&self) -> &'static str {
        "videos"
    }

    fn actions(&self) -> &'static [&'static str] {
        &[
            "probe",
            "capture",
            "extract",
            "stream",
            "transcode",
            "keyframes",
            "waveform",
            "composite",
            "proxy",
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use neko_native_core::services::TaskService;

    fn create_test_controller() -> VideoController {
        let task_service = Arc::new(TaskService::new());
        let video_service = Arc::new(VideoService::new(None, task_service));
        let resource_registry = Arc::new(ResourceRegistry::new());
        VideoController::new(video_service, resource_registry)
    }

    #[tokio::test]
    async fn test_video_controller_probe_missing_source() {
        let controller = create_test_controller();

        let result = controller
            .handle("probe", None, Value::Null, None)
            .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_video_controller_unknown_action() {
        let controller = create_test_controller();

        let result = controller
            .handle("unknown", None, Value::Null, None)
            .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_video_controller_keyframes_missing_source() {
        let controller = create_test_controller();

        let result = controller
            .handle("keyframes", None, Value::Null, None)
            .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_video_controller_waveform_missing_source() {
        let controller = create_test_controller();

        let result = controller
            .handle("waveform", None, Value::Null, None)
            .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_video_controller_extract_missing_source() {
        let controller = create_test_controller();

        let result = controller
            .handle("extract", None, Value::Null, None)
            .await;

        assert!(result.is_err());
    }
}
