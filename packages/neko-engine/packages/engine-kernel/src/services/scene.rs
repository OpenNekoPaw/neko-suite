//! Scene service trait for 3D scene management
//!
//! Provides an interface for loading, querying, and manipulating 3D scenes.

use crate::domain::FrameData;
use crate::gpu::scene_renderer::{
    CameraParams, ControlAckHealthSample, SceneRenderOutput, ViewportDescriptor,
};
use crate::services::pipeline_sink::PipelineOutput;
use neko_engine_types::easing::EasingType;
use neko_runtime_scene::animation_blend::SceneBlendLayerInfo;
use neko_runtime_scene::components::AnimationChannelInfo;
use neko_runtime_scene::ik::IkChainInfo;
use neko_runtime_scene::world::{AnimationClipInfo, SceneDelta, SceneSnapshot};
use neko_runtime_scene::{
    BrushPatchApplyOutcome, ModelingSession, ModelingSessionStateDelta, SceneCommandAck,
    SceneCommandEnvelope, TopologyChangeEvent, TopologyOperation, VertexBrushPatchMetadata,
};
use std::collections::HashMap;
use std::path::Path;

/// Service interface for 3D scene management
#[allow(async_fn_in_trait)]
pub trait ISceneService: Send + Sync {
    /// Load a glTF/glb model and return a scene snapshot
    fn load_model(&self, path: &Path) -> crate::error::Result<SceneSnapshot>;

    /// Get the current scene graph snapshot
    fn get_snapshot(&self) -> crate::error::Result<SceneSnapshot>;

    /// Update a node's transform
    fn update_transform(
        &self,
        node_id: &str,
        position: [f32; 3],
        rotation: [f32; 4],
        scale: [f32; 3],
    ) -> crate::error::Result<()>;

    /// Advance animation by one tick
    fn tick(&self, clip_name: &str, time: f32) -> crate::error::Result<SceneDelta>;

    /// Get available animation clips
    fn get_animation_clips(&self) -> crate::error::Result<Vec<AnimationClipInfo>>;

    /// Create a parametric shape and add it to the scene
    fn create_shape(
        &self,
        params: serde_json::Value,
    ) -> crate::error::Result<neko_runtime_scene::world::SceneSnapshot>;

    /// Create extruded 3D text and add it to the scene
    fn create_text_mesh(
        &self,
        params: serde_json::Value,
    ) -> crate::error::Result<neko_runtime_scene::world::SceneSnapshot>;

    /// Perform CSG boolean operation on two scene entities
    fn csg_boolean(
        &self,
        entity_a: &str,
        entity_b: &str,
        operation: &str,
    ) -> crate::error::Result<neko_runtime_scene::world::SceneSnapshot>;

    /// Render the current scene to a GPU texture.
    ///
    /// Performs tick + render in the same lock scope to avoid race conditions.
    /// Returns None if GPU is not available.
    fn render_frame(
        &self,
        clip_name: Option<&str>,
        time: f32,
        output_size: (u32, u32),
        camera_override: Option<&CameraParams>,
        background_color: Option<[f32; 4]>,
    ) -> crate::error::Result<SceneRenderOutput>;

    /// Capture the current scene as a display JPEG frame.
    fn capture_display_frame(
        &self,
        clip_name: Option<&str>,
        time: f32,
        output_size: (u32, u32),
        camera_override: Option<&CameraParams>,
        background_color: Option<[f32; 4]>,
        quality: u8,
    ) -> crate::error::Result<FrameData>;

    /// Capture one H.264 keyframe for the legacy scene stream path.
    fn capture_h264_keyframe(
        &self,
        output_size: (u32, u32),
        camera_override: Option<&CameraParams>,
        background_color: Option<[f32; 4]>,
        quality: u32,
        pts_us: i64,
        duration_us: i64,
        viewport: &ViewportDescriptor,
    ) -> crate::error::Result<FrameData>;

    /// Render one GPU-resident scene stream output frame.
    fn render_scene_stream_gpu_output(
        &self,
        output_size: (u32, u32),
        camera_override: Option<&CameraParams>,
        background_color: Option<[f32; 4]>,
        pts_us: i64,
        duration_us: i64,
        frame_index: u64,
        viewport: &ViewportDescriptor,
    ) -> crate::error::Result<PipelineOutput>;

    /// Set the editor camera used by realtime scene stream rendering.
    fn set_editor_camera(&self, camera: CameraParams);

    /// Get the current editor camera used by realtime scene stream rendering.
    fn get_editor_camera(&self) -> Option<CameraParams>;

    /// Report control acknowledgement health for adaptive scene streaming.
    fn control_ack_health_sample(&self, render_backlog_frames: u32) -> ControlAckHealthSample;

    /// Current scene command revision for stream descriptors and conflict detection.
    fn current_revision(&self) -> crate::error::Result<u64>;

    /// Apply a realtime scene command and return command acknowledgements plus optional delta.
    fn apply_scene_command_with_delta(
        &self,
        envelope: SceneCommandEnvelope,
    ) -> crate::error::Result<(Vec<SceneCommandAck>, Option<SceneDelta>)>;

