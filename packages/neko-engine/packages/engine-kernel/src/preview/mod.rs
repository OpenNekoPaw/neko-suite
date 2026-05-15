//! Preview module - Real-time H.264 streaming for timeline preview
//!
//! Provides zero-copy GPU pipeline for real-time preview:
//! - Decode → Composite → RGBA→NV12 (IOSurface) → H.264 Encode → WebSocket
//!
//! All processing stays on GPU until final H.264 output.

mod backend;
mod pipeline;
mod provider;

pub use backend::{
    DefaultPreviewProviderBackend, DefaultPreviewRenderBackendFactory, PreviewEncodeBackend,
    PreviewProviderBackend, PreviewRenderBackend, PreviewRenderBackendFactory,
};
pub use pipeline::{PreviewFrame, PreviewPipeline, PreviewPipelineConfig};
pub use provider::{
    DocumentPreviewProvider, ImagePreviewProvider, PreviewArtifact, PreviewArtifactKind,
    PreviewProvider, PreviewProviderKind, PreviewProviderRegistry, PreviewProviderVariantRequest,
    PreviewRequest, PuppetPreviewProvider, ScenePreviewProvider, VideoPreviewProvider,
};
