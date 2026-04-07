//! Scene service trait for 3D scene management
//!
//! Provides an interface for loading, querying, and manipulating 3D scenes.

use crate::gpu::scene_renderer::{CameraParams, SceneRenderOutput};
use crate::gpu::PbrRenderError;
use neko_native_scene::animation_blend::SceneBlendLayerInfo;
use neko_native_scene::components::AnimationChannelInfo;
use neko_native_scene::ik::IkChainInfo;
use neko_native_scene::world::{AnimationClipInfo, SceneDelta, SceneSnapshot};
use neko_types::easing::EasingType;
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
    ) -> crate::error::Result<neko_native_scene::world::SceneSnapshot>;

    /// Create extruded 3D text and add it to the scene
    fn create_text_mesh(
        &self,
        params: serde_json::Value,
    ) -> crate::error::Result<neko_native_scene::world::SceneSnapshot>;

    /// Perform CSG boolean operation on two scene entities
    fn csg_boolean(
        &self,
        entity_a: &str,
        entity_b: &str,
        operation: &str,
    ) -> crate::error::Result<neko_native_scene::world::SceneSnapshot>;

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
