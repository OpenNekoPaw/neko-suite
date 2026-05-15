//! Puppet service trait for 2D puppet management
//!
//! Provides an interface for loading, querying, and manipulating 2D puppets.
//! Mirrors the ISceneService pattern for 3D scenes.

use neko_engine_types::easing::EasingType;
use neko_engine_types::{PuppetCommandAck, PuppetCommandEnvelope};
use neko_runtime_puppet::animation::{AnimationClipInfo, ParameterCurveInfo};
use neko_runtime_puppet::animation_blend::BlendLayerInfo;
use neko_runtime_puppet::moc3::expression::ExpressionInfo;
use neko_runtime_puppet::world::{DeformedMesh, ParameterInfo, PuppetDelta, PuppetSnapshot};

use super::pipeline_sink::PipelineSink;
use neko_engine_types::VideoOutput;

/// Puppet clip export configuration.
#[derive(Debug, Clone, Copy, serde::Deserialize, serde::Serialize)]
pub struct PuppetExportConfig {
    /// Output width in pixels.
    pub width: u32,
    /// Output height in pixels.
    pub height: u32,
    /// Output frame rate.
    pub fps: f64,
    /// Export duration in milliseconds.
    pub duration_ms: f64,
    /// Target video bitrate.
    pub bitrate: u64,
    /// GOP size in frames.
    pub gop_size: u32,
}

impl Default for PuppetExportConfig {
    fn default() -> Self {
        Self {
            width: 512,
            height: 512,
            fps: 60.0,
            duration_ms: 1_000.0,
            bitrate: 2_000_000,
            gop_size: 60,
        }
    }
}

/// Summary returned after submitting puppet frames to an export sink.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
pub struct PuppetExportSummary {
    /// Number of submitted frames.
    pub frames_submitted: u64,
}

/// Puppet render timing metadata.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PuppetRenderTiming {
    /// Presentation timestamp in microseconds.
    pub pts: i64,
    /// Frame duration in microseconds.
    pub duration: i64,
    /// Monotonic frame index.
    pub frame_index: u64,
}

/// Service interface for 2D puppet management
#[allow(async_fn_in_trait)]
pub trait IPuppetService: Send + Sync {
    /// Current command revision for conflict detection
    fn current_revision(&self) -> crate::error::Result<u64>;

    /// Apply a typed puppet command envelope
    fn apply_puppet_command(
        &self,
        envelope: PuppetCommandEnvelope,
    ) -> crate::error::Result<PuppetCommandAck>;

    /// Apply a compatibility command using the service-owned sequence cursor
    fn apply_puppet_command_alias(
        &self,
        command: neko_engine_types::PuppetCommand,
    ) -> crate::error::Result<PuppetCommandAck>;

    /// Load a puppet from INP binary data and return a snapshot
    fn load_puppet(&self, data: &[u8]) -> crate::error::Result<PuppetSnapshot>;

    /// Get the current puppet snapshot
    fn get_snapshot(&self) -> crate::error::Result<PuppetSnapshot>;

    /// Set a parameter value (triggers deformation recompute)
    fn set_parameter(&self, name: &str, value: f32) -> crate::error::Result<()>;

    /// Get all parameter definitions
    fn get_parameters(&self) -> crate::error::Result<Vec<ParameterInfo>>;

    /// Advance physics simulation and return deformed mesh data
    fn tick(&self, delta_ms: f32) -> crate::error::Result<PuppetDelta>;

    /// Get current deformed mesh data without advancing physics
    fn get_deformed_meshes(&self) -> crate::error::Result<Vec<DeformedMesh>>;

    /// Render the current puppet state into a PipelineSink-compatible GPU frame
    fn render_gpu_frame(
        &self,
        width: u32,
        height: u32,
        timing: PuppetRenderTiming,
    ) -> crate::error::Result<VideoOutput>;

    /// Render the current puppet state and submit it to a PipelineSink.
    fn submit_rendered_frame_to_sink(
        &self,
        sink: &dyn PipelineSink,
        width: u32,
        height: u32,
        timing: PuppetRenderTiming,
    ) -> crate::error::Result<()>;

