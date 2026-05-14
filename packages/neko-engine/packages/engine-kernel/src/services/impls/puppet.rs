//! PuppetService — implementation using runtime-puppet crate
//!
//! Wraps BevyPuppetWorld with Mutex for thread-safe access.
//! Mirrors the SceneService pattern.

use crate::error::{Error, Result};
use crate::encoder::{
    ContainerFormat, EncoderConfig, EncoderPreset, HwEncoderType, PipelineConfig, VideoCodec,
};
use crate::gpu::{
    GpuContext, GpuPermit, PipelinePriority, PuppetBlendMode, PuppetMeshInput, PuppetRenderOutput,
    PuppetRenderRequest, PuppetRenderer, PuppetTextureAtlasInput,
};
#[cfg(target_os = "macos")]
use crate::gpu::RgbaToNv12TextureConverter;
use crate::services::impls::muxer_sink::MuxerSink;
use crate::services::pipeline_sink::{
    GpuFrameLease, GpuOutputHandle, PipelineOutput, PipelineSink, VideoGpuFrame, VideoOutput,
};
use crate::services::puppet::IPuppetService;
use base64::Engine;
use neko_engine_types::easing::EasingType;
use neko_engine_types::{
    PuppetCommand, PuppetCommandAck, PuppetCommandAckStatus, PuppetCommandEnvelope,
    PuppetCommandError,
};
use neko_runtime_puppet::animation::{AnimationClipInfo, ParameterCurveInfo};
use neko_runtime_puppet::animation_blend::BlendLayerInfo;
use neko_runtime_puppet::moc3::expression::ExpressionInfo;
use neko_runtime_puppet::world::{
    BevyPuppetWorld, DeformedMesh, MeshSnapshot, ParameterInfo, PuppetDelta, PuppetSnapshot,
    PuppetWorld,
};
use serde::de::DeserializeOwned;
use serde_json::{json, Value};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use super::super::puppet::{PuppetExportConfig, PuppetExportSummary, PuppetRenderTiming};

const PUPPET_GPU_PIPELINE_ID: &str = "puppet-renderer";

/// Concrete puppet service backed by bevy_ecs
pub struct PuppetService {
    world: Mutex<BevyPuppetWorld>,
    command_state: Mutex<PuppetCommandState>,
    gpu_ctx: Option<Arc<GpuContext>>,
    puppet_renderer: Option<PuppetRenderer>,
}

#[derive(Debug)]
struct PuppetCommandState {
    revision: u64,
    next_seq: u64,
}

impl Default for PuppetCommandState {
    fn default() -> Self {
        Self {
            revision: 0,
            next_seq: 1,
        }
    }
}

impl PuppetService {
    pub fn new() -> Self {
        Self {
            world: Mutex::new(BevyPuppetWorld::new()),
            command_state: Mutex::new(PuppetCommandState::default()),
            gpu_ctx: None,
            puppet_renderer: None,
        }
    }

    /// Create with GPU rendering support.
    pub fn with_gpu(ctx: Arc<GpuContext>) -> Self {
        Self {
            world: Mutex::new(BevyPuppetWorld::new()),
            command_state: Mutex::new(PuppetCommandState::default()),
            gpu_ctx: Some(Arc::clone(&ctx)),
            puppet_renderer: Some(PuppetRenderer::new(ctx)),
        }
    }

    fn apply_compat_command(&self, command: PuppetCommand) -> Result<PuppetCommandAck> {
        let mut state = self.lock_command_state()?;
        let envelope = PuppetCommandEnvelope {
            seq: state.next_seq,
            base_revision: state.revision,
            transaction_id: None,
            command,
        };
        let ack = self.apply_puppet_command_locked(&mut state, envelope)?;
        if ack.status == PuppetCommandAckStatus::Applied {
            Ok(ack)
        } else {
            let message = ack
                .error
                .as_ref()
                .map(|error| error.message.clone())
                .unwrap_or_else(|| "puppet command rejected".to_string());
            Err(Error::Other(message))
        }
    }

