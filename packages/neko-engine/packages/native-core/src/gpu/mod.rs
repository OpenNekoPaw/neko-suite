//! GPU module - wgpu-based GPU processing
//!
//! Provides:
//! - GPU context and device management
//! - Texture-to-texture effects processing (color correction, blur, style)
//! - Transition effects between video clips
//! - Multi-layer compositor for video compositing
//! - Texture management for zero-copy frame transfer
//! - Buffer pooling for efficient memory reuse
//! - NV12 texture import for zero-copy hardware decoding
//! - RGBA to NV12 conversion for hardware encoding
//! - GPU encoder bridge for zero-copy encoding pipeline

mod blur_processor;
mod buffer_pool;
mod compositor;
pub mod lut3d;
mod context;
pub mod custom_shader_processor;
mod encoder_bridge;
mod gpu_layer;
mod mask_rasterizer;
mod hal_import;
mod nv12_import;
mod nv12_renderer;
mod rgba_to_nv12;
mod rgba_to_nv12_texture;
pub mod shaders;
mod shape_rasterizer;
mod style_processor;
mod text_renderer;
mod texture;
mod texture_compositor;
pub mod scene_renderer;
mod texture_transition_processor;
mod transition_processor;

// Platform-specific zero-copy import modules
#[cfg(target_os = "linux")]
mod linux_export;
#[cfg(target_os = "linux")]
mod linux_import;
#[cfg(target_os = "macos")]
mod macos_export;
#[cfg(target_os = "macos")]
mod macos_import;
#[cfg(target_os = "windows")]
mod windows_export;
#[cfg(target_os = "windows")]
mod windows_import;

pub use blur_processor::{BlurParams, BlurType, GpuBlurProcessor, SharpenParams};
pub use lut3d::{Lut3DData, LutRegistry};
pub use compositor::{
    BlendMode, CompositeLayer, CompositeResult, GpuCompositor, LayerPixelFormat, Transform2D,
};
pub use context::{GpuContext, GpuInfo};
pub use custom_shader_processor::{
    CustomShaderProcessor, DynamicUniforms, ParamDef, PresetShaderMeta,
};
pub use encoder_bridge::{GpuBufferHandle, GpuBufferHandles, GpuEncoderFrame};
pub use nv12_import::{
    ColorSpace, ImportedNv12Texture, Nv12FrameData, Nv12TextureImporter, Nv12Uniforms,
    NV12_TO_RGB_SHADER,
};
pub use nv12_renderer::{Nv12RenderCache, Nv12Renderer};
pub use rgba_to_nv12::{
    Nv12OutputBuffers, RgbaToNv12Converter, RgbaToNv12Uniforms, RGBA_TO_NV12_SHADER,
};
pub use style_processor::{
    ChromaKeyParams, ChromaticAberrationParams, ColorCorrectionTexParams, FilmGrainParams,
    GlowParams, GpuStyleProcessor, LumaKeyParams, VignetteParams,
};
pub use texture::{TextureFormat, TextureHandle, TexturePool};
pub use texture_transition_processor::TextureTransitionProcessor;
pub use transition_processor::{GpuTransitionProcessor, TransitionParams, TransitionType};

// Platform-specific exports
#[cfg(target_os = "linux")]
pub use linux_export::{
    CudaExportInfo, ExportedNv12Frame, LinuxExportBackingStore, LinuxTextureExporter,
};
#[cfg(all(target_os = "linux", feature = "cuda"))]
pub use linux_import::CudaTextureImporter;
#[cfg(target_os = "linux")]
pub use linux_import::{DmaBufFrame, DmaBufPlane, LinuxTextureImporter};
#[cfg(target_os = "macos")]
pub use macos_import::MacOsTextureImporter;
#[cfg(target_os = "macos")]
pub use rgba_to_nv12_texture::RgbaToNv12TextureConverter;
#[cfg(target_os = "windows")]
pub use windows_export::{ExportedNv12Handles, WindowsExportBackingStore, WindowsTextureExporter};
#[cfg(target_os = "windows")]
pub use windows_import::WindowsTextureImporter;

pub use gpu_layer::{GpuLayer, GpuLayerBuilder};
pub use mask_rasterizer::MaskRasterizer;
pub use shape_rasterizer::{RasterizedShape, ShapeRasterizer};
pub use text_renderer::{TextRenderer, TextShadowStyle, TextStyle};
pub use texture_compositor::{TextureCompositeResult, TextureCompositor};
pub use scene_renderer::{AssetCache, CameraParams, PbrRenderError, PbrRenderer, PbrVertex, SceneRenderOutput};
