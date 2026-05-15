//! Temporary GPU compatibility surface.
//!
//! Reusable GPU infrastructure now lives in `neko-engine-gpu`. This module
//! keeps existing `neko_engine_kernel::gpu::*` imports stable while renderer
//! companion modules move through explicit compatibility re-exports before P3
//! narrows the host-facing facade.

pub mod boundary;

pub use neko_engine_gpu::*;
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

/// Compatibility module for callers that still import
/// `engine_kernel::gpu::custom_shader_processor::*`.
pub mod custom_shader_processor {
    pub use neko_engine_gpu::{CustomShaderProcessor, DynamicUniforms, ParamDef, PresetShaderMeta};
}

/// Compatibility module for callers that still import
/// `engine_kernel::gpu::scene_renderer::*`.
pub mod scene_renderer {
    pub use neko_engine_scene_renderer::*;
}

/// Compatibility module for callers that still import
/// `engine_kernel::gpu::puppet_renderer::*`.
pub mod puppet_renderer {
    pub use neko_engine_puppet_renderer::*;
}

/// Compatibility module for callers that still import
/// `engine_kernel::gpu::panoramic_renderer::*`.
pub mod panoramic_renderer {
    pub use neko_engine_panoramic_renderer::*;
}
