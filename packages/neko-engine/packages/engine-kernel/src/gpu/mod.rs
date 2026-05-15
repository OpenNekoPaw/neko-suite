//! Temporary GPU compatibility surface.
//!
//! Reusable GPU infrastructure now lives in `neko-engine-gpu`. This module
//! keeps existing `neko_engine_kernel::gpu::<Name>` imports stable for a
//! reviewed allowlist while host callers migrate to `contracts`.

#![allow(deprecated, unused_imports)]

pub mod boundary;

#[cfg(all(target_os = "linux", feature = "cuda"))]
pub use neko_engine_gpu::CudaTextureImporter;
pub use neko_engine_gpu::{
    default_ml_gpu_bridge, BlurParams, BlurType, ChromaKeyParams, ChromaticAberrationParams,
    ColorCorrectionTexParams, ColorSpace, CompositeLayer, CompositeResult, CustomShaderProcessor,
    DecodedGpuTextureHandle, DynamicUniforms, EffectDispatcher, FilmGrainParams, GlowParams,
    GpuBlurProcessor, GpuBudgetConfig, GpuBudgetController, GpuBudgetPipelineGuard,
    GpuBudgetSnapshot, GpuBufferHandle, GpuBufferHandles, GpuCompositor, GpuContext, GpuEffect,
    GpuEffectContext, GpuEffectParams, GpuElementMask, GpuEncoderFrame, GpuError, GpuInfo,
    GpuLayer, GpuLayerBuilder, GpuMaskBezierPoint, GpuMaskShape, GpuPermit, GpuReadbackTarget,
    GpuResult, GpuShapeElementData, GpuShapeFillData, GpuShapeGradientData, GpuShapeGradientStop,
    GpuShapeShadowData, GpuShapeStrokeData, GpuStyleProcessor, GpuTransitionContext,
    GpuTransitionEffect, GpuTransitionProcessor, ImportedNv12Texture, LayerPixelFormat,
    LumaKeyParams, Lut3DData, LutRegistry, MaskRasterizer, MlGpuBridge, MlGpuTexture,
    Nv12FrameData, Nv12GpuTextureSource, Nv12OutputBuffers, Nv12RenderCache, Nv12Renderer,
    Nv12TextureImporter, Nv12Uniforms, OrtGpuTensorHandle, ParamDef, PipelinePriority,
    PresetShaderMeta, RasterizedShape, RgbaToNv12Converter, RgbaToNv12Uniforms, ShapeRasterizer,
    SharpenParams, TextRenderer, TextShadowStyle, TextStyle, TextureCompositeResult,
    TextureCompositor, TextureFormat, TextureHandle, TexturePool, TextureTransitionProcessor,
    Transform2D, TransitionParams, TransitionType, UnsupportedMlGpuBridge, VignetteParams,
    NV12_TO_RGB_SHADER, RGBA_TO_NV12_SHADER,
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
#[cfg(target_os = "macos")]
pub use neko_engine_gpu::{MacOsTextureImporter, RgbaToNv12TextureConverter};
pub use neko_engine_panoramic_renderer::{
    PanoramicRenderOutput, PanoramicRenderer, PANORAMIC_RENDER_TARGET_FORMAT,
};
pub use neko_engine_puppet_renderer::{
    PuppetAtlasCache, PuppetBlendMode, PuppetMeshInput, PuppetRenderOutput, PuppetRenderRequest,
    PuppetRenderer, PuppetTextureAtlas, PuppetTextureAtlasInput, PuppetVertex, SpriteBatch,
    SpriteDraw,
};
pub use neko_engine_scene_renderer::{
    extract_render_world, AssetCache, CameraParams, ControlAckHealthSample, DegradationDecision,
    DegradationStep, FrameBudget, FrameLoadSample, FrameScheduleDecision, FrameScheduler,
    PbrRenderError, PbrRenderer, PbrVertex, RenderExtractStats, RenderGraph, RenderGraphError,
    RenderPassDesc, RenderResourceDesc, RenderResourceId, RenderResourceKind, RenderSystemLabel,
    RenderWorld, SceneRenderOutput, StandardSceneRenderGraphOptions, ViewportDescriptor,
    ViewportRenderGraphOutput, ViewportRenderGraphVariant, ViewportRenderMode, RENDER_SYSTEM_ORDER,
};
pub use neko_engine_types::BlendMode;

/// Compatibility module for callers that still import
/// `engine_kernel::gpu::custom_shader_processor::*`.
pub mod custom_shader_processor {
    pub use neko_engine_gpu::{CustomShaderProcessor, DynamicUniforms, ParamDef, PresetShaderMeta};
}

/// Compatibility module for callers that still import
/// `engine_kernel::gpu::scene_renderer::*`.
pub mod scene_renderer {
    pub use neko_engine_scene_renderer::{
        extract_render_world, AssetCache, CameraParams, ControlAckHealthSample,
        DegradationDecision, DegradationHysteresis, DegradationStep, FrameBudget, FrameLoadSample,
        FrameScheduleDecision, FrameScheduler, PbrRenderError, PbrRenderer, PbrVertex,
        RenderExtractStats, RenderGraph, RenderGraphError, RenderPassDesc, RenderResourceDesc,
        RenderResourceId, RenderResourceKind, RenderSystemLabel, RenderWorld, SceneRenderOutput,
        SceneToneMapping, StandardSceneRenderGraphOptions, ViewportDebugView, ViewportDescriptor,
        ViewportPostProcess, ViewportRenderGraphOutput, ViewportRenderGraphVariant,
        ViewportRenderMode, ViewportWorkMode, RENDER_SYSTEM_ORDER,
    };
}

/// Compatibility module for callers that still import
/// `engine_kernel::gpu::puppet_renderer::*`.
pub mod puppet_renderer {
    pub use neko_engine_puppet_renderer::{
        PuppetAtlasCache, PuppetBlendMode, PuppetMeshInput, PuppetRenderOutput,
        PuppetRenderRequest, PuppetRenderer, PuppetTextureAtlas, PuppetTextureAtlasInput,
        PuppetVertex, SpriteBatch, SpriteDraw,
    };
}

/// Compatibility module for callers that still import
/// `engine_kernel::gpu::panoramic_renderer::*`.
pub mod panoramic_renderer {
    pub use neko_engine_panoramic_renderer::{
        PanoramicRenderOutput, PanoramicRenderer, PANORAMIC_RENDER_TARGET_FORMAT,
    };
}
