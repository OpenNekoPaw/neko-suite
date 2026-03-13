//! 3D scene renderer module
//!
//! Provides PBR rendering of ECS scene data to GPU textures,
//! bridging native-scene (ECS) with the 2D compositing pipeline (GpuLayer).
//!
//! Architecture:
//! ```text
//! native-scene (ECS World)
//!     ↓ query Components
//! AssetCache (glTF → GPU buffers)
//!     ↓
//! PbrRenderer → SceneRenderOutput (wgpu::Texture)
//!     ↓ into_gpu_layer()
//! TextureCompositor (2D compositing)
//! ```

pub mod asset_cache;
pub mod environment;
pub mod particles;
pub mod pbr_pipeline;
pub mod post_process;
pub mod vertex;

pub use asset_cache::{AssetCache, AssetCacheError, GpuMaterial, GpuMesh, MaterialUniforms};
pub use environment::Environment;
pub use particles::{GpuParticleSystem, ParticleEmitterConfig};
pub use pbr_pipeline::{PbrRenderError, PbrRenderer};
pub use post_process::{PostProcessChain, PostProcessSettings, ToneMapping};
pub use vertex::PbrVertex;

use crate::gpu::{BlendMode, GpuLayer, Transform2D};

/// Output from a 3D scene render pass
pub struct SceneRenderOutput {
    /// Color buffer (Rgba16Float, matches TextureCompositor)
    pub color_texture: wgpu::Texture,
    /// Color texture view for sampling
    pub color_view: wgpu::TextureView,
    /// Depth buffer (Depth32Float, for post-processing DOF etc.)
    pub depth_texture: wgpu::Texture,
    /// Output width in pixels
    pub width: u32,
    /// Output height in pixels
    pub height: u32,
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
        GpuLayer::from_rgba(
            self.color_texture,
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
            position: glam::Vec3::new(0.0, 1.5, 3.0),
            target: glam::Vec3::ZERO,
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