    fn lock_command_state(&self) -> Result<MutexGuard<'_, PuppetCommandState>> {
        self.command_state
            .lock()
            .map_err(|e| Error::Other(format!("Puppet command state lock poisoned: {}", e)))
    }

    fn compat_unit(&self, command: PuppetCommand) -> Result<()> {
        let ack = self.apply_compat_command(command)?;
        ack_value(ack).map(|_| ())
    }

    fn compat_value<T: DeserializeOwned>(&self, command: PuppetCommand) -> Result<T> {
        let ack = self.apply_compat_command(command)?;
        serde_json::from_value(ack_value(ack)?)
            .map_err(|e| Error::Other(format!("Invalid puppet command result: {}", e)))
    }

    fn apply_command_to_world(
        world: &mut BevyPuppetWorld,
        command: PuppetCommand,
    ) -> Result<Value> {
        match command {
            PuppetCommand::Load { data_base64 } => {
                let data = base64::engine::general_purpose::STANDARD
                    .decode(data_base64)
                    .map_err(|e| Error::InvalidParameter(format!("Invalid puppet base64: {e}")))?;
                let snapshot = world
                    .load_puppet(&data)
                    .map_err(|e| Error::Other(format!("Failed to load puppet: {}", e)))?;
                to_value(snapshot)
            }
            PuppetCommand::SetParameter { name, value } => {
                world.set_parameter(&name, value).map_err(Error::Other)?;
                Ok(Value::Null)
            }
            PuppetCommand::Tick { delta_ms } => to_value(world.tick(delta_ms)),
            PuppetCommand::PlayAnimation { name, loop_anim } => {
                world
                    .play_animation(&name, loop_anim)
                    .map_err(Error::Other)?;
                Ok(Value::Null)
            }
            PuppetCommand::StopAnimation => {
                world.stop_animation();
                Ok(Value::Null)
            }
            PuppetCommand::SeekAnimation { time_ms } => {
                world.seek_animation(time_ms);
                Ok(Value::Null)
            }
            PuppetCommand::AddKeyframe {
                clip_name,
                param_name,
                time_ms,
                value,
            } => {
                let id = world
                    .add_keyframe(&clip_name, &param_name, time_ms, value)
                    .map_err(Error::Other)?;
                Ok(json!({ "id": id }))
            }
            PuppetCommand::RemoveKeyframe {
                clip_name,
                param_name,
                keyframe_id,
            } => {
                world
                    .remove_keyframe(&clip_name, &param_name, &keyframe_id)
                    .map_err(Error::Other)?;
                Ok(Value::Null)
            }
            PuppetCommand::UpdateKeyframe {
                clip_name,
                param_name,
                keyframe_id,
                time_ms,
                value,
                easing,
            } => {
                world
                    .update_keyframe(
                        &clip_name,
                        &param_name,
                        &keyframe_id,
                        time_ms,
                        value,
                        easing.as_deref().map(EasingType::from_name),
                    )
                    .map_err(Error::Other)?;
                Ok(Value::Null)
            }
            PuppetCommand::CreateClip { name, duration_ms } => {
                world
                    .create_clip(&name, duration_ms)
                    .map_err(Error::Other)?;
                Ok(Value::Null)
            }
            PuppetCommand::CrossfadeAnimation {
                clip_name,
                fade_duration_ms,
                loop_anim,
            } => {
                world
                    .crossfade_animation(&clip_name, fade_duration_ms, loop_anim)
                    .map_err(Error::Other)?;
                Ok(Value::Null)
            }
            PuppetCommand::SetBlendWeight { clip_name, weight } => {
                world
                    .set_blend_weight(&clip_name, weight)
                    .map_err(Error::Other)?;
                Ok(Value::Null)
            }
            PuppetCommand::SetNodeOpacity { node_id, opacity } => {
                world
                    .set_node_opacity(&node_id, opacity)
                    .map_err(Error::Other)?;
                Ok(Value::Null)
            }
            PuppetCommand::SetTexture {
                node_id,
                texture_index,
            } => {
                world
                    .set_texture(&node_id, texture_index)
                    .map_err(Error::Other)?;
                Ok(Value::Null)
            }
            PuppetCommand::SetExpression { name } => {
                world.set_expression(&name).map_err(Error::Other)?;
                Ok(Value::Null)
            }
            PuppetCommand::ClearExpression => {
                world.clear_expression();
                Ok(Value::Null)
            }
            PuppetCommand::LoadMoc3Auxiliary {
                expressions,
                motions,
                physics_json,
            } => {
                world
                    .load_moc3_auxiliary(&expressions, &motions, physics_json.as_deref())
                    .map_err(Error::Other)?;
                Ok(Value::Null)
            }
        }
    }

    fn apply_puppet_command_locked(
        &self,
        state: &mut PuppetCommandState,
        envelope: PuppetCommandEnvelope,
    ) -> Result<PuppetCommandAck> {
        let seq = envelope.seq;
        let base_revision = envelope.base_revision;
        let current_revision = state.revision;

        if seq != state.next_seq {
            let expected_seq = state.next_seq;
            return Ok(PuppetCommandAck {
                seq,
                applied_seq: 0,
                base_revision,
                revision: current_revision,
                status: PuppetCommandAckStatus::Rejected,
                result: None,
                error: Some(PuppetCommandError::ordering(format!(
                    "expected seq {}, got {}",
                    expected_seq, seq
                ))),
            });
        }

        state.next_seq = state.next_seq.saturating_add(1);

        if base_revision != current_revision {
            return Ok(PuppetCommandAck {
                seq,
                applied_seq: 0,
                base_revision,
                revision: current_revision,
                status: PuppetCommandAckStatus::Rejected,
                result: None,
                error: Some(PuppetCommandError::revision_conflict(format!(
                    "base revision {} does not match current revision {}",
                    base_revision, current_revision
                ))),
            });
        }

        let result = {
            let mut world = self
                .world
                .lock()
                .map_err(|e| Error::Other(format!("Puppet world lock poisoned: {}", e)))?;
            Self::apply_command_to_world(&mut world, envelope.command)
        };

        match result {
            Ok(result) => {
                state.revision = state.revision.saturating_add(1);
                Ok(PuppetCommandAck {
                    seq,
                    applied_seq: seq,
                    base_revision,
                    revision: state.revision,
                    status: PuppetCommandAckStatus::Applied,
                    result: Some(result),
                    error: None,
                })
            }
            Err(error) => Ok(PuppetCommandAck {
                seq,
                applied_seq: 0,
                base_revision,
                revision: current_revision,
                status: PuppetCommandAckStatus::Rejected,
                result: None,
                error: Some(PuppetCommandError::apply_failed(error.to_string())),
            }),
        }
    }

    fn build_render_request(
        &self,
        width: u32,
        height: u32,
        timing: PuppetRenderTiming,
    ) -> Result<PuppetRenderRequest> {
        let (snapshot, deformed_meshes) = {
            let mut world = self
                .world
                .lock()
                .map_err(|e| Error::Other(format!("Puppet world lock poisoned: {}", e)))?;
            let snapshot = world.get_snapshot();
            let deformed_meshes = world.get_deformed_meshes();
            (snapshot, deformed_meshes)
        };
        let meshes = extract_renderer_meshes(&snapshot.meshes, &deformed_meshes)?;
        Ok(PuppetRenderRequest {
            width,
            height,
            pts: timing.pts,
            duration: timing.duration,
            frame_index: timing.frame_index,
            clear_color: [0.0, 0.0, 0.0, 0.0],
            meshes,
            atlases: default_atlases_from_snapshot(&snapshot),
        })
    }

    fn render_output(
        &self,
        width: u32,
        height: u32,
        timing: PuppetRenderTiming,
    ) -> Result<(Arc<GpuContext>, PuppetRenderOutput)> {
        let ctx = self
            .gpu_ctx
            .as_ref()
            .ok_or_else(|| Error::Other("GPU not available for puppet rendering".to_string()))?;
        let renderer = self
            .puppet_renderer
            .as_ref()
            .ok_or_else(|| Error::Other("PuppetRenderer is not configured".to_string()))?;

        match ctx
            .budget_controller()
            .acquire_permit(PUPPET_GPU_PIPELINE_ID, PipelinePriority::Interactive)
        {
            GpuPermit::Proceed => {}
            GpuPermit::Queued { retry_after, .. } | GpuPermit::Paused { retry_after, .. } => {
                return Err(gpu_busy_error(retry_after));
            }
        }

        let request = self.build_render_request(width, height, timing)?;
        let started = Instant::now();
        let output = renderer.render(request)?;
        ctx.budget_controller().report_frame_time(
            PUPPET_GPU_PIPELINE_ID,
            PipelinePriority::Interactive,
            started.elapsed(),
        );
        ctx.budget_controller().observe_submitted_work_done(
            PUPPET_GPU_PIPELINE_ID,
            PipelinePriority::Interactive,
            ctx.queue(),
        );
        Ok((Arc::clone(ctx), output))
    }
}