    /// Submit a rendered puppet clip to an existing sink.
    fn export_rendered_clip_to_sink(
        &self,
        sink: &dyn PipelineSink,
        config: PuppetExportConfig,
    ) -> crate::error::Result<PuppetExportSummary>;

    /// Export a rendered puppet clip to an H.264 container path through MuxerSink.
    fn export_h264_to_path(
        &self,
        output_path: &str,
        config: PuppetExportConfig,
    ) -> crate::error::Result<PuppetExportSummary>;

    /// Get all available animation clip descriptions
    fn get_animations(&self) -> crate::error::Result<Vec<AnimationClipInfo>>;

    /// Play a named animation clip
    fn play_animation(&self, name: &str, loop_anim: bool) -> crate::error::Result<()>;

    /// Stop the current animation
    fn stop_animation(&self) -> crate::error::Result<()>;

    /// Seek the current animation to a time position (milliseconds)
    fn seek_animation(&self, time_ms: f32) -> crate::error::Result<()>;

    /// Get all keyframe tracks for a named animation clip
    fn get_keyframe_tracks(&self, clip_name: &str)
        -> crate::error::Result<Vec<ParameterCurveInfo>>;

    /// Add a keyframe to a parameter curve within a clip
    fn add_keyframe(
        &self,
        clip_name: &str,
        param_name: &str,
        time_ms: f32,
        value: f32,
    ) -> crate::error::Result<String>;

    /// Remove a keyframe by ID
    fn remove_keyframe(
        &self,
        clip_name: &str,
        param_name: &str,
        keyframe_id: &str,
    ) -> crate::error::Result<()>;

    /// Update a keyframe by ID (partial update)
    fn update_keyframe(
        &self,
        clip_name: &str,
        param_name: &str,
        keyframe_id: &str,
        time_ms: Option<f32>,
        value: Option<f32>,
        easing: Option<EasingType>,
    ) -> crate::error::Result<()>;

    /// Create a new empty animation clip
    fn create_clip(&self, name: &str, duration_ms: f32) -> crate::error::Result<()>;

    /// Crossfade from current animation(s) to a target clip
    fn crossfade_animation(
        &self,
        clip_name: &str,
        fade_duration_ms: f32,
        loop_anim: bool,
    ) -> crate::error::Result<()>;

    /// Set the blend weight for a specific clip layer
    fn set_blend_weight(&self, clip_name: &str, weight: f32) -> crate::error::Result<()>;

    /// Get the current blend state (all active layers)
    fn get_blend_state(&self) -> crate::error::Result<Vec<BlendLayerInfo>>;

    /// Set opacity for a specific puppet node (0.0 = transparent, 1.0 = opaque)
    fn set_node_opacity(&self, node_id: &str, opacity: f32) -> crate::error::Result<()>;

    /// Set texture index for a specific puppet node (hot-swap textures)
    fn set_texture(&self, node_id: &str, texture_index: usize) -> crate::error::Result<()>;

    /// Get available expression names (MOC3)
    fn get_expressions(&self) -> crate::error::Result<Vec<ExpressionInfo>>;

    /// Activate an expression by name (MOC3)
    fn set_expression(&self, name: &str) -> crate::error::Result<()>;

    /// Clear the active expression (triggers fade-out, then removal)
    fn clear_expression(&self) -> crate::error::Result<()>;

    /// Load auxiliary MOC3 files (expressions, motions, physics)
    fn load_moc3_auxiliary(
        &self,
        expressions: &[(String, String)],
        motions: &[(String, String)],
        physics_json: Option<&str>,
    ) -> crate::error::Result<()>;

    /// Export an animation clip to .motion3.json format string
    fn export_motion3(&self, clip_name: &str) -> crate::error::Result<String>;

    /// Export an expression to .exp3.json format string
    fn export_expression3(&self, expression_name: &str) -> crate::error::Result<String>;
}