    /// Begin an interactive modeling session for a mesh.
    fn begin_modeling_session(
        &self,
        session_id: String,
        mesh_id: String,
        character_id: Option<String>,
        topology_mutable: bool,
        before_hash: String,
    ) -> crate::error::Result<(ModelingSession, Option<SceneDelta>)>;

    /// Commit topology changes from an interactive modeling session.
    fn commit_modeling_session(
        &self,
        session_id: &str,
        operation: TopologyOperation,
        vertex_count_before: u32,
        vertex_count_after: u32,
    ) -> crate::error::Result<(TopologyChangeEvent, Option<SceneDelta>)>;

    /// Cancel an interactive modeling session without committing topology changes.
    fn cancel_modeling_session(
        &self,
        session_id: &str,
    ) -> crate::error::Result<(ModelingSessionStateDelta, Option<SceneDelta>)>;

    /// Apply one binary vertex brush patch to an active modeling session.
    fn apply_vertex_brush_patch(
        &self,
        patch: VertexBrushPatchMetadata,
    ) -> crate::error::Result<BrushPatchApplyOutcome>;

    /// Export the current scene to GLB binary format
    fn export_glb(&self) -> crate::error::Result<Vec<u8>>;

    /// Save the current scene as a .nkm project file
    fn save_project(&self, path: &str, editor_state: serde_json::Value)
        -> crate::error::Result<()>;

    /// Load a .nkm project file and restore the scene
    fn load_project(&self, path: &str) -> crate::error::Result<(SceneSnapshot, serde_json::Value)>;

    /// Get keyframe tracks for a named animation clip
    fn get_keyframe_tracks(
        &self,
        clip_name: &str,
    ) -> crate::error::Result<Vec<AnimationChannelInfo>>;

    /// Add a keyframe to a channel within a named clip
    fn add_keyframe(
        &self,
        clip_name: &str,
        node_id: &str,
        property: &str,
        timestamp: f32,
        values: Vec<f32>,
    ) -> crate::error::Result<String>;

    /// Remove a keyframe by ID from a named clip
    fn remove_keyframe(&self, clip_name: &str, keyframe_id: &str) -> crate::error::Result<()>;

    /// Update a keyframe by ID (partial update)
    fn update_keyframe(
        &self,
        clip_name: &str,
        keyframe_id: &str,
        timestamp: Option<f32>,
        values: Option<Vec<f32>>,
        easing: Option<EasingType>,
    ) -> crate::error::Result<()>;

    /// Create a new empty animation clip
    fn create_clip(&self, name: &str, duration: f32) -> crate::error::Result<()>;

    /// Crossfade to a named animation clip
    fn crossfade_animation(
        &self,
        clip_name: &str,
        fade_duration: f32,
        loop_anim: bool,
    ) -> crate::error::Result<()>;

    /// Set blend weight for a named clip layer
    fn set_blend_weight(&self, clip_name: &str, weight: f32) -> crate::error::Result<()>;

    /// Get the current blend state
    fn get_blend_state(&self) -> crate::error::Result<Vec<SceneBlendLayerInfo>>;

    /// Create an IK chain between two joints
    fn create_ik_chain(
        &self,
        root_joint: &str,
        end_effector: &str,
        solver: &str,
        iterations: u32,
        tolerance: f32,
    ) -> crate::error::Result<String>;

    /// Remove an IK chain by ID
    fn remove_ik_chain(&self, chain_id: &str) -> crate::error::Result<()>;

    /// Set the IK target position/rotation/pole for a chain
    fn set_ik_target(
        &self,
        chain_id: &str,
        position: [f32; 3],
        rotation: Option<[f32; 4]>,
        pole: Option<[f32; 3]>,
    ) -> crate::error::Result<()>;

    /// Enable/disable an IK chain
    fn set_ik_enabled(&self, chain_id: &str, enabled: bool) -> crate::error::Result<()>;

    /// Get all IK chains
    fn get_ik_chains(&self) -> crate::error::Result<Vec<IkChainInfo>>;

    /// Set visibility of a scene node
    fn set_visible(&self, node_id: &str, visible: bool) -> crate::error::Result<()>;

    /// Set morph target weights on a mesh node
    fn set_morph_weights(&self, node_id: &str, weights: Vec<f32>) -> crate::error::Result<()>;

    /// Update VRM face parameter presets (for export to VRMC_vrm extension)
    fn set_face_params(&self, params: HashMap<String, f32>) -> crate::error::Result<()>;

    /// Get current VRM face parameter presets
    fn get_face_params(&self) -> crate::error::Result<HashMap<String, f32>>;

    /// Update material parameters on a node. Only provided fields are changed.
    fn update_material(
        &self,
        node_id: &str,
        base_color: Option<[f32; 4]>,
        metallic: Option<f32>,
        roughness: Option<f32>,
        emissive: Option<[f32; 3]>,
        occlusion_strength: Option<f32>,
    ) -> crate::error::Result<()>;

    /// Delete a node and all its descendants from the scene
    fn delete_node(&self, node_id: &str) -> crate::error::Result<()>;
}