fn ack_value(ack: PuppetCommandAck) -> Result<Value> {
    ack.result.ok_or_else(|| {
        Error::Other(format!(
            "Puppet command {} applied without a result payload",
            ack.applied_seq
        ))
    })
}

fn to_value<T: serde::Serialize>(value: T) -> Result<Value> {
    serde_json::to_value(value)
        .map_err(|e| Error::Other(format!("Failed to serialize puppet command result: {}", e)))
}

fn extract_renderer_meshes(
    snapshots: &[MeshSnapshot],
    deformed_meshes: &[DeformedMesh],
) -> Result<Vec<PuppetMeshInput>> {
    deformed_meshes
        .iter()
        .map(|mesh| {
            let snapshot = snapshots
                .iter()
                .find(|snapshot| snapshot.node_id == mesh.node_id)
                .ok_or_else(|| {
                    Error::InvalidParameter(format!(
                        "missing mesh snapshot for deformed puppet node '{}'",
                        mesh.node_id
                    ))
                })?;
            Ok(PuppetMeshInput {
                node_id: mesh.node_id.clone(),
                atlas_id: atlas_id(snapshot.texture_index),
                vertices: mesh.vertices.clone(),
                uvs: snapshot.uvs.clone(),
                indices: snapshot.indices.clone(),
                opacity: mesh.opacity,
                z_order: mesh.z_order,
                blend_mode: PuppetBlendMode::from_runtime(&mesh.blend_mode),
            })
        })
        .collect()
}

