//! Temporary GPU compatibility surface.
//!
//! Reusable GPU infrastructure now lives in `neko-engine-gpu`. This module
//! keeps existing `neko_engine_kernel::gpu::<Name>` imports stable for a
//! reviewed allowlist while host callers migrate to `contracts`.

#![allow(deprecated)]

#[cfg(all(target_os = "linux", feature = "cuda"))]
pub use neko_engine_gpu::CudaTextureImporter;
#[cfg(target_os = "macos")]
pub use neko_engine_gpu::RgbaToNv12TextureConverter;
pub use neko_engine_gpu::{
    ColorSpace, CompositeLayer, EffectDispatcher, GpuBudgetController, GpuCompositor, GpuContext,
    GpuElementMask, GpuLayer, GpuLayerBuilder, GpuMaskBezierPoint, GpuMaskShape, GpuPermit,
    GpuReadbackTarget, GpuShapeElementData, GpuShapeFillData, GpuShapeGradientData,
    GpuShapeGradientStop, GpuShapeShadowData, GpuShapeStrokeData, GpuTransitionProcessor,
    LayerPixelFormat, Lut3DData, LutRegistry, MaskRasterizer, Nv12OutputBuffers, Nv12RenderCache,
    Nv12Renderer, Nv12TextureImporter, PipelinePriority, RgbaToNv12Converter, ShapeRasterizer,
    TextRenderer, TextShadowStyle, TextStyle, TextureCompositeResult, TextureCompositor,
    TextureTransitionProcessor, Transform2D, TransitionParams, TransitionType,
};
#[cfg(target_os = "linux")]
pub use neko_engine_gpu::{
    CudaExportInfo, DmaBufFrame, DmaBufPlane, ExportedNv12Frame, LinuxExportBackingStore,
    LinuxTextureExporter, LinuxTextureImporter,
};
#[cfg(target_os = "windows")]
pub use neko_engine_gpu::{
    ExportedNv12Handles, WindowsExportBackingStore, WindowsTextureExporter, WindowsTextureImporter,
};
pub use neko_engine_panoramic_renderer::{PanoramicRenderOutput, PanoramicRenderer};
pub use neko_engine_puppet_renderer::{
    PuppetBlendMode, PuppetMeshInput, PuppetRenderOutput, PuppetRenderRequest, PuppetRenderer,
    PuppetTextureAtlasInput,
};
/// Compatibility module for callers that still import
/// `engine_kernel::gpu::custom_shader_processor::*`.
pub mod custom_shader_processor {
    pub use neko_engine_gpu::{CustomShaderProcessor, ParamDef, PresetShaderMeta};
}

/// Compatibility module for callers that still import
/// `engine_kernel::gpu::scene_renderer::*`.
pub mod scene_renderer {
    pub use neko_engine_scene_renderer::{
        extract_render_world, AssetCache, CameraParams, ControlAckHealthSample,
        DegradationDecision, DegradationHysteresis, DegradationStep, FrameLoadSample,
        FrameScheduleDecision, FrameScheduler, PbrRenderer, RenderExtractStats, RenderWorld,
        SceneRenderOutput, SceneToneMapping, ViewportDebugView, ViewportDescriptor,
        ViewportPostProcess, ViewportRenderGraphOutput, ViewportRenderMode, ViewportWorkMode,
    };
}
