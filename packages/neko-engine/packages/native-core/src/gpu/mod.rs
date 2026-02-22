//! GPU module - wgpu-based GPU processing
//!
//! Provides:
//! - GPU context and device management
//! - Compute shader-based effects processing
//! - Blur and sharpen effects processing
//! - Style effects (vignette, film grain, glow, chromatic aberration)
//! - Transition effects between video clips
//! - Multi-layer compositor for video compositing
//! - Texture management for zero-copy frame transfer
//! - Buffer pooling for efficient memory reuse
//! - NV12 texture import for zero-copy hardware decoding
//! - RGBA to NV12 conversion for hardware encoding
//! - GPU encoder bridge for zero-copy encoding pipeline
//! - Unified zero-copy pipeline interface

mod blur_processor;
mod buffer_pool;
mod compositor;
mod context;
mod encoder_bridge;
mod gpu_layer;
mod hal_import;
mod nv12_import;
mod nv12_renderer;
mod processor;
mod rgba_to_nv12;
mod rgba_to_nv12_texture;
pub mod shaders;
mod style_processor;
mod texture;
mod transition_processor;
mod texture_compositor;
mod gpu_pipeline;
mod text_renderer;

// Platform-specific zero-copy import modules
#[cfg(target_os = "macos")]
mod macos_import;
#[cfg(target_os = "macos")]
mod macos_export;
#[cfg(target_os = "linux")]
mod linux_import;
#[cfg(target_os = "linux")]
mod linux_export;
#[cfg(target_os = "windows")]
mod windows_import;
#[cfg(target_os = "windows")]
mod windows_export;

pub use blur_processor::{BlurParams, BlurType, GpuBlurProcessor, SharpenParams};
pub use compositor::{
    BlendMode, CompositeLayer, CompositeResult, GpuCompositor, LayerPixelFormat,
    Transform2D,
};
pub use context::{GpuContext, GpuInfo};
pub use processor::{EffectParams, GpuProcessor};
pub use style_processor::{
    ChromaticAberrationParams, FilmGrainParams, GlowParams, GpuStyleProcessor, VignetteParams,
};
pub use texture::{TextureFormat, TextureHandle, TexturePool};
pub use transition_processor::{GpuTransitionProcessor, TransitionParams, TransitionType};
pub use nv12_import::{
    ColorSpace, ImportedNv12Texture, Nv12FrameData, Nv12TextureImporter, Nv12Uniforms,
    NV12_TO_RGB_SHADER,
};
pub use nv12_renderer::{Nv12RenderCache, Nv12Renderer};
pub use rgba_to_nv12::{
    Nv12OutputBuffers, RgbaToNv12Converter, RgbaToNv12Uniforms, RGBA_TO_NV12_SHADER,
};
pub use encoder_bridge::{
    GpuEncoderBridge, GpuEncoderFrame, GpuHwEncoder,
};

// Platform-specific exports
#[cfg(target_os = "macos")]
pub use macos_import::MacOsTextureImporter;
#[cfg(target_os = "macos")]
pub use rgba_to_nv12_texture::RgbaToNv12TextureConverter;
#[cfg(target_os = "linux")]
pub use linux_import::{CudaTextureImporter, DmaBufFrame, DmaBufPlane, LinuxTextureImporter};
#[cfg(target_os = "linux")]
pub use linux_export::{LinuxTextureExporter, LinuxExportBackingStore, ExportedNv12Frame, CudaExportInfo};
#[cfg(target_os = "windows")]
pub use windows_import::WindowsTextureImporter;
#[cfg(target_os = "windows")]
pub use windows_export::{WindowsTextureExporter, WindowsExportBackingStore, ExportedNv12Handles};

pub use gpu_layer::{GpuLayer, GpuLayerBuilder};
pub use texture_compositor::{TextureCompositeResult, TextureCompositor};
pub use text_renderer::TextRenderer;