fn default_atlases_from_snapshot(snapshot: &PuppetSnapshot) -> Vec<PuppetTextureAtlasInput> {
    let mut texture_indices: Vec<usize> = snapshot
        .meshes
        .iter()
        .filter_map(|mesh| mesh.texture_index)
        .collect();
    texture_indices.sort_unstable();
    texture_indices.dedup();

    if texture_indices.is_empty() && !snapshot.meshes.is_empty() {
        texture_indices.push(0);
    }

    texture_indices
        .into_iter()
        .map(|index| PuppetTextureAtlasInput {
            id: atlas_id(Some(index)),
            width: 1,
            height: 1,
            rgba: vec![255, 255, 255, 255],
            generation: 0,
        })
        .collect()
}

fn atlas_id(texture_index: Option<usize>) -> String {
    format!("texture-{}", texture_index.unwrap_or(0))
}

fn gpu_busy_error(retry_after: Duration) -> Error {
    Error::GpuBusy {
        retry_after_ms: retry_after.as_millis().try_into().unwrap_or(u64::MAX),
        message: "Puppet GPU renderer is waiting for the shared GPU budget".to_string(),
    }
}

#[cfg(target_os = "macos")]
fn rendered_output_to_encoder_video_output(
    output: PuppetRenderOutput,
    converter: Option<&mut RgbaToNv12TextureConverter>,
    ctx: Arc<GpuContext>,
) -> Result<VideoOutput> {
    if let Some(converter) = converter {
        let io_surface =
            converter.convert_to_iosurface(&output.color_view, output.width, output.height, 1)?;
        return Ok(VideoOutput::GpuFrame(VideoGpuFrame {
            lease: GpuFrameLease::new(GpuOutputHandle::IOSurface(io_surface)),
            pts: output.pts,
            duration: output.duration,
            frame_index: output.frame_index,
            width: output.width,
            height: output.height,
        }));
    }

    Ok(output.into_video_output(ctx))
}

#[cfg(not(target_os = "macos"))]
fn rendered_output_to_encoder_video_output(
    output: PuppetRenderOutput,
    _converter: Option<&mut ()>,
    ctx: Arc<GpuContext>,
) -> Result<VideoOutput> {
    Ok(output.into_video_output(ctx))
}

