//! Session classes for stateful N-API bindings
//!
//! These are legacy session classes that wrap native-core types for direct
//! N-API consumption. New code should prefer using `NativeEngine.dispatch()`.

pub mod animation;
pub mod compositor;
pub mod decoder;
pub mod encoder;
pub mod frame_server;
pub mod muxer;
pub mod pipeline;

// Re-export all session types
pub use animation::{
    AnimationSession, create_bounce_animation, create_fade_in_animation,
    create_fade_out_animation, create_pulse_animation, create_slide_in_left_animation,
    create_zoom_in_animation,
};
pub use compositor::CompositorSession;
pub use decoder::AudioDecoderSession;
pub use encoder::{AudioEncoderSession, VideoEncoderSession};
pub use frame_server::{
    FrameServerSession, FrameServerWithExportSession, JsFrameServerConfig, JsFrameServerStats,
};
pub use muxer::MuxerSession;
pub use pipeline::{
    ExportPipelineSession, JsPreviewFrame, JsPreviewPipelineConfig, PreviewPipelineSession,
};
