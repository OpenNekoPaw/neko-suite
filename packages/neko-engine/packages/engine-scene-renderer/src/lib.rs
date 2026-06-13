//! 3D scene renderer module
//!
//! Provides PBR rendering of ECS scene data to GPU textures,
//! bridging runtime-scene (ECS) with the 2D compositing pipeline (GpuLayer).
//!
//! Architecture:
//! ```text
//! runtime-scene (ECS World)
//!     ↓ query Components
//! AssetCache (glTF → GPU buffers)
//!     ↓
//! PbrRenderer → SceneRenderOutput (wgpu::Texture)
//!     ↓ into_gpu_layer()
//! TextureCompositor (2D compositing)
//! ```

#[cfg(test)]
mod architecture_tests;

pub mod asset_cache;
pub mod environment;
pub mod frame_scheduler;
pub mod particles;
pub mod pbr_pipeline;
pub mod post_process;
pub mod render_extract;
pub mod render_graph;
pub mod render_graph_presets;
pub mod render_systems;
pub mod render_target_pool;
pub mod render_world;
pub mod scene_morph_adapter;
pub mod vertex;
pub mod viewport;

pub use asset_cache::{AssetCache, AssetCacheError, GpuMaterial, GpuMesh, MaterialUniforms};
pub use environment::Environment;
pub use frame_scheduler::{
    ControlAckHealthSample, DegradationDecision, DegradationHysteresis, DegradationStep,
    FrameBudget, FrameLoadSample, FrameScheduleDecision, FrameScheduler,
};
pub use particles::{GpuParticleSystem, ParticleEmitterConfig};
pub use pbr_pipeline::{
    EnvironmentBackground, EnvironmentBackgroundSettings, PbrRenderError, PbrRenderer,
};
pub use post_process::{PostProcessChain, PostProcessSettings, ToneMapping};
pub use render_extract::{extract_render_world, RenderExtractStats};
pub use render_graph::{
    CompiledRenderGraph, CompiledRenderPass, RenderGraph, RenderGraphError, RenderGraphExecutor,
    RenderPassDesc, RenderPassId, RenderResourceDesc, RenderResourceId, RenderResourceKind,
};
pub use render_graph_presets::{
    build_standard_scene_render_graph, StandardSceneRenderGraphOptions, RESOURCE_ENCODER_INPUT,
    RESOURCE_ENCODER_PACKET, RESOURCE_HELPER_COLOR, RESOURCE_SCENE_COLOR, RESOURCE_SCENE_DEPTH,
    RESOURCE_TONEMAPPED_COLOR,
};
pub use render_systems::{RenderSystemLabel, RENDER_SYSTEM_ORDER};
pub use render_target_pool::{RenderTargetLease, RenderTargetPool, RenderTargetPoolSnapshot};
pub use render_world::{
    DrawItem, GpuMaterialHandle, GpuMeshHandle, RenderCameraData, RenderInstance, RenderLightData,
    RenderLightKind, RenderMaterialData, RenderWorld,
};
pub use scene_morph_adapter::{
    require_scene_morph_compute_adapter, unsupported_scene_morph_compute,
    SceneMorphComputeDiagnostic,
};
pub use vertex::PbrVertex;
pub use viewport::{
    build_viewport_render_graph, SceneColorSpace, SceneToneMapping, ViewportDebugView,
    ViewportDescriptor, ViewportH264Settings, ViewportLiveSettings, ViewportLookDevSettings,
    ViewportMaterialOverride, ViewportMaterialOverrideKind, ViewportPostProcess,
    ViewportRenderGraphOutput, ViewportRenderGraphPlan, ViewportRenderGraphVariant,
    ViewportRenderMode, ViewportWorkMode,
};

use neko_engine_gpu::{GpuLayer, Transform2D};
use neko_engine_types::BlendMode;

/// Output from a 3D scene render pass
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SceneRenderGraphExecution {
    pub variant: ViewportRenderGraphVariant,
    pub pass_ids: Vec<String>,
    pub helper_passes: bool,
    pub post_process: bool,
    pub color_convert: bool,
    pub encoder_copy: bool,
}

/// Output from a 3D scene render pass
pub struct SceneRenderOutput {
    /// Color buffer (Rgba16Float, matches TextureCompositor)
    pub color_texture: RenderTargetLease,
    /// Color texture view for sampling
    pub color_view: wgpu::TextureView,
    /// Depth buffer (Depth32Float, for post-processing DOF etc.)
    pub depth_texture: RenderTargetLease,
    /// Output width in pixels
    pub width: u32,
    /// Output height in pixels
    pub height: u32,
    /// RenderGraph variant and pass list used to produce the frame.
    pub graph_execution: SceneRenderGraphExecution,
}

impl SceneRenderOutput {
    /// Convert 3D render output into a 2D compositing layer (zero-copy).
    ///
    /// The color_texture (Rgba16Float) is directly consumed by TextureCompositor
    /// without any format conversion.
    pub fn into_gpu_layer(
        self,
        transform: Transform2D,
        opacity: f32,
        blend_mode: BlendMode,
        z_index: i32,
    ) -> GpuLayer {
        let color_texture = self.color_texture.into_texture();
        GpuLayer::from_rgba(
            color_texture,
            self.width,
            self.height,
            transform,
            opacity,
            blend_mode,
            z_index,
        )
    }
}

/// Camera parameters for scene rendering
#[derive(Debug, Clone)]
pub struct CameraParams {
    /// Camera position in world space
    pub position: glam::Vec3,
    /// Look-at target
    pub target: glam::Vec3,
    /// Up vector
    pub up: glam::Vec3,
    /// Vertical field of view in radians
    pub fov_y: f32,
    /// Near clip plane
    pub near: f32,
    /// Far clip plane
    pub far: f32,
}

impl Default for CameraParams {
    fn default() -> Self {
        Self {
            position: glam::Vec3::new(0.0, 1.0, 3.0),
            target: glam::Vec3::new(0.0, 0.9, 0.0),
            up: glam::Vec3::Y,
            fov_y: 45.0_f32.to_radians(),
            near: 0.1,
            far: 1000.0,
        }
    }
}

impl CameraParams {
    /// Build view matrix (world → camera space)
    pub fn view_matrix(&self) -> glam::Mat4 {
        glam::Mat4::look_at_rh(self.position, self.target, self.up)
    }

    /// Build projection matrix
    pub fn projection_matrix(&self, aspect_ratio: f32) -> glam::Mat4 {
        glam::Mat4::perspective_rh(self.fov_y, aspect_ratio, self.near, self.far)
    }
}