fn validate_puppet_export_config(config: PuppetExportConfig) -> Result<PuppetExportConfig> {
    if config.width == 0 || config.height == 0 {
        return Err(Error::InvalidParameter(format!(
            "puppet export size must be non-zero, got {}x{}",
            config.width, config.height
        )));
    }
    if !config.fps.is_finite() || config.fps <= 0.0 {
        return Err(Error::InvalidParameter(format!(
            "puppet export fps must be positive, got {}",
            config.fps
        )));
    }
    if !config.duration_ms.is_finite() || config.duration_ms < 0.0 {
        return Err(Error::InvalidParameter(format!(
            "puppet export duration_ms must be non-negative, got {}",
            config.duration_ms
        )));
    }
    Ok(PuppetExportConfig {
        bitrate: config.bitrate.max(1),
        gop_size: config.gop_size.max(1),
        ..config
    })
}

fn puppet_export_frame_count(config: PuppetExportConfig) -> u64 {
    ((config.duration_ms / 1_000.0) * config.fps).ceil().max(1.0) as u64
}

fn puppet_frame_timing(frame_index: u64, fps: f64) -> PuppetRenderTiming {
    let duration = (1_000_000.0 / fps).round() as i64;
    PuppetRenderTiming {
        pts: frame_index as i64 * duration,
        duration,
        frame_index,
    }
}

fn puppet_muxer_pipeline_config(output_path: &str, config: PuppetExportConfig) -> PipelineConfig {
    let mut encoder_config =
        EncoderConfig::new(config.width, config.height, config.fps, VideoCodec::H264);
    encoder_config.bitrate = config.bitrate;
    encoder_config.gop_size = Some(config.gop_size);
    encoder_config.max_b_frames = Some(0);
    encoder_config.profile = Some("baseline".to_string());
    encoder_config.preset = EncoderPreset::Ultrafast;
    encoder_config.hw_encoder = HwEncoderType::Auto;
    encoder_config.use_zero_copy_gpu = true;
    encoder_config.global_header = true;

    PipelineConfig {
        compose_buffer_size: 1,
        encode_buffer_size: 4,
        mux_buffer_size: 8,
        encoder_config,
        audio_encoder_config: None,
        container: ContainerFormat::Mp4,
        output_path: output_path.to_string(),
        total_frames: puppet_export_frame_count(config),
    }
}

impl Default for PuppetService {
    fn default() -> Self {
        Self::new()
    }
}

impl IPuppetService for PuppetService {
    fn current_revision(&self) -> Result<u64> {
        let state = self.lock_command_state()?;
        Ok(state.revision)
    }

    fn apply_puppet_command(&self, envelope: PuppetCommandEnvelope) -> Result<PuppetCommandAck> {
        let mut state = self.lock_command_state()?;
        self.apply_puppet_command_locked(&mut state, envelope)
    }

    fn apply_puppet_command_alias(&self, command: PuppetCommand) -> Result<PuppetCommandAck> {
        self.apply_compat_command(command)
    }

    fn load_puppet(&self, data: &[u8]) -> Result<PuppetSnapshot> {
        self.compat_value(PuppetCommand::Load {
            data_base64: base64::engine::general_purpose::STANDARD.encode(data),
        })
    }

    fn get_snapshot(&self) -> Result<PuppetSnapshot> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Puppet world lock poisoned: {}", e)))?;

