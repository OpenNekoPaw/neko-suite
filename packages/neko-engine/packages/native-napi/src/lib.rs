//! Neko Native NAPI - Node.js N-API bindings for neko-native-core

mod bridge;
mod engine;
mod media_processor;
mod sessions;
mod standalone;
mod types;

// New unified API (Phase 4)
pub use engine::NativeEngine;

// Bridge functions (Phase A + B)
pub use bridge::{
    bridge_audio_info, bridge_encode_jpeg, bridge_extract_frame,
    bridge_extract_subtitles, bridge_generate_waveform, bridge_get_keyframes, bridge_gpu_info,
    bridge_probe_media,
};

// Legacy API - MediaProcessor (deprecated)
pub use media_processor::MediaProcessor;

// Legacy API - Session classes (deprecated)
pub use sessions::{
    AudioDecoderSession, AudioEncoderSession, CompositorSession, FrameServerSession,
    FrameServerWithExportSession, JsFrameServerConfig, JsFrameServerStats, MuxerSession,
    VideoEncoderSession,
    // Animation
    AnimationSession, create_bounce_animation, create_fade_in_animation,
    create_fade_out_animation, create_pulse_animation, create_slide_in_left_animation,
    create_zoom_in_animation,
    // Pipeline
    ExportPipelineSession, JsPreviewFrame, JsPreviewPipelineConfig, PreviewPipelineSession,
};

// Legacy API - Standalone functions (deprecated)
pub use standalone::{
    composite_frame, encode_jpeg, extract_all_subtitles, extract_frame, probe_media,
    JsCompositeFrameRequest, JsExtractCompositeLayer, JsExtractedFrameWithData,
};

// Shared types
pub use types::{
    JsAudioCodec, JsAudioEncoderConfig, JsAudioFrame, JsAudioInfo, JsContainerFormat,
    JsDecoderConfig, JsEffectParams, JsEncodedAudioPacket, JsEncodedPacket, JsEncoderConfig,
    JsEncoderPreset, JsFrameData, JsGpuInfo, JsHwAccelInfo, JsMuxerConfig, JsMuxerPacket,
    JsSampleFormat, JsStreamInfo, JsTextureFormat, JsTextureHandle, JsVideoCodec,
    // Media service types
    JsExtractedSubtitleTrack, JsProbeMediaInfo, JsProbeSubtitleStream, JsSubtitleCue,
    // Compositor types
    JsBlendMode, JsCompositeLayer, JsCompositeResult, JsTransform2D,
    // Animation types
    JsAnimatableValue, JsEasingType, JsEvaluatedProperties, JsInterpolationMode, JsKeyframe,
    JsKeyframeTrack,
    // Pipeline types
    JsPipelineConfig, JsPipelineFrame, JsPipelineProgress,
    // Effect types
    JsBlurParams, JsChromaticAberrationParams, JsFilmGrainParams, JsGlowParams, JsSharpenParams,
    JsTransitionParams, JsVignetteParams,
};
