//! ScenesController - handles scenes:* actions for 3D scene management

use crate::controllers::utils::{base64_encode, resolve_file_source_ref};
use crate::controllers::{Controller, ModelPreviewController};
use crate::error::{ApiError, ApiResult};
use crate::file_access::FileAccessRegistry;
use crate::registry::StreamRegistry;
use neko_engine_kernel::contracts::domain::{StreamCodec, StreamConfig};
use neko_engine_kernel::contracts::gpu::{
    CameraParams, ControlAckHealthSample, DegradationDecision, DegradationHysteresis,
    DegradationStep, FrameLoadSample, FrameScheduleDecision, FrameScheduler, SceneColorSpace,
    SceneToneMapping, ViewportDebugView, ViewportDescriptor, ViewportLookDevSettings,
    ViewportMaterialOverride, ViewportMaterialOverrideKind, ViewportPostProcess,
    ViewportRenderMode, ViewportWorkMode,
};
use neko_engine_kernel::contracts::preview::PreviewPipelineConfig;
use neko_engine_kernel::contracts::services::{ISceneService, PipelineSink, StreamSink};
use neko_engine_types::registry;
use neko_engine_types::{
    ActionResponse, FileSourceRef, GpuRenderPath, RenderFrameDiagnostics, RenderFrameMeta,
    Resolution, StreamId,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio_util::sync::CancellationToken;

/// Controller for 3D scene operations
pub struct ScenesController {
    scene_service: Option<Arc<dyn ISceneService>>,
    stream_registry: Option<Arc<StreamRegistry>>,
    file_access_registry: Option<Arc<FileAccessRegistry>>,
    model_preview_controller: Option<Arc<ModelPreviewController>>,
}

impl ScenesController {
    pub fn new(scene_service: Option<Arc<dyn ISceneService>>) -> Self {
        Self {
            scene_service,
            stream_registry: None,
            file_access_registry: None,
            model_preview_controller: None,
        }
    }

    pub fn with_stream_registry(
        scene_service: Option<Arc<dyn ISceneService>>,
        stream_registry: Arc<StreamRegistry>,
        model_preview_controller: Arc<ModelPreviewController>,
    ) -> Self {
        Self {
            scene_service,
            stream_registry: Some(stream_registry),
            file_access_registry: None,
            model_preview_controller: Some(model_preview_controller),
        }
    }

    pub fn with_file_access_registry(mut self, registry: Arc<FileAccessRegistry>) -> Self {
        self.file_access_registry = Some(registry);
        self
    }

    fn service(&self) -> ApiResult<&dyn ISceneService> {
        self.scene_service
            .as_deref()
            .ok_or_else(|| ApiError::ServiceError("Scene service not available".to_string()))
    }

    fn stream_registry(&self) -> ApiResult<Arc<StreamRegistry>> {
        self.stream_registry
            .clone()
            .ok_or_else(|| ApiError::ServiceError("Stream registry not available".to_string()))
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SceneStreamOptions {
    viewport_id: String,
    #[serde(default = "default_scene_id")]
    scene_id: String,
    camera_ref: Option<Value>,
    #[serde(default = "default_render_mode")]
    render_mode: String,
    debug_view: Option<String>,
    resolution: Option<SceneViewportResolution>,
    #[serde(default = "default_fps")]
    fps: f64,
    #[serde(default = "default_color_space")]
    color_space: String,
    #[serde(default = "default_tone_mapping")]
    tone_mapping: String,
    post_process: Option<Value>,
    layer_mask: Option<u32>,
    #[serde(default = "default_work_mode")]
    work_mode: String,
    #[serde(default = "default_helper_passes_enabled")]
    helper_passes_enabled: bool,
    lookdev: Option<SceneStreamLookDevOptions>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SceneStreamLookDevOptions {
    #[serde(default = "default_render_mode")]
    render_mode: String,
    debug_view: Option<String>,
    material_override: Option<SceneStreamMaterialOverrideOptions>,
    helper_passes_enabled: Option<bool>,
    show_grid: Option<bool>,
    show_skeleton: Option<bool>,
    show_normals: Option<bool>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SceneStreamMaterialOverrideOptions {
    kind: String,
    color: Option<SceneVec3Options>,
    roughness: Option<f32>,
    metallic: Option<f32>,
    preserve_alpha: Option<bool>,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SceneVec3Options {
    x: f32,
    y: f32,
    z: f32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SceneViewportResolution {
    width: u32,
    height: u32,
    #[allow(dead_code)]
    pixel_ratio: Option<f32>,
}

fn default_scene_id() -> String {
    "default".to_string()
}

fn default_render_mode() -> String {
    "pbr".to_string()
}

fn default_fps() -> f64 {
    30.0
}

fn default_color_space() -> String {
    "srgb".to_string()
}

fn default_tone_mapping() -> String {
    "aces".to_string()
}

fn default_work_mode() -> String {
    "edit-parametric".to_string()
}

fn default_helper_passes_enabled() -> bool {
    true
}

const SCENE_STREAM_MIN_BITRATE_BPS: u64 = 6_000_000;
const SCENE_STREAM_MAX_BITRATE_BPS: u64 = 36_000_000;
const SCENE_STREAM_TARGET_BITS_PER_PIXEL: u64 = 8;
const SCENE_STREAM_LOW_LATENCY_GOP_SECONDS: f64 = 0.5;

fn parse_scene_stream_options(options: Value) -> ApiResult<SceneStreamOptions> {
    let value = options
        .get("viewport")
        .or_else(|| options.get("viewportDescriptor"))
        .cloned()
        .unwrap_or(options);
    serde_json::from_value(value).map_err(|e| ApiError::InvalidRequest(e.to_string()))
}

fn normalize_stream_dimension(value: u32, fallback: u32) -> u32 {
    let dimension = if value == 0 { fallback } else { value };
    dimension.max(2) & !1
}

fn normalize_stream_fps(fps: f64) -> f64 {
    if fps.is_finite() {
        fps.clamp(1.0, 120.0)
    } else {
        default_fps()
    }
}

fn scene_stream_resource_id(scene_id: &str, viewport_id: &str) -> String {
    format!("scene:{scene_id}:viewport:{viewport_id}")
}

#[derive(Debug, Clone)]
struct SceneStreamProducerConfig {
    session_id: String,
    viewport: ViewportDescriptor,
    width: u32,
    height: u32,
    fps: f64,
    initial_revision: u64,
    initial_applied_seq: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SceneStreamQualityTier {
    Full,
    AuxiliaryReduced,
    MainPostProcessReduced,
    MainFpsReduced,
    MainResolutionReduced,
}

impl SceneStreamQualityTier {
    fn as_str(self) -> &'static str {
        match self {
            Self::Full => "full",
            Self::AuxiliaryReduced => "auxiliary-reduced",
            Self::MainPostProcessReduced => "main-post-process-reduced",
            Self::MainFpsReduced => "main-fps-reduced",
            Self::MainResolutionReduced => "main-resolution-reduced",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct SceneStreamRuntimeSettings {
    width: u32,
    height: u32,
    fps: f64,
    h264_quality: u32,
    helper_passes_enabled: bool,
    post_process_enabled: bool,
    quality_tier: SceneStreamQualityTier,
    preserve_control_ack: bool,
}

impl SceneStreamRuntimeSettings {
    fn frame_duration(self) -> Duration {
        Duration::try_from_secs_f64(1.0 / normalize_stream_fps(self.fps)).unwrap_or_default()
    }

    fn duration_us(self) -> i64 {
        (1_000_000.0 / normalize_stream_fps(self.fps)) as i64
    }
}

#[derive(Debug, Clone)]
struct SceneStreamRuntimeScheduler {
    scheduler: FrameScheduler,
    base_decision: FrameScheduleDecision,
    base_viewport: ViewportDescriptor,
    base_width: u32,
    base_height: u32,
    base_fps: f64,
    is_auxiliary: bool,
}

impl SceneStreamRuntimeScheduler {
    fn new(config: &SceneStreamProducerConfig) -> Self {
        let scheduler = FrameScheduler;
        let base_decision = scheduler.schedule_viewport(&config.viewport);
        Self {
            scheduler,
            base_decision,
            base_viewport: config.viewport.clone(),
            base_width: config.width,
            base_height: config.height,
            base_fps: config.fps.max(1.0),
            is_auxiliary: config.viewport.viewport_id != "main",
        }
    }

    fn settings(
        &self,
        auxiliary_viewport_count: usize,
        load: FrameLoadSample,
        control_ack: ControlAckHealthSample,
    ) -> SceneStreamRuntimeSettings {
        let decision = self.scheduler.degradation_plan(
            &self.base_decision,
            auxiliary_viewport_count,
            load,
            control_ack,
        );
        self.apply_decision(&decision)
    }

    fn settings_stabilized(
        &self,
        auxiliary_viewport_count: usize,
        load: FrameLoadSample,
        control_ack: ControlAckHealthSample,
        hysteresis: &mut DegradationHysteresis,
    ) -> SceneStreamRuntimeSettings {
        let raw_decision = self.scheduler.degradation_plan(
            &self.base_decision,
            auxiliary_viewport_count,
            load,
            control_ack,
        );
        let decision = hysteresis.stabilize(raw_decision);
        self.apply_decision(&decision)
    }

    fn apply_decision(&self, decision: &DegradationDecision) -> SceneStreamRuntimeSettings {
        let mut settings = SceneStreamRuntimeSettings {
            width: self.base_width,
            height: self.base_height,
            fps: self.base_fps,
            h264_quality: 85,
            helper_passes_enabled: self.base_viewport.helper_passes,
            post_process_enabled: self.base_decision.work_mode != ViewportWorkMode::EditFree,
            quality_tier: SceneStreamQualityTier::Full,
            preserve_control_ack: decision.preserve_control_ack,
        };

        for step in &decision.steps {
            match step {
                DegradationStep::AuxiliaryHelperPasses if self.is_auxiliary => {
                    settings.helper_passes_enabled = false;
                    settings.quality_tier = SceneStreamQualityTier::AuxiliaryReduced;
                }
                DegradationStep::AuxiliaryViewportFpsResolution if self.is_auxiliary => {
                    settings.quality_tier = SceneStreamQualityTier::AuxiliaryReduced;
                }
                DegradationStep::MainViewportPostProcessQuality if !self.is_auxiliary => {
                    settings.post_process_enabled = false;
                    settings.quality_tier = SceneStreamQualityTier::MainPostProcessReduced;
                }
                DegradationStep::MainViewportFps if !self.is_auxiliary => {
                    settings.quality_tier = SceneStreamQualityTier::MainFpsReduced;
                }
                DegradationStep::MainViewportResolution if !self.is_auxiliary => {
                    settings.quality_tier = SceneStreamQualityTier::MainResolutionReduced;
                }
                _ => {}
            }
        }

        settings
    }

    fn viewport_descriptor_for_settings(
        &self,
        settings: SceneStreamRuntimeSettings,
    ) -> ViewportDescriptor {
        let mut viewport = self.base_viewport.clone();
        viewport.fps = settings.fps.round().clamp(1.0, 240.0) as u32;
        viewport.helper_passes = settings.helper_passes_enabled;
        if !settings.post_process_enabled {
            viewport.tone_mapping = SceneToneMapping::None;
            viewport.post_process = ViewportPostProcess::default();
        }
        viewport
    }
}

fn stream_options_to_viewport_descriptor(
    opts: &SceneStreamOptions,
    fps: f64,
) -> ApiResult<ViewportDescriptor> {
    Ok(ViewportDescriptor {
        viewport_id: opts.viewport_id.clone(),
        scene_id: opts.scene_id.clone(),
        render_mode: parse_render_mode(&opts.render_mode)?,
        debug_view: opts.debug_view.as_deref().and_then(parse_debug_view),
        fps: fps.round().clamp(1.0, 240.0) as u32,
        color_space: parse_color_space(&opts.color_space),
        tone_mapping: parse_tone_mapping(&opts.tone_mapping),
        post_process: parse_post_process(opts.post_process.as_ref()),
        layer_mask: opts.layer_mask,
        work_mode: parse_work_mode(&opts.work_mode),
        helper_passes: opts.helper_passes_enabled,
        lookdev: opts
            .lookdev
            .as_ref()
            .map(parse_lookdev_settings)
            .transpose()?,
    })
}

fn parse_render_mode(value: &str) -> ApiResult<ViewportRenderMode> {
    match value {
        "pbr" => Ok(ViewportRenderMode::Pbr),
        "clay" => Ok(ViewportRenderMode::Clay),
        "wireframe" => Ok(ViewportRenderMode::Wireframe),
        "unlit" => Ok(ViewportRenderMode::Unlit),
        "normal" => Ok(ViewportRenderMode::Normal),
        "depth" => Ok(ViewportRenderMode::Depth),
        "light-complexity" | "lightComplexity" => Ok(ViewportRenderMode::LightComplexity),
        "shadow-atlas" | "shadowAtlas" => Ok(ViewportRenderMode::ShadowAtlas),
        other => Err(ApiError::InvalidRequest(format!(
            "unsupported renderMode for scenes:stream: {other}"
        ))),
    }
}

fn parse_lookdev_settings(options: &SceneStreamLookDevOptions) -> ApiResult<ViewportLookDevSettings> {
    Ok(ViewportLookDevSettings {
        render_mode: parse_render_mode(&options.render_mode)?,
        debug_view: options.debug_view.as_deref().and_then(parse_debug_view),
        material_override: options
            .material_override
            .as_ref()
            .map(parse_material_override),
        helper_passes_enabled: options.helper_passes_enabled,
        show_grid: options.show_grid,
        show_skeleton: options.show_skeleton,
        show_normals: options.show_normals,
    })
}

fn parse_material_override(
    options: &SceneStreamMaterialOverrideOptions,
) -> ViewportMaterialOverride {
    ViewportMaterialOverride {
        kind: match options.kind.as_str() {
            "clay" => ViewportMaterialOverrideKind::Clay,
            "matcap" => ViewportMaterialOverrideKind::Matcap,
            _ => ViewportMaterialOverrideKind::None,
        },
        color: options
            .color
            .map(|color| glam::Vec3::new(color.x, color.y, color.z)),
        roughness: options.roughness,
        metallic: options.metallic,
        preserve_alpha: options.preserve_alpha,
    }
}

fn render_mode_to_str(mode: ViewportRenderMode) -> &'static str {
    match mode {
        ViewportRenderMode::Pbr => "pbr",
        ViewportRenderMode::Clay => "clay",
        ViewportRenderMode::Wireframe => "wireframe",
        ViewportRenderMode::Unlit => "unlit",
        ViewportRenderMode::Normal => "normal",
        ViewportRenderMode::Depth => "depth",
        ViewportRenderMode::LightComplexity => "lightComplexity",
        ViewportRenderMode::ShadowAtlas => "shadowAtlas",
    }
}

fn debug_view_to_str(debug_view: ViewportDebugView) -> &'static str {
    match debug_view {
        ViewportDebugView::Albedo => "albedo",
        ViewportDebugView::Roughness => "roughness",
        ViewportDebugView::Metallic => "metallic",
        ViewportDebugView::Ao => "ao",
        ViewportDebugView::Uv => "uv",
        ViewportDebugView::Overdraw => "overdraw",
    }
}

fn lookdev_to_json(settings: &ViewportLookDevSettings) -> Value {
    let mut value = serde_json::json!({
        "renderMode": render_mode_to_str(settings.render_mode),
    });
    if let Some(debug_view) = settings.debug_view {
        value["debugView"] = serde_json::json!(debug_view_to_str(debug_view));
    }
    if let Some(material_override) = &settings.material_override {
        value["materialOverride"] = material_override_to_json(material_override);
    }
    if let Some(helper_passes_enabled) = settings.helper_passes_enabled {
        value["helperPassesEnabled"] = serde_json::json!(helper_passes_enabled);
    }
    if let Some(show_grid) = settings.show_grid {
        value["showGrid"] = serde_json::json!(show_grid);
    }
    if let Some(show_skeleton) = settings.show_skeleton {
        value["showSkeleton"] = serde_json::json!(show_skeleton);
    }
    if let Some(show_normals) = settings.show_normals {
        value["showNormals"] = serde_json::json!(show_normals);
    }
    value
}

fn material_override_to_json(material_override: &ViewportMaterialOverride) -> Value {
    let kind = match material_override.kind {
        ViewportMaterialOverrideKind::None => "none",
        ViewportMaterialOverrideKind::Clay => "clay",
        ViewportMaterialOverrideKind::Matcap => "matcap",
    };
    let mut value = serde_json::json!({ "kind": kind });
    if let Some(color) = material_override.color {
        value["color"] = serde_json::json!({
            "x": color.x,
            "y": color.y,
            "z": color.z
        });
    }
    if let Some(roughness) = material_override.roughness {
        value["roughness"] = serde_json::json!(roughness);
    }
    if let Some(metallic) = material_override.metallic {
        value["metallic"] = serde_json::json!(metallic);
    }
    if let Some(preserve_alpha) = material_override.preserve_alpha {
        value["preserveAlpha"] = serde_json::json!(preserve_alpha);
    }
    value
}

fn parse_debug_view(value: &str) -> Option<ViewportDebugView> {
    match value {
        "albedo" => Some(ViewportDebugView::Albedo),
        "roughness" => Some(ViewportDebugView::Roughness),
        "metallic" => Some(ViewportDebugView::Metallic),
        "ao" => Some(ViewportDebugView::Ao),
        "uv" => Some(ViewportDebugView::Uv),
        "overdraw" => Some(ViewportDebugView::Overdraw),
        _ => None,
    }
}

fn parse_tone_mapping(value: &str) -> SceneToneMapping {
    match value {
        "reinhard" => SceneToneMapping::Reinhard,
        "none" => SceneToneMapping::None,
        _ => SceneToneMapping::Aces,
    }
}

fn parse_color_space(value: &str) -> SceneColorSpace {
    match value {
        "rec709" => SceneColorSpace::Rec709,
        "p3" => SceneColorSpace::P3,
        _ => SceneColorSpace::Srgb,
    }
}

fn parse_work_mode(value: &str) -> ViewportWorkMode {
    match value {
        "edit-free" | "editFree" => ViewportWorkMode::EditFree,
        "pose" => ViewportWorkMode::Pose,
        "render-preview" | "renderPreview" => ViewportWorkMode::RenderPreview,
        "lookdev" => ViewportWorkMode::Lookdev,
        _ => ViewportWorkMode::EditParametric,
    }
}

fn parse_camera_ref_to_params(value: Option<&Value>) -> Option<CameraParams> {
    let value = value?;
    let kind = value.get("kind")?.as_str()?;
    if kind != "editorCamera" {
        return None;
    }
    let rig = value.get("rig")?;
    let pos = rig.get("position")?;
    let tgt = rig.get("target")?;
    let position = glam::Vec3::new(
        pos.get("x")?.as_f64()? as f32,
        pos.get("y")?.as_f64()? as f32,
        pos.get("z")?.as_f64()? as f32,
    );
    let target = glam::Vec3::new(
        tgt.get("x")?.as_f64()? as f32,
        tgt.get("y")?.as_f64()? as f32,
        tgt.get("z")?.as_f64()? as f32,
    );
    let up = rig.get("up").and_then(|u| {
        Some(glam::Vec3::new(
            u.get("x")?.as_f64()? as f32,
            u.get("y")?.as_f64()? as f32,
            u.get("z")?.as_f64()? as f32,
        ))
    });
    let fov_y = rig
        .get("fov")
        .and_then(|f| f.as_f64())
        .map(|f| (f as f32).to_radians());
    Some(CameraParams {
        position,
        target,
        up: up.unwrap_or(glam::Vec3::Y),
        fov_y: fov_y.unwrap_or(45.0_f32.to_radians()),
        ..CameraParams::default()
    })
}

fn parse_post_process(value: Option<&Value>) -> ViewportPostProcess {
    let Some(value) = value else {
        return ViewportPostProcess::default();
    };
    ViewportPostProcess {
        bloom: value.get("bloom").and_then(Value::as_bool).unwrap_or(false),
        ssao: value.get("ssao").and_then(Value::as_bool).unwrap_or(false),
        taa: value.get("taa").and_then(Value::as_bool).unwrap_or(false),
    }
}

fn spawn_scene_stream_producer(
    stream_registry: Arc<StreamRegistry>,
    scene_service: Arc<dyn ISceneService>,
    model_preview_controller: Option<Arc<ModelPreviewController>>,
    stream_id: StreamId,
    config: SceneStreamProducerConfig,
    cancel_token: CancellationToken,
) {
    tokio::spawn(async move {
        let runtime_scheduler = SceneStreamRuntimeScheduler::new(&config);
        let mut hysteresis = DegradationHysteresis::default();
        let mut load = FrameLoadSample::default();
        let mut control_ack = ControlAckHealthSample::default();
        let mut settings = runtime_scheduler.settings(0, load, control_ack);
        let mut frame_id = 0u64;
        let mut next_pts_us = 0i64;
        let stream_frame_duration = settings.frame_duration();
        let stream_duration_us = settings.duration_us();
        let mut next_frame_at = Instant::now();
        let mut last_sink_config: Option<PreviewPipelineConfig> = None;
        let mut stream_sink = match stream_registry.get_sender(&stream_id).await {
            Some(tx) => match scene_stream_sink_config(settings) {
                Ok(sink_config) => match StreamSink::new(sink_config.clone(), tx) {
                    Ok(sink) => {
                        last_sink_config = Some(sink_config);
                        Some(sink)
                    }
                    Err(err) => {
                        tracing::warn!(
                            "Scene stream {} GPU sink unavailable, using legacy H.264 path: {}",
                            stream_id.as_str(),
                            err
                        );
                        None
                    }
                },
                Err(err) => {
                    tracing::warn!(
                        "Scene stream {} GPU sink config unavailable, using legacy H.264 path: {}",
                        stream_id.as_str(),
                        err
                    );
                    None
                }
            },
            None => None,
        };

        loop {
            let now = Instant::now();
            let delay = next_frame_at.saturating_duration_since(now);
            tokio::select! {
                _ = cancel_token.cancelled() => break,
                _ = tokio::time::sleep(delay) => {
                    let frame_started = Instant::now();
                    let service = Arc::clone(&scene_service);
                    let camera = service.get_editor_camera();
                    let pts_us = next_pts_us;
                    let output_size = (settings.width, settings.height);
                    let duration_us = stream_duration_us;
                    let quality = settings.h264_quality;
                    let viewport = runtime_scheduler.viewport_descriptor_for_settings(settings);
                    let preview_camera = model_preview_controller
                        .as_ref()
                        .and_then(|controller| {
                            controller.camera_for_viewport(&viewport.scene_id, &viewport.viewport_id)
                        });
                    let render_camera = preview_camera.or(camera);
                    let frame_meta = scene_stream_render_frame_meta(
                        &stream_id,
                        &config,
                        &viewport,
                        frame_id,
                        pts_us,
                        duration_us,
                        load.dropped_frames,
                        model_preview_controller.as_deref(),
                    );
                    if let Some(sink) = stream_sink.as_ref() {
                        if let Ok(sink_config) = scene_stream_sink_config(settings) {
                            if last_sink_config.as_ref() != Some(&sink_config) {
                                tracing::info!(
                                    "Scene stream {} GPU sink reconfigure ({}x{} @ {:.1}fps, {}bps, gop={})",
                                    stream_id.as_str(),
                                    sink_config.width,
                                    sink_config.height,
                                    sink_config.fps,
                                    sink_config.bitrate,
                                    sink_config.gop_size
                                );
                                if let Err(err) = sink.reconfigure(sink_config.clone()) {
                                    tracing::warn!(
                                        "Scene stream {} GPU sink reconfigure failed, using legacy H.264 path: {}",
                                        stream_id.as_str(),
                                        err
                                    );
                                    stream_sink = None;
                                    last_sink_config = None;
                                } else {
                                    last_sink_config = Some(sink_config);
                                }
                            }
                        }
                    }

                    let gpu_submitted = if let Some(sink) = stream_sink.as_ref() {
                        let gpu_output = tokio::task::spawn_blocking({
                            let service = Arc::clone(&service);
                            let camera = render_camera.clone();
                            let viewport = viewport.clone();
                            let meta = frame_meta.clone();
                            move || {
                                let mut output = service.render_scene_stream_gpu_output(
                                    output_size,
                                    camera.as_ref(),
                                    None,
                                    pts_us,
                                    duration_us,
                                    frame_id,
                                    &viewport,
                                    load.dropped_frames,
                                )?;
                                if let neko_engine_types::PipelineOutput::Video(
                                    neko_engine_types::VideoOutput::GpuFrame(frame),
                                ) = &mut output
                                {
                                    frame.meta = Some(meta);
                                }
                                Ok::<_, neko_engine_kernel::error::Error>(output)
                            }
                        })
                        .await;

                        match gpu_output {
                            Ok(Ok(output)) => {
                                match sink.submit(output) {
                                    Ok(()) => true,
                                    Err(err) => {
                                        tracing::warn!(
                                            "Scene stream {} GPU sink submit failed, using legacy H.264 path: {}",
                                            stream_id.as_str(),
                                            err
                                        );
                                        stream_sink = None;
                                        false
                                    }
                                }
                            }
                            Ok(Err(err)) => {
                                tracing::warn!(
                                    "Scene stream {} GPU frame output unavailable, using legacy H.264 path: {}",
                                    stream_id.as_str(),
                                    err
                                );
                                stream_sink = None;
                                false
                            }
                            Err(err) => {
                                tracing::warn!("Scene stream {} GPU task failed: {}", stream_id.as_str(), err);
                                break;
                            }
                        }
                    } else {
                        false
                    };

                    if !gpu_submitted {
                        let meta = frame_meta;
                        let frame = tokio::task::spawn_blocking(move || {
                            let mut frame = service.capture_h264_keyframe(
                                output_size,
                                render_camera.as_ref(),
                                None,
                                quality,
                                pts_us,
                                duration_us,
                                &viewport,
                            )?;
                            frame.meta = Some(meta);
                            Ok::<_, neko_engine_kernel::error::Error>(frame)
                        })
                        .await;

                        match frame {
                            Ok(Ok(frame)) => {
                                match stream_registry.send_frame(&stream_id, frame).await {
                                    Ok(_) => {}
                                    Err(crate::registry::StreamStateError::NoReceivers(_)) => {}
                                    Err(crate::registry::StreamStateError::NotFound(_)) => break,
                                    Err(err) => {
                                        tracing::warn!("Scene stream {} send failed: {}", stream_id.as_str(), err);
                                        break;
                                    }
                                }
                            }
                            Ok(Err(err)) => {
                                tracing::warn!("Scene stream {} frame production stopped: {}", stream_id.as_str(), err);
                                break;
                            }
                            Err(err) => {
                                tracing::warn!("Scene stream {} task failed: {}", stream_id.as_str(), err);
                                break;
                            }
                        }
                    }

                    let elapsed_ms = frame_started.elapsed().as_secs_f32() * 1000.0;
                    let schedule_lag = frame_started.saturating_duration_since(next_frame_at);
                    next_frame_at = next_frame_at
                        .checked_add(stream_frame_duration)
                        .unwrap_or_else(Instant::now);
                    let post_frame_lag = Instant::now().saturating_duration_since(next_frame_at);
                    let mut skipped_intervals = 0u32;
                    if post_frame_lag >= stream_frame_duration {
                        skipped_intervals = (post_frame_lag.as_nanos()
                            / stream_frame_duration.as_nanos().max(1))
                        .min(u32::MAX as u128) as u32;
                        let skip_duration = stream_frame_duration
                            .checked_mul(skipped_intervals)
                            .unwrap_or_default();
                        next_frame_at = next_frame_at
                            .checked_add(skip_duration)
                            .unwrap_or_else(Instant::now);
                    }
                    let dropped_frames = dropped_frames_for_elapsed(elapsed_ms, stream_frame_duration)
                        .saturating_add(dropped_frames_for_elapsed(
                            schedule_lag.as_secs_f32() * 1000.0,
                            stream_frame_duration,
                        ));
                    load = FrameLoadSample {
                        gpu_frame_ms: elapsed_ms,
                        encode_ms: 0.0,
                        dropped_frames,
                    };
                    control_ack = scene_service.control_ack_health_sample(dropped_frames);
                    let auxiliary_viewport_count = stream_registry
                        .get_session_streams(&config.session_id)
                        .await
                        .len()
                        .saturating_sub(1);
                    let next_settings =
                        runtime_scheduler.settings_stabilized(auxiliary_viewport_count, load, control_ack, &mut hysteresis);
                    if next_settings.quality_tier != settings.quality_tier {
                        tracing::info!(
                            "Scene stream {} quality tier changed to {} ({}x{} @ {:.1}fps, control_ack_preserved={})",
                            stream_id.as_str(),
                            next_settings.quality_tier.as_str(),
                            next_settings.width,
                            next_settings.height,
                            next_settings.fps,
                            next_settings.preserve_control_ack
                        );
                    }
                    settings = next_settings;
                    frame_id = frame_id.saturating_add(1);
                    let pts_intervals = i64::from(skipped_intervals).saturating_add(1);
                    next_pts_us =
                        next_pts_us.saturating_add(stream_duration_us.saturating_mul(pts_intervals));
                    let now = Instant::now();
                    if next_frame_at < now {
                        next_frame_at = now;
                    }
                }
            }
        }
    });
}

fn scene_stream_sink_config(
    settings: SceneStreamRuntimeSettings,
) -> neko_engine_kernel::error::Result<PreviewPipelineConfig> {
    Ok(PreviewPipelineConfig {
        width: settings.width,
        height: settings.height,
        fps: settings.fps,
        bitrate: scene_stream_bitrate(settings),
        gop_size: scene_stream_gop_size(settings.fps),
    })
}

fn scene_stream_render_frame_meta(
    stream_id: &StreamId,
    config: &SceneStreamProducerConfig,
    viewport: &ViewportDescriptor,
    frame_id: u64,
    pts_us: i64,
    duration_us: i64,
    dropped_frames_since_last: u32,
    model_preview_controller: Option<&ModelPreviewController>,
) -> RenderFrameMeta {
    let active_preview_mode = model_preview_controller
        .and_then(|controller| {
            controller.active_preview_mode(&viewport.scene_id, &viewport.viewport_id)
        })
        .and_then(|mode| serde_json::to_value(mode).ok())
        .and_then(|value| value.as_str().map(str::to_string));
    let preview_playback_clock_ms = model_preview_controller.and_then(|controller| {
        controller.playback_clock_ms(&viewport.scene_id, &viewport.viewport_id)
    });

    RenderFrameMeta {
        stream_id: stream_id.as_str().to_string(),
        viewport_id: viewport.viewport_id.clone(),
        frame_id,
        pts_us: pts_us.max(0) as u64,
        duration_us: duration_us.max(0) as u64,
        is_keyframe: true,
        scene_revision: config.initial_revision,
        applied_seq: config.initial_applied_seq,
        diagnostics: Some(RenderFrameDiagnostics {
            render_path: GpuRenderPath::LegacyCpu,
            dropped_frames_since_last,
            ..RenderFrameDiagnostics::default()
        }),
        scene_id: Some(viewport.scene_id.clone()),
        frame_timestamp: pts_us.max(0) as f64 / 1_000_000.0,
        view_transform: [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
        projection_json: None,
        active_preview_mode,
        preview_playback_clock_ms,
    }
}

fn scene_stream_bitrate(settings: SceneStreamRuntimeSettings) -> u64 {
    let pixels = (settings.width as u64).saturating_mul(settings.height as u64);
    let fps_scale = (normalize_stream_fps(settings.fps) / 30.0).clamp(0.5, 2.0);
    let target = (pixels as f64
        * SCENE_STREAM_TARGET_BITS_PER_PIXEL as f64
        * fps_scale
        * (settings.h264_quality as f64 / 85.0))
        .round() as u64;
    target.clamp(SCENE_STREAM_MIN_BITRATE_BPS, SCENE_STREAM_MAX_BITRATE_BPS)
}

fn scene_stream_gop_size(fps: f64) -> u32 {
    (normalize_stream_fps(fps) * SCENE_STREAM_LOW_LATENCY_GOP_SECONDS)
        .round()
        .clamp(1.0, 60.0) as u32
}

fn dropped_frames_for_elapsed(elapsed_ms: f32, frame_duration: Duration) -> u32 {
    let budget_ms = frame_duration.as_secs_f32() * 1000.0;
    if budget_ms <= 0.0 || elapsed_ms <= budget_ms {
        return 0;
    }
    (elapsed_ms / budget_ms).floor() as u32
}

impl Controller for ScenesController {
    async fn handle(
        &self,
        action: &str,
        _resource_id: Option<&str>,
        options: Value,
        _body: Option<Value>,
    ) -> ApiResult<ActionResponse> {
        if !self.actions().contains(&action) {
            return Err(ApiError::UnknownAction {
                group: self.group().to_string(),
                action: action.to_string(),
            });
        }

        match action {
            "load" => {
                #[derive(Debug, Deserialize, Default)]
                #[serde(rename_all = "camelCase")]
                struct LoadOptions {
                    source: Option<String>,
                    #[serde(default)]
                    source_ref: Option<FileSourceRef>,
                }
                let opts: LoadOptions = serde_json::from_value(options).unwrap_or_default();
                let source = if let Some(files) = &self.file_access_registry {
                    resolve_file_source_ref(
                        files,
                        opts.source_ref.as_ref(),
                        opts.source.as_deref(),
                        "scenes:load",
                    )?
                } else {
                    opts.source.map(Into::into).ok_or_else(|| {
                        ApiError::InvalidRequest("source path required".to_string())
                    })?
                };

                let service = self.service()?;
                let snapshot = service
                    .load_model(source.as_path())
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok(
                    "",
                    serde_json::to_value(snapshot)
                        .map_err(|e| ApiError::SerializationError(e.to_string()))?,
                ))
            }

            "graph" | "snapshot" => {
                let service = self.service()?;
                let snapshot = service
                    .get_snapshot()
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok(
                    "",
                    serde_json::to_value(snapshot)
                        .map_err(|e| ApiError::SerializationError(e.to_string()))?,
                ))
            }

            "transform" => {
                #[derive(Debug, Deserialize)]
                struct TransformOptions {
                    node_id: String,
                    position: [f32; 3],
                    rotation: [f32; 4],
                    scale: [f32; 3],
                }
                let opts: TransformOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                service
                    .update_transform(&opts.node_id, opts.position, opts.rotation, opts.scale)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok("", Value::Null))
            }

            "animate" => {
                let service = self.service()?;
                let clips = service
                    .get_animation_clips()
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok(
                    "",
                    serde_json::to_value(clips)
                        .map_err(|e| ApiError::SerializationError(e.to_string()))?,
                ))
            }

            "tick" => {
                #[derive(Debug, Deserialize, Default)]
                struct TickOptions {
                    clip_name: Option<String>,
                    time: Option<f32>,
                }
                let opts: TickOptions = serde_json::from_value(options).unwrap_or_default();
                let clip_name = opts
                    .clip_name
                    .ok_or_else(|| ApiError::InvalidRequest("clip_name required".to_string()))?;
                let time = opts.time.unwrap_or(0.0);

                let service = self.service()?;
                let delta = service
                    .tick(&clip_name, time)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok(
                    "",
                    serde_json::to_value(delta)
                        .map_err(|e| ApiError::SerializationError(e.to_string()))?,
                ))
            }

            "latency_test" => {
                // Immediately return success for latency measurement
                // No service call needed - just echo back
                Ok(ActionResponse::ok("", Value::Null))
            }

            "capture" => {
                #[derive(Debug, Deserialize, Default)]
                #[serde(rename_all = "camelCase")]
                struct CaptureOptions {
                    width: Option<u32>,
                    height: Option<u32>,
                    clip_name: Option<String>,
                    time: Option<f32>,
                    quality: Option<u8>,
                    background_color: Option<[f32; 4]>,
                    camera_override: Option<CameraOverrideOptions>,
                }
                #[derive(Debug, Deserialize)]
                #[serde(rename_all = "camelCase")]
                struct CameraOverrideOptions {
                    position: [f32; 3],
                    target: [f32; 3],
                    #[serde(default = "default_up")]
                    up: [f32; 3],
                    #[serde(default = "default_fov")]
                    fov_y: f32,
                }
                fn default_up() -> [f32; 3] {
                    [0.0, 1.0, 0.0]
                }
                fn default_fov() -> f32 {
                    45.0_f32.to_radians()
                }

                let opts: CaptureOptions = serde_json::from_value(options).unwrap_or_default();
                let width = opts.width.unwrap_or(1920);
                let height = opts.height.unwrap_or(1080);
                let time = opts.time.unwrap_or(0.0);
                let quality = opts.quality.unwrap_or(90);

                let camera = opts.camera_override.map(|c| CameraParams {
                    position: glam::Vec3::from(c.position),
                    target: glam::Vec3::from(c.target),
                    up: glam::Vec3::from(c.up),
                    fov_y: c.fov_y,
                    ..CameraParams::default()
                });

                let service = self.service()?;
                let frame = service
                    .capture_display_frame(
                        opts.clip_name.as_deref(),
                        time,
                        (width, height),
                        camera.as_ref(),
                        opts.background_color,
                        quality,
                    )
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;
                let data = base64_encode(&frame.data);
                let mime_type = "image/jpeg";
                let data_url = format!("data:{mime_type};base64,{data}");

                Ok(ActionResponse::ok(
                    "",
                    serde_json::json!({
                        "width": frame.width,
                        "height": frame.height,
                        "format": "jpeg",
                        "mimeType": mime_type,
                        "encoding": "base64",
                        "data": data,
                        "dataUrl": data_url,
                        "status": "captured"
                    }),
                ))
            }

            "composite" => {
                // Internal pipeline call — returns render stats
                let service = self.service()?;
                let _output = service
                    .render_frame(None, 0.0, (1920, 1080), None, None)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok(
                    "",
                    serde_json::json!({ "status": "composited" }),
                ))
            }

            "stream" => {
                let opts = parse_scene_stream_options(options)?;
                if opts.viewport_id.trim().is_empty() {
                    return Err(ApiError::InvalidRequest(
                        "viewportId required for scenes:stream".to_string(),
                    ));
                }

                let width = normalize_stream_dimension(
                    opts.resolution.as_ref().map(|r| r.width).unwrap_or(1280),
                    1280,
                );
                let height = normalize_stream_dimension(
                    opts.resolution.as_ref().map(|r| r.height).unwrap_or(720),
                    720,
                );
                let fps = normalize_stream_fps(opts.fps);
                let viewport_descriptor = stream_options_to_viewport_descriptor(&opts, fps)?;
                let scene_revision = self.service()?.current_revision()?;
                let producer_config = SceneStreamProducerConfig {
                    session_id: format!("scene-{}", opts.scene_id),
                    viewport: viewport_descriptor.clone(),
                    width,
                    height,
                    fps,
                    initial_revision: scene_revision,
                    initial_applied_seq: 0,
                };
                let initial_runtime = SceneStreamRuntimeScheduler::new(&producer_config).settings(
                    0,
                    FrameLoadSample::default(),
                    ControlAckHealthSample::default(),
                );
                let stream_registry = self.stream_registry()?;
                let session_id = producer_config.session_id.clone();
                let resource_id = scene_stream_resource_id(&opts.scene_id, &opts.viewport_id);
                let stream_config = StreamConfig {
                    resolution: Resolution::new(width, height),
                    fps,
                    start_time: 0.0,
                    codec: StreamCodec::H264,
                    initial_paused: false,
                };

                let (stream_id, _rx) = stream_registry
                    .create_stream(&session_id, &resource_id, stream_config)
                    .await;
                stream_registry.activate(&stream_id).await.map_err(|e| {
                    ApiError::ServiceError(format!(
                        "Failed to activate scene stream {}: {}",
                        stream_id.as_str(),
                        e
                    ))
                })?;

                let cancel_token = CancellationToken::new();
                stream_registry
                    .set_cancel_token(&stream_id, cancel_token.clone())
                    .await;

                if let Some(scene_service) = self.scene_service.clone() {
                    if let Some(camera) = parse_camera_ref_to_params(opts.camera_ref.as_ref()) {
                        scene_service.set_editor_camera(camera);
                    }
                    spawn_scene_stream_producer(
                        stream_registry,
                        scene_service,
                        self.model_preview_controller.clone(),
                        stream_id.clone(),
                        producer_config.clone(),
                        cancel_token,
                    );
                }

                Ok(ActionResponse::ok(
                    "",
                    serde_json::json!({
                        "streamId": stream_id.as_str(),
                        "viewportId": opts.viewport_id,
                        "container": "h264-annexb",
                        "codecString": "avc1.42001f",
                        "profile": "baseline",
                        "level": "3.1",
                        "frameHeader": "neko-h264-v1",
                        "width": width,
                        "height": height,
                        "fps": fps,
                        "colorSpace": opts.color_space,
                        "bitDepth": 8,
                        "toneMapping": opts.tone_mapping,
                        "gopSize": 1,
                        "initialRevision": scene_revision,
                        "renderMode": render_mode_to_str(viewport_descriptor.render_mode),
                        "debugView": viewport_descriptor.debug_view.map(debug_view_to_str),
                        "lookdev": viewport_descriptor.lookdev.as_ref().map(lookdev_to_json),
                        "workMode": opts.work_mode,
                        "layerMask": opts.layer_mask,
                        "cameraRef": opts.camera_ref,
                        "postProcess": opts.post_process,
                        "qualityTier": initial_runtime.quality_tier.as_str(),
                        "scheduledFps": initial_runtime.fps,
                        "scheduledWidth": initial_runtime.width,
                        "scheduledHeight": initial_runtime.height,
                        "helperPassesEnabled": initial_runtime.helper_passes_enabled,
                        "postProcessEnabled": initial_runtime.post_process_enabled,
                        "controlAckPreserved": initial_runtime.preserve_control_ack
                    }),
                ))
            }

            "create_shape" => {
                let service = self.service()?;
                let snapshot = service
                    .create_shape(options)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok(
                    "Shape created",
                    serde_json::to_value(snapshot)
                        .map_err(|e| ApiError::SerializationError(e.to_string()))?,
                ))
            }

            "create_text" => {
                let service = self.service()?;
                let snapshot = service
                    .create_text_mesh(options)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok(
                    "Text mesh created",
                    serde_json::to_value(snapshot)
                        .map_err(|e| ApiError::SerializationError(e.to_string()))?,
                ))
            }

            "csg_boolean" => {
                #[derive(Debug, Deserialize)]
                struct CsgOptions {
                    entity_a: String,
                    entity_b: String,
                    operation: String,
                }
                let opts: CsgOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                let snapshot = service
                    .csg_boolean(&opts.entity_a, &opts.entity_b, &opts.operation)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok(
                    "CSG operation complete",
                    serde_json::to_value(snapshot)
                        .map_err(|e| ApiError::SerializationError(e.to_string()))?,
                ))
            }

            "export_gltf" => {
                let service = self.service()?;
                let glb_data = service
                    .export_glb()
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                // Return GLB as base64-encoded string
                use base64::Engine;
                let encoded = base64::engine::general_purpose::STANDARD.encode(&glb_data);

                Ok(ActionResponse::ok(
                    "GLB exported",
                    serde_json::json!({
                        "format": "glb",
                        "encoding": "base64",
                        "data": encoded,
                        "byteLength": glb_data.len()
                    }),
                ))
            }

            "save_project" => {
                #[derive(Debug, Deserialize)]
                #[serde(rename_all = "camelCase")]
                struct SaveOptions {
                    path: String,
                    editor_state: Option<serde_json::Value>,
                }
                let opts: SaveOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                service
                    .save_project(
                        &opts.path,
                        opts.editor_state.unwrap_or(serde_json::Value::Null),
                    )
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok(
                    "Project saved",
                    serde_json::json!({ "path": opts.path }),
                ))
            }

            "load_project" => {
                #[derive(Debug, Deserialize)]
                struct LoadProjectOptions {
                    path: String,
                }
                let opts: LoadProjectOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                let (snapshot, editor_state) = service
                    .load_project(&opts.path)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok(
                    "Project loaded",
                    serde_json::json!({
                        "snapshot": serde_json::to_value(&snapshot)
                            .map_err(|e| ApiError::SerializationError(e.to_string()))?,
                        "editorState": editor_state
                    }),
                ))
            }

            "keyframe_tracks" => {
                #[derive(Debug, Deserialize)]
                struct KeyframeTracksOptions {
                    clip_name: String,
                }
                let opts: KeyframeTracksOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                let tracks = service
                    .get_keyframe_tracks(&opts.clip_name)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok(
                    "",
                    serde_json::to_value(tracks)
                        .map_err(|e| ApiError::SerializationError(e.to_string()))?,
                ))
            }

            "keyframe_add" => {
                #[derive(Debug, Deserialize)]
                struct KeyframeAddOptions {
                    clip_name: String,
                    node_id: String,
                    property: String,
                    timestamp: f32,
                    values: Vec<f32>,
                }
                let opts: KeyframeAddOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                let id = service
                    .add_keyframe(
                        &opts.clip_name,
                        &opts.node_id,
                        &opts.property,
                        opts.timestamp,
                        opts.values,
                    )
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok(
                    "",
                    serde_json::to_value(serde_json::json!({ "id": id }))
                        .map_err(|e| ApiError::SerializationError(e.to_string()))?,
                ))
            }

            "keyframe_remove" => {
                #[derive(Debug, Deserialize)]
                struct KeyframeRemoveOptions {
                    clip_name: String,
                    keyframe_id: String,
                }
                let opts: KeyframeRemoveOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                service
                    .remove_keyframe(&opts.clip_name, &opts.keyframe_id)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok("", Value::Null))
            }

            "keyframe_update" => {
                #[derive(Debug, Deserialize)]
                struct KeyframeUpdateOptions {
                    clip_name: String,
                    keyframe_id: String,
                    timestamp: Option<f32>,
                    values: Option<Vec<f32>>,
                    easing: Option<String>,
                }
                let opts: KeyframeUpdateOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let easing = opts
                    .easing
                    .map(|s| neko_engine_types::easing::EasingType::from_name(&s));

                let service = self.service()?;
                service
                    .update_keyframe(
                        &opts.clip_name,
                        &opts.keyframe_id,
                        opts.timestamp,
                        opts.values,
                        easing,
                    )
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok("", Value::Null))
            }

            "clip_create" => {
                #[derive(Debug, Deserialize)]
                struct ClipCreateOptions {
                    name: String,
                    duration: f32,
                }
                let opts: ClipCreateOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                service
                    .create_clip(&opts.name, opts.duration)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok("", Value::Null))
            }

            "anim_crossfade" => {
                #[derive(Debug, Deserialize)]
                struct CrossfadeOptions {
                    clip_name: String,
                    fade_duration: f32,
                    #[serde(default)]
                    loop_anim: bool,
                }
                let opts: CrossfadeOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                service
                    .crossfade_animation(&opts.clip_name, opts.fade_duration, opts.loop_anim)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok("", Value::Null))
            }

            "blend_weight" => {
                #[derive(Debug, Deserialize)]
                struct BlendWeightOptions {
                    clip_name: String,
                    weight: f32,
                }
                let opts: BlendWeightOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                service
                    .set_blend_weight(&opts.clip_name, opts.weight)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok("", Value::Null))
            }

            "blend_state" => {
                let service = self.service()?;
                let state = service
                    .get_blend_state()
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok(
                    "",
                    serde_json::to_value(state)
                        .map_err(|e| ApiError::SerializationError(e.to_string()))?,
                ))
            }

            "ik_create" => {
                #[derive(Debug, Deserialize)]
                struct IkCreateOptions {
                    root_joint: String,
                    end_effector: String,
                    solver: Option<String>,
                    iterations: Option<u32>,
                    tolerance: Option<f32>,
                }
                let opts: IkCreateOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                let id = service
                    .create_ik_chain(
                        &opts.root_joint,
                        &opts.end_effector,
                        opts.solver.as_deref().unwrap_or("fabrik"),
                        opts.iterations.unwrap_or(10),
                        opts.tolerance.unwrap_or(0.001),
                    )
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok("", serde_json::json!({ "id": id })))
            }

            "ik_remove" => {
                #[derive(Debug, Deserialize)]
                struct IkRemoveOptions {
                    chain_id: String,
                }
                let opts: IkRemoveOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                service
                    .remove_ik_chain(&opts.chain_id)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok("", Value::Null))
            }

            "ik_target" => {
                #[derive(Debug, Deserialize)]
                struct IkTargetOptions {
                    chain_id: String,
                    position: [f32; 3],
                    rotation: Option<[f32; 4]>,
                    pole: Option<[f32; 3]>,
                }
                let opts: IkTargetOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                service
                    .set_ik_target(&opts.chain_id, opts.position, opts.rotation, opts.pole)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok("", Value::Null))
            }

            "ik_enable" => {
                #[derive(Debug, Deserialize)]
                struct IkEnableOptions {
                    chain_id: String,
                    enabled: bool,
                }
                let opts: IkEnableOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                service
                    .set_ik_enabled(&opts.chain_id, opts.enabled)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok("", Value::Null))
            }

            "ik_list" => {
                let service = self.service()?;
                let chains = service
                    .get_ik_chains()
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok(
                    "",
                    serde_json::to_value(chains)
                        .map_err(|e| ApiError::SerializationError(e.to_string()))?,
                ))
            }

            "set_visible" => {
                #[derive(Debug, Deserialize)]
                struct SetVisibleOptions {
                    node_id: String,
                    visible: bool,
                }
                let opts: SetVisibleOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                service
                    .set_visible(&opts.node_id, opts.visible)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok("", Value::Null))
            }

            "morph_weights" => {
                #[derive(Debug, Deserialize)]
                struct MorphWeightsOptions {
                    node_id: String,
                    weights: Vec<f32>,
                }
                let opts: MorphWeightsOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                service
                    .set_morph_weights(&opts.node_id, opts.weights)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok("", Value::Null))
            }

            "set_face_params" => {
                let params: std::collections::HashMap<String, f32> =
                    serde_json::from_value(options)
                        .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;
                let service = self.service()?;
                service
                    .set_face_params(params)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;
                Ok(ActionResponse::ok("", Value::Null))
            }

            "get_face_params" => {
                let service = self.service()?;
                let params = service
                    .get_face_params()
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;
                Ok(ActionResponse::ok(
                    "",
                    serde_json::to_value(params).unwrap_or_default(),
                ))
            }

            "update_material" => {
                #[derive(Debug, Deserialize)]
                struct UpdateMaterialOptions {
                    node_id: String,
                    base_color: Option<[f32; 4]>,
                    metallic: Option<f32>,
                    roughness: Option<f32>,
                    emissive: Option<[f32; 3]>,
                    occlusion_strength: Option<f32>,
                }
                let opts: UpdateMaterialOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                service
                    .update_material(
                        &opts.node_id,
                        opts.base_color,
                        opts.metallic,
                        opts.roughness,
                        opts.emissive,
                        opts.occlusion_strength,
                    )
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok("", Value::Null))
            }

            "delete_node" => {
                #[derive(Debug, Deserialize)]
                struct DeleteNodeOptions {
                    node_id: String,
                }
                let opts: DeleteNodeOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                service
                    .delete_node(&opts.node_id)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok("", Value::Null))
            }

            "update_camera" => {
                #[derive(Debug, Deserialize)]
                #[serde(rename_all = "camelCase")]
                struct CameraOptions {
                    position: [f32; 3],
                    target: [f32; 3],
                    up: Option<[f32; 3]>,
                    fov_y: Option<f32>,
                }
                let opts: CameraOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                service.set_editor_camera(CameraParams {
                    position: glam::Vec3::from(opts.position),
                    target: glam::Vec3::from(opts.target),
                    up: opts.up.map(glam::Vec3::from).unwrap_or(glam::Vec3::Y),
                    fov_y: opts.fov_y.unwrap_or(45.0_f32.to_radians()),
                    ..CameraParams::default()
                });

                Ok(ActionResponse::ok("", Value::Null))
            }

            "capabilities" => Ok(ActionResponse::ok(
                "",
                serde_json::json!({
                    "renderModes": [
                        "pbr",
                        "clay",
                        "wireframe",
                        "unlit",
                        "normal",
                        "depth",
                        "lightComplexity",
                        "shadowAtlas"
                    ],
                    "liveViewportSettings": false,
                    "clay": true,
                    "authoredLights": false,
                    "environment": false,
                    "typedPicking": false,
                    "characterRegions": false
                }),
            )),

            _ => Err(ApiError::UnknownAction {
                group: self.group().to_string(),
                action: action.to_string(),
            }),
        }
    }

    fn group(&self) -> &'static str {
        registry::groups::SCENES
    }

    fn actions(&self) -> &'static [&'static str] {
        registry::actions::SCENES
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use neko_engine_kernel::facade::ServiceFactory;

    fn create_test_controller() -> ScenesController {
        let services = ServiceFactory::new().create_with_gpu(None);
        ScenesController::new(services.scene_service)
    }

    fn create_stream_test_controller() -> (ScenesController, Arc<StreamRegistry>) {
        let registry = Arc::new(StreamRegistry::new());
        let services = ServiceFactory::new().create_with_gpu(None);
        let model_preview_controller =
            Arc::new(ModelPreviewController::new(services.scene_service.clone()));
        (
            ScenesController::with_stream_registry(
                services.scene_service,
                registry.clone(),
                model_preview_controller,
            ),
            registry,
        )
    }

    fn create_controller_without_service() -> ScenesController {
        ScenesController::new(None)
    }

    #[tokio::test]
    async fn test_scenes_controller_unknown_action() {
        let controller = create_test_controller();
        let result = controller.handle("unknown", None, Value::Null, None).await;
        assert!(result.is_err());
        match result.unwrap_err() {
            ApiError::UnknownAction { group, action } => {
                assert_eq!(group, "scenes");
                assert_eq!(action, "unknown");
            }
            other => panic!("Expected UnknownAction, got: {}", other),
        }
    }

    #[test]
    fn test_scenes_controller_group() {
        let controller = create_test_controller();
        assert_eq!(controller.group(), "scenes");
    }

    #[test]
    fn test_scenes_controller_actions() {
        let controller = create_test_controller();
        let actions = controller.actions();
        assert!(actions.contains(&"load"));
        assert!(actions.contains(&"graph"));
        assert!(actions.contains(&"transform"));
        assert!(actions.contains(&"animate"));
        assert!(actions.contains(&"tick"));
        assert!(actions.contains(&"snapshot"));
        assert!(actions.contains(&"composite"));
        assert!(actions.contains(&"capture"));
        assert!(actions.contains(&"stream"));
        assert!(actions.contains(&"latency_test"));
        assert!(actions.contains(&"create_shape"));
        assert!(actions.contains(&"create_text"));
        assert!(actions.contains(&"csg_boolean"));
        assert!(actions.contains(&"export_gltf"));
        assert!(actions.contains(&"save_project"));
        assert!(actions.contains(&"load_project"));
        assert!(actions.contains(&"capabilities"));
    }

    #[tokio::test]
    async fn test_load_requires_source() {
        let controller = create_test_controller();
        let result = controller.handle("load", None, Value::Null, None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_snapshot_empty_scene() {
        let controller = create_test_controller();
        let result = controller.handle("snapshot", None, Value::Null, None).await;
        assert!(result.is_ok());
        let response = result.unwrap();
        assert!(response.is_ok());
    }

    #[tokio::test]
    async fn test_create_shape_controller_behavior_is_preserved() {
        let controller = create_test_controller();
        let response = controller
            .handle(
                "create_shape",
                None,
                serde_json::json!({
                    "type": "cube",
                    "width": 1.0,
                    "height": 1.0,
                    "depth": 1.0
                }),
                None,
            )
            .await
            .unwrap();

        assert!(response.is_ok());
        let data = response.data.as_ref().unwrap();
        let nodes = data["nodes"].as_array().unwrap();
        let shape = nodes
            .iter()
            .find(|node| node["name"].as_str().unwrap_or_default().starts_with("Shape"))
            .expect("created shape node should be present in scene snapshot");
        assert_eq!(shape["has_mesh"], true);
    }

    #[tokio::test]
    async fn test_animate_empty_scene() {
        let controller = create_test_controller();
        let result = controller.handle("animate", None, Value::Null, None).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_no_service_returns_error() {
        let controller = create_controller_without_service();
        let result = controller.handle("snapshot", None, Value::Null, None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_capture_empty_scene() {
        // Without GPU, render_frame returns error
        let controller = create_test_controller();
        let result = controller.handle("capture", None, Value::Null, None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_scene_capabilities_advertise_lookdev_flags() {
        let controller = create_test_controller();
        let response = controller
            .handle("capabilities", None, Value::Null, None)
            .await
            .unwrap();
        let data = response.data.as_ref().unwrap();

        assert_eq!(data["clay"], true);
        assert_eq!(data["liveViewportSettings"], false);
        assert!(data["renderModes"]
            .as_array()
            .unwrap()
            .contains(&Value::String("clay".to_string())));
    }

    #[tokio::test]
    async fn test_scene_stream_returns_raw_h264_descriptor() {
        let (controller, registry) = create_stream_test_controller();
        let result = controller
            .handle(
                "stream",
                None,
                serde_json::json!({
                    "viewportId": "main",
                    "sceneId": "scene-a",
                    "renderMode": "pbr",
                    "resolution": { "width": 1279, "height": 721, "pixelRatio": 1.0 },
                    "fps": 30,
                    "colorSpace": "srgb",
                    "toneMapping": "aces",
                    "workMode": "edit-parametric"
                }),
                None,
            )
            .await;

        assert!(result.is_ok());
        let response = result.unwrap();
        assert!(response.is_ok());
        let data = response.data.as_ref().unwrap().as_object().unwrap();
        let stream_id = data["streamId"].as_str().unwrap();
        assert_eq!(data["viewportId"], "main");
        assert_eq!(data["container"], "h264-annexb");
        assert_eq!(data["frameHeader"], "neko-h264-v1");
        assert!(data.get("initData").is_none());
        assert_eq!(data["width"], 1278);
        assert_eq!(data["height"], 720);
        assert_eq!(data["qualityTier"], "full");
        assert_eq!(data["scheduledWidth"], 1278);
        assert_eq!(data["scheduledHeight"], 720);
        assert_eq!(data["helperPassesEnabled"], true);
        assert_eq!(data["postProcessEnabled"], true);
        assert_eq!(data["controlAckPreserved"], true);
        assert!(registry.exists(&StreamId::from_string(stream_id)).await);
        let _ = registry.destroy(&StreamId::from_string(stream_id)).await;
    }

    #[tokio::test]
    async fn scene_stream_descriptor_reflects_effective_lookdev_mode() {
        let (controller, registry) = create_stream_test_controller();
        let response = controller
            .handle(
                "stream",
                None,
                serde_json::json!({
                    "viewportId": "main",
                    "sceneId": "scene-a",
                    "renderMode": "clay",
                    "debugView": "albedo",
                    "lookdev": {
                        "renderMode": "clay",
                        "materialOverride": {
                            "kind": "clay",
                            "roughness": 0.9,
                            "metallic": 0.0
                        }
                    },
                    "resolution": { "width": 640, "height": 480, "pixelRatio": 1.0 }
                }),
                None,
            )
            .await
            .unwrap();

        let data = response.data.as_ref().unwrap().as_object().unwrap();
        assert_eq!(data["renderMode"], "clay");
        assert_eq!(data["debugView"], "albedo");
        assert_eq!(data["lookdev"]["renderMode"], "clay");
        assert_eq!(data["lookdev"]["materialOverride"]["kind"], "clay");
        let stream_id = data["streamId"].as_str().unwrap();
        let _ = registry.destroy(&StreamId::from_string(stream_id)).await;
    }

    #[tokio::test]
    async fn scene_stream_rejects_unsupported_render_mode() {
        let (controller, _registry) = create_stream_test_controller();
        let result = controller
            .handle(
                "stream",
                None,
                serde_json::json!({
                    "viewportId": "main",
                    "sceneId": "scene-a",
                    "renderMode": "pathTrace",
                    "resolution": { "width": 640, "height": 480, "pixelRatio": 1.0 }
                }),
                None,
            )
            .await;

        match result.unwrap_err() {
            ApiError::InvalidRequest(message) => {
                assert!(message.contains("unsupported renderMode"));
                assert!(message.contains("pathTrace"));
            }
            other => panic!("Expected InvalidRequest, got: {other}"),
        }
    }

    #[test]
    fn scene_stream_sink_config_uses_gpu_pipeline_sink_contract() {
        let settings = SceneStreamRuntimeSettings {
            width: 1280,
            height: 720,
            fps: 30.0,
            h264_quality: 85,
            helper_passes_enabled: true,
            post_process_enabled: true,
            quality_tier: SceneStreamQualityTier::Full,
            preserve_control_ack: true,
        };

        let config = scene_stream_sink_config(settings).unwrap();
        assert_eq!(config.width, 1280);
        assert_eq!(config.height, 720);
        assert_eq!(config.fps, 30.0);
        assert_eq!(config.gop_size, 15);
        assert_eq!(config.bitrate, 7_372_800);
    }

    #[tokio::test]
    async fn test_scene_stream_routes_multiple_viewports_independently() {
        let (controller, registry) = create_stream_test_controller();
        let first = controller
            .handle(
                "stream",
                None,
                serde_json::json!({
                    "viewportId": "main",
                    "sceneId": "scene-a",
                    "resolution": { "width": 1280, "height": 720, "pixelRatio": 1.0 }
                }),
                None,
            )
            .await
            .unwrap();
        let second = controller
            .handle(
                "stream",
                None,
                serde_json::json!({
                    "viewportId": "side",
                    "sceneId": "scene-a",
                    "resolution": { "width": 640, "height": 480, "pixelRatio": 1.0 }
                }),
                None,
            )
            .await
            .unwrap();

        let first_data = first.data.as_ref().unwrap().as_object().unwrap();
        let second_data = second.data.as_ref().unwrap().as_object().unwrap();
        let first_stream_id = first_data["streamId"].as_str().unwrap();
        let second_stream_id = second_data["streamId"].as_str().unwrap();
        assert_ne!(first_stream_id, second_stream_id);
        assert_eq!(first_data["viewportId"], "main");
        assert_eq!(second_data["viewportId"], "side");
        assert!(
            registry
                .exists(&StreamId::from_string(first_stream_id))
                .await
        );
        assert!(
            registry
                .exists(&StreamId::from_string(second_stream_id))
                .await
        );
        let _ = registry
            .destroy(&StreamId::from_string(first_stream_id))
            .await;
        let _ = registry
            .destroy(&StreamId::from_string(second_stream_id))
            .await;
    }

    #[tokio::test]
    async fn scene_stream_respects_requested_helper_passes() {
        let (controller, registry) = create_stream_test_controller();
        let response = controller
            .handle(
                "stream",
                None,
                serde_json::json!({
                    "viewportId": "main",
                    "sceneId": "scene-a",
                    "helperPassesEnabled": false,
                    "resolution": { "width": 640, "height": 480, "pixelRatio": 1.0 }
                }),
                None,
            )
            .await
            .unwrap();

        let data = response.data.as_ref().unwrap().as_object().unwrap();
        assert_eq!(data["helperPassesEnabled"], false);
        let stream_id = data["streamId"].as_str().unwrap();
        let _ = registry.destroy(&StreamId::from_string(stream_id)).await;
    }

    #[test]
    fn scene_stream_runtime_applies_main_viewport_degradation() {
        let config = SceneStreamProducerConfig {
            session_id: "scene-scene-a".to_string(),
            viewport: ViewportDescriptor {
                viewport_id: "main".to_string(),
                scene_id: "scene-a".to_string(),
                render_mode: ViewportRenderMode::Pbr,
                debug_view: None,
                fps: 60,
                color_space: SceneColorSpace::Srgb,
                tone_mapping: SceneToneMapping::Aces,
                post_process: ViewportPostProcess {
                    bloom: true,
                    ssao: true,
                    taa: true,
                },
                layer_mask: None,
                work_mode: ViewportWorkMode::EditParametric,
                helper_passes: true,
                lookdev: None,
            },
            width: 1280,
            height: 720,
            fps: 60.0,
            initial_revision: 0,
            initial_applied_seq: 0,
        };
        let runtime = SceneStreamRuntimeScheduler::new(&config);
        let settings = runtime.settings(
            1,
            FrameLoadSample {
                gpu_frame_ms: 42.0,
                encode_ms: 4.0,
                dropped_frames: 9,
            },
            ControlAckHealthSample {
                ack_p95_ms: 24.0,
                pending_command_acks: 0,
                render_backlog_frames: 9,
            },
        );

        assert_eq!(
            settings.quality_tier,
            SceneStreamQualityTier::MainResolutionReduced
        );
        assert_eq!(settings.width, 1280);
        assert_eq!(settings.height, 720);
        assert_eq!(settings.fps, 60.0);
        assert_eq!(settings.h264_quality, 85);
        assert!(!settings.post_process_enabled);
        assert!(!settings.preserve_control_ack);

        let viewport = runtime.viewport_descriptor_for_settings(settings);
        assert_eq!(viewport.fps, 60);
        assert_eq!(viewport.tone_mapping, SceneToneMapping::None);
        assert_eq!(viewport.post_process, ViewportPostProcess::default());
        assert!(viewport.helper_passes);
    }

    #[test]
    fn scene_stream_runtime_reduces_auxiliary_before_main_viewport() {
        let config = SceneStreamProducerConfig {
            session_id: "scene-scene-a".to_string(),
            viewport: ViewportDescriptor {
                viewport_id: "side".to_string(),
                scene_id: "scene-a".to_string(),
                render_mode: ViewportRenderMode::Pbr,
                debug_view: None,
                fps: 30,
                color_space: SceneColorSpace::Srgb,
                tone_mapping: SceneToneMapping::Aces,
                post_process: ViewportPostProcess::default(),
                layer_mask: None,
                work_mode: ViewportWorkMode::EditParametric,
                helper_passes: true,
                lookdev: None,
            },
            width: 640,
            height: 480,
            fps: 30.0,
            initial_revision: 0,
            initial_applied_seq: 0,
        };
        let runtime = SceneStreamRuntimeScheduler::new(&config);
        let settings = runtime.settings(
            1,
            FrameLoadSample {
                gpu_frame_ms: 38.0,
                encode_ms: 3.0,
                dropped_frames: 2,
            },
            ControlAckHealthSample::default(),
        );

        assert_eq!(
            settings.quality_tier,
            SceneStreamQualityTier::AuxiliaryReduced
        );
        assert_eq!(settings.width, 640);
        assert_eq!(settings.height, 480);
        assert_eq!(settings.fps, 30.0);
        assert!(!settings.helper_passes_enabled);
        assert!(settings.preserve_control_ack);

        let viewport = runtime.viewport_descriptor_for_settings(settings);
        assert_eq!(viewport.viewport_id, "side");
        assert_eq!(viewport.fps, 30);
        assert!(!viewport.helper_passes);
    }

    #[test]
    fn scene_stream_runtime_degrades_render_backlog_while_ack_path_stays_healthy() {
        let config = SceneStreamProducerConfig {
            session_id: "scene-scene-a".to_string(),
            viewport: ViewportDescriptor {
                viewport_id: "main".to_string(),
                scene_id: "scene-a".to_string(),
                render_mode: ViewportRenderMode::Pbr,
                debug_view: None,
                fps: 60,
                color_space: SceneColorSpace::Srgb,
                tone_mapping: SceneToneMapping::Aces,
                post_process: ViewportPostProcess {
                    bloom: true,
                    ssao: true,
                    taa: true,
                },
                layer_mask: None,
                work_mode: ViewportWorkMode::EditParametric,
                helper_passes: true,
                lookdev: None,
            },
            width: 1280,
            height: 720,
            fps: 60.0,
            initial_revision: 0,
            initial_applied_seq: 0,
        };
        let runtime = SceneStreamRuntimeScheduler::new(&config);
        let settings = runtime.settings(
            0,
            FrameLoadSample {
                gpu_frame_ms: 6.0,
                encode_ms: 1.0,
                dropped_frames: 0,
            },
            ControlAckHealthSample {
                ack_p95_ms: 2.0,
                pending_command_acks: 0,
                render_backlog_frames: 9,
            },
        );

        assert_eq!(
            settings.quality_tier,
            SceneStreamQualityTier::MainResolutionReduced
        );
        assert_eq!(settings.width, 1280);
        assert_eq!(settings.height, 720);
        assert_eq!(settings.fps, 60.0);
        assert!(!settings.post_process_enabled);
        assert!(settings.preserve_control_ack);
    }

    #[test]
    fn scene_stream_runtime_keeps_active_stream_output_contract_stable() {
        let config = SceneStreamProducerConfig {
            session_id: "scene-scene-a".to_string(),
            viewport: ViewportDescriptor {
                viewport_id: "main".to_string(),
                scene_id: "scene-a".to_string(),
                render_mode: ViewportRenderMode::Pbr,
                debug_view: None,
                fps: 60,
                color_space: SceneColorSpace::Srgb,
                tone_mapping: SceneToneMapping::Aces,
                post_process: ViewportPostProcess {
                    bloom: true,
                    ssao: true,
                    taa: true,
                },
                layer_mask: None,
                work_mode: ViewportWorkMode::EditParametric,
                helper_passes: true,
                lookdev: None,
            },
            width: 1280,
            height: 720,
            fps: 60.0,
            initial_revision: 0,
            initial_applied_seq: 0,
        };
        let runtime = SceneStreamRuntimeScheduler::new(&config);
        let full = runtime.settings(
            0,
            FrameLoadSample::default(),
            ControlAckHealthSample::default(),
        );
        let degraded = runtime.settings(
            0,
            FrameLoadSample {
                gpu_frame_ms: 50.0,
                encode_ms: 12.0,
                dropped_frames: 12,
            },
            ControlAckHealthSample {
                ack_p95_ms: 30.0,
                pending_command_acks: 20,
                render_backlog_frames: 12,
            },
        );

        assert_eq!(
            degraded.quality_tier,
            SceneStreamQualityTier::MainResolutionReduced
        );
        assert_eq!(degraded.width, full.width);
        assert_eq!(degraded.height, full.height);
        assert_eq!(degraded.fps, full.fps);
        assert_eq!(degraded.h264_quality, full.h264_quality);
        assert_eq!(
            scene_stream_sink_config(degraded).unwrap(),
            scene_stream_sink_config(full).unwrap()
        );
    }

    #[test]
    fn scene_stream_frame_meta_includes_active_preview_alignment() {
        let services = ServiceFactory::new().create_with_gpu(None);
        let controller = ModelPreviewController::new(services.scene_service);
        controller
            .handle_viewport_command(neko_engine_types::ViewportCommand {
                protocol_version: neko_engine_types::VIEWPORT_PROTOCOL_VERSION,
                domain: neko_engine_types::ViewportDomain::Scene,
                action: neko_engine_types::MODEL_CHARACTER_PREVIEW_SET_MODE.to_string(),
                scene_id: "scene-a".to_string(),
                viewport_id: Some("main".to_string()),
                seq: 120,
                correlation_id: "main:preview:120".to_string(),
                timestamp: 100.0,
                source: neko_engine_types::ViewportCommandSource::User,
                base_revision: Some(0),
                payload: serde_json::json!({
                    "characterId": "character-a",
                    "modeId": "voice-pack",
                    "viewportId": "main"
                }),
            })
            .unwrap();
        let config = SceneStreamProducerConfig {
            session_id: "scene-scene-a".to_string(),
            viewport: ViewportDescriptor {
                viewport_id: "main".to_string(),
                scene_id: "scene-a".to_string(),
                render_mode: ViewportRenderMode::Pbr,
                debug_view: None,
                fps: 30,
                color_space: SceneColorSpace::Srgb,
                tone_mapping: SceneToneMapping::Aces,
                post_process: ViewportPostProcess::default(),
                layer_mask: None,
                work_mode: ViewportWorkMode::EditParametric,
                helper_passes: true,
                lookdev: None,
            },
            width: 1280,
            height: 720,
            fps: 30.0,
            initial_revision: 0,
            initial_applied_seq: 120,
        };
        let stream_id = StreamId::from_string("stream-main");
        let meta = scene_stream_render_frame_meta(
            &stream_id,
            &config,
            &config.viewport,
            7,
            33_333,
            33_333,
            2,
            Some(&controller),
        );

        assert_eq!(meta.stream_id, "stream-main");
        assert_eq!(meta.scene_id.as_deref(), Some("scene-a"));
        assert_eq!(meta.viewport_id, "main");
        assert_eq!(meta.scene_revision, 0);
        assert_eq!(meta.applied_seq, 120);
        assert_eq!(meta.active_preview_mode.as_deref(), Some("voice-pack"));
        assert_eq!(
            meta.diagnostics.unwrap().dropped_frames_since_last,
            2
        );
    }

    #[tokio::test]
    async fn test_latency_test_returns_immediately() {
        let controller = create_test_controller();
        let result = controller
            .handle("latency_test", None, Value::Null, None)
            .await;
        assert!(result.is_ok());
        let response = result.unwrap();
        assert!(response.is_ok());
    }
}