        Ok(world.get_snapshot())
    }

    fn set_parameter(&self, name: &str, value: f32) -> Result<()> {
        self.compat_unit(PuppetCommand::SetParameter {
            name: name.to_string(),
            value,
        })
    }

    fn get_parameters(&self) -> Result<Vec<ParameterInfo>> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Puppet world lock poisoned: {}", e)))?;

        Ok(world.get_parameters())
    }

    fn tick(&self, delta_ms: f32) -> Result<PuppetDelta> {
        self.compat_value(PuppetCommand::Tick { delta_ms })
    }

    fn get_deformed_meshes(&self) -> Result<Vec<DeformedMesh>> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Puppet world lock poisoned: {}", e)))?;

        Ok(world.get_deformed_meshes())
    }

    fn render_gpu_frame(
        &self,
        width: u32,
        height: u32,
        timing: PuppetRenderTiming,
    ) -> Result<VideoOutput> {
        let (ctx, output) = self.render_output(width, height, timing)?;
        Ok(output.into_video_output(ctx))
    }

    fn submit_rendered_frame_to_sink(
        &self,
        sink: &dyn PipelineSink,
        width: u32,
        height: u32,
        timing: PuppetRenderTiming,
    ) -> Result<()> {
        let (ctx, output) = self.render_output(width, height, timing)?;
        #[cfg(target_os = "macos")]
        let mut converter = RgbaToNv12TextureConverter::new(Arc::clone(&ctx))?;
        #[cfg(target_os = "macos")]
        let video_output =
            rendered_output_to_encoder_video_output(output, Some(&mut converter), ctx)?;
        #[cfg(not(target_os = "macos"))]
        let video_output = rendered_output_to_encoder_video_output(output, None, ctx)?;

        sink.submit(PipelineOutput::Video(video_output))
    }

    fn export_rendered_clip_to_sink(
        &self,
        sink: &dyn PipelineSink,
        config: PuppetExportConfig,
    ) -> Result<PuppetExportSummary> {
        let config = validate_puppet_export_config(config)?;
        let total_frames = puppet_export_frame_count(config);

        #[cfg(target_os = "macos")]
        let ctx = self
            .gpu_ctx
            .as_ref()
            .ok_or_else(|| Error::Other("GPU not available for puppet export".to_string()))?;
        #[cfg(target_os = "macos")]
        let mut converter = RgbaToNv12TextureConverter::new(Arc::clone(ctx))?;

        for frame_index in 0..total_frames {
            let _ = self.tick((1_000.0 / config.fps) as f32)?;
            let timing = puppet_frame_timing(frame_index, config.fps);
            let (ctx, output) = self.render_output(config.width, config.height, timing)?;

            #[cfg(target_os = "macos")]
            let video_output =
                rendered_output_to_encoder_video_output(output, Some(&mut converter), ctx)?;
            #[cfg(not(target_os = "macos"))]
            let video_output = rendered_output_to_encoder_video_output(output, None, ctx)?;

            sink.submit(PipelineOutput::Video(video_output))?;
        }

        sink.flush()?;
        Ok(PuppetExportSummary {
            frames_submitted: total_frames,
        })
    }

    fn export_h264_to_path(
        &self,
        output_path: &str,
        config: PuppetExportConfig,
    ) -> Result<PuppetExportSummary> {
        let config = validate_puppet_export_config(config)?;
        let pipeline_config = puppet_muxer_pipeline_config(output_path, config);
        let sink = MuxerSink::new(pipeline_config)?;
        self.export_rendered_clip_to_sink(&sink, config)
    }

    fn get_animations(&self) -> Result<Vec<AnimationClipInfo>> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Puppet world lock poisoned: {}", e)))?;

        Ok(world.get_animations())
    }

    fn play_animation(&self, name: &str, loop_anim: bool) -> Result<()> {
        self.compat_unit(PuppetCommand::PlayAnimation {
            name: name.to_string(),
            loop_anim,
        })
    }

    fn stop_animation(&self) -> Result<()> {
        self.compat_unit(PuppetCommand::StopAnimation)
    }

    fn seek_animation(&self, time_ms: f32) -> Result<()> {
        self.compat_unit(PuppetCommand::SeekAnimation { time_ms })
    }

    fn get_keyframe_tracks(&self, clip_name: &str) -> Result<Vec<ParameterCurveInfo>> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Puppet world lock poisoned: {}", e)))?;

        world.get_keyframe_tracks(clip_name).map_err(Error::Other)
    }

    fn add_keyframe(
        &self,
        clip_name: &str,
        param_name: &str,
        time_ms: f32,
        value: f32,
    ) -> Result<String> {
        #[derive(serde::Deserialize)]
        struct AddKeyframeResult {
            id: String,
        }

        let result: AddKeyframeResult = self.compat_value(PuppetCommand::AddKeyframe {
            clip_name: clip_name.to_string(),
            param_name: param_name.to_string(),
            time_ms,
            value,
        })?;
        Ok(result.id)
    }

    fn remove_keyframe(&self, clip_name: &str, param_name: &str, keyframe_id: &str) -> Result<()> {
        self.compat_unit(PuppetCommand::RemoveKeyframe {
            clip_name: clip_name.to_string(),
            param_name: param_name.to_string(),
            keyframe_id: keyframe_id.to_string(),
        })
    }

    fn update_keyframe(
        &self,
        clip_name: &str,
        param_name: &str,
        keyframe_id: &str,
        time_ms: Option<f32>,
        value: Option<f32>,
        easing: Option<EasingType>,
    ) -> Result<()> {
        self.compat_unit(PuppetCommand::UpdateKeyframe {
            clip_name: clip_name.to_string(),
            param_name: param_name.to_string(),
            keyframe_id: keyframe_id.to_string(),
            time_ms,
            value,
            easing: easing.map(|easing| easing.to_str().to_string()),
        })
    }

    fn create_clip(&self, name: &str, duration_ms: f32) -> Result<()> {
        self.compat_unit(PuppetCommand::CreateClip {
            name: name.to_string(),
            duration_ms,
        })
    }

    fn crossfade_animation(
        &self,
        clip_name: &str,
        fade_duration_ms: f32,
        loop_anim: bool,
    ) -> Result<()> {
        self.compat_unit(PuppetCommand::CrossfadeAnimation {
            clip_name: clip_name.to_string(),
            fade_duration_ms,
            loop_anim,
        })
    }

    fn set_blend_weight(&self, clip_name: &str, weight: f32) -> Result<()> {
        self.compat_unit(PuppetCommand::SetBlendWeight {
            clip_name: clip_name.to_string(),
            weight,
        })
    }

    fn get_blend_state(&self) -> Result<Vec<BlendLayerInfo>> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Puppet world lock poisoned: {}", e)))?;

        Ok(world.get_blend_state())
    }

    fn set_node_opacity(&self, node_id: &str, opacity: f32) -> Result<()> {
        self.compat_unit(PuppetCommand::SetNodeOpacity {
            node_id: node_id.to_string(),
            opacity,
        })
    }

    fn set_texture(&self, node_id: &str, texture_index: usize) -> Result<()> {
        self.compat_unit(PuppetCommand::SetTexture {
            node_id: node_id.to_string(),
            texture_index,
        })
    }

    fn get_expressions(&self) -> Result<Vec<ExpressionInfo>> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Puppet world lock poisoned: {}", e)))?;

        Ok(world.get_expressions())
    }

    fn set_expression(&self, name: &str) -> Result<()> {
        self.compat_unit(PuppetCommand::SetExpression {
            name: name.to_string(),
        })
    }

    fn clear_expression(&self) -> Result<()> {
        self.compat_unit(PuppetCommand::ClearExpression)
    }

    fn load_moc3_auxiliary(
        &self,
        expressions: &[(String, String)],
        motions: &[(String, String)],
        physics_json: Option<&str>,
    ) -> Result<()> {
        self.compat_unit(PuppetCommand::LoadMoc3Auxiliary {
            expressions: expressions.to_vec(),
            motions: motions.to_vec(),
            physics_json: physics_json.map(str::to_string),
        })
    }

    fn export_motion3(&self, clip_name: &str) -> Result<String> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Puppet world lock poisoned: {}", e)))?;
        world.export_motion3(clip_name).map_err(Error::Other)
    }

    fn export_expression3(&self, expression_name: &str) -> Result<String> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Puppet world lock poisoned: {}", e)))?;
        world
            .export_expression3(expression_name)
            .map_err(Error::Other)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_puppet_service_new() {
        let service = PuppetService::new();
        let snapshot = service.get_snapshot().unwrap();
        assert!(snapshot.nodes.is_empty());
    }

    #[test]
    fn test_puppet_service_default() {
        let service = PuppetService::default();
        let params = service.get_parameters().unwrap();
        assert!(params.is_empty());
    }

    #[test]
    fn test_puppet_service_tick_empty() {
        let service = PuppetService::new();
        let delta = service.tick(16.0).unwrap();
        assert!(delta.deformed_meshes.is_empty());
    }

    #[test]
    fn test_puppet_service_set_parameter_not_found() {
        let service = PuppetService::new();
        let result = service.set_parameter("nonexistent", 0.5);
        assert!(result.is_err());
    }

    #[test]
    fn typed_command_applies_and_advances_revision() {
        let service = PuppetService::new();

        let ack = service
            .apply_puppet_command(PuppetCommandEnvelope {
                seq: 1,
                base_revision: 0,
                transaction_id: None,
                command: PuppetCommand::Tick { delta_ms: 16.0 },
            })
            .unwrap();

        assert_eq!(ack.status, PuppetCommandAckStatus::Applied);
        assert_eq!(ack.applied_seq, 1);
        assert_eq!(ack.revision, 1);
        assert_eq!(service.current_revision().unwrap(), 1);
        assert!(ack.result.is_some());
    }

    #[test]
    fn typed_command_rejects_out_of_order_sequence() {
        let service = PuppetService::new();

        let ack = service
            .apply_puppet_command(PuppetCommandEnvelope {
                seq: 2,
                base_revision: 0,
                transaction_id: None,
                command: PuppetCommand::Tick { delta_ms: 16.0 },
            })
            .unwrap();

        assert_eq!(ack.status, PuppetCommandAckStatus::Rejected);
        assert_eq!(
            ack.error.as_ref().map(|error| error.code),
            Some(neko_engine_types::PuppetCommandErrorCode::Ordering)
        );
        assert_eq!(ack.revision, 0);
    }

    #[test]
    fn typed_command_rejects_revision_conflict_after_consuming_sequence() {
        let service = PuppetService::new();

        let first = service
            .apply_puppet_command(PuppetCommandEnvelope {
                seq: 1,
                base_revision: 0,
                transaction_id: None,
                command: PuppetCommand::Tick { delta_ms: 16.0 },
            })
            .unwrap();
        assert_eq!(first.status, PuppetCommandAckStatus::Applied);

        let stale = service
            .apply_puppet_command(PuppetCommandEnvelope {
                seq: 2,
                base_revision: 0,
                transaction_id: None,
                command: PuppetCommand::Tick { delta_ms: 16.0 },
            })
            .unwrap();
        assert_eq!(stale.status, PuppetCommandAckStatus::Rejected);
        assert_eq!(
            stale.error.as_ref().map(|error| error.code),
            Some(neko_engine_types::PuppetCommandErrorCode::RevisionConflict)
        );
        assert_eq!(stale.revision, 1);

        let next = service
            .apply_puppet_command(PuppetCommandEnvelope {
                seq: 3,
                base_revision: 1,
                transaction_id: None,
                command: PuppetCommand::Tick { delta_ms: 16.0 },
            })
            .unwrap();
        assert_eq!(next.status, PuppetCommandAckStatus::Applied);
        assert_eq!(next.revision, 2);
    }

    #[test]
    fn rest_alias_uses_typed_command_path() {
        let service = PuppetService::new();

        let delta = service.tick(16.0).unwrap();

        assert!(delta.deformed_meshes.is_empty());
        assert_eq!(service.current_revision().unwrap(), 1);
    }

    #[test]
    fn renderer_input_merges_deformed_meshes_with_snapshot_uvs() {
        let snapshots = vec![MeshSnapshot {
            node_id: "node-a".to_string(),
            vertices: vec![[0.0, 0.0], [1.0, 0.0], [1.0, 1.0]],
            uvs: vec![[0.0, 0.0], [1.0, 0.0], [1.0, 1.0]],
            indices: vec![0, 1, 2],
            texture_index: Some(2),
        }];
        let deformed = vec![DeformedMesh {
            node_id: "node-a".to_string(),
            vertices: vec![[2.0, 2.0], [3.0, 2.0], [3.0, 3.0]],
            blend_mode: "multiply".to_string(),
            opacity: 0.75,
            z_order: 4.0,
        }];

        let meshes = extract_renderer_meshes(&snapshots, &deformed).unwrap();

        assert_eq!(meshes.len(), 1);
        assert_eq!(meshes[0].atlas_id, "texture-2");
        assert_eq!(meshes[0].vertices, deformed[0].vertices);
        assert_eq!(meshes[0].uvs, snapshots[0].uvs);
        assert_eq!(meshes[0].blend_mode, PuppetBlendMode::Multiply);
    }

    #[test]
    fn render_gpu_frame_requires_configured_renderer() {
        let service = PuppetService::new();
        let err = service
            .render_gpu_frame(
                640,
                480,
                PuppetRenderTiming {
                    pts: 0,
                    duration: 16_667,
                    frame_index: 0,
                },
            )
            .unwrap_err();

        assert!(err.to_string().contains("GPU not available"));
    }

    #[test]
    fn export_h264_requires_gpu_renderer() {
        let service = PuppetService::new();
        let err = service
            .export_h264_to_path("/tmp/puppet.mp4", PuppetExportConfig::default())
            .unwrap_err();

        assert!(err.to_string().contains("GPU"));
    }
}
