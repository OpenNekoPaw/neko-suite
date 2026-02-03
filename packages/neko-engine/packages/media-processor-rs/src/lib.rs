//! Media Processor - High-performance media processing with GPU acceleration
//!
//! This crate provides video/audio encoding, decoding and GPU-accelerated effects processing
//! using wgpu for cross-platform GPU compute.
//!
//! All video encoding/decoding uses hardware acceleration (GPU).
//! Software fallback has been removed for maximum performance.

#![deny(clippy::all)]

mod animation;
mod audio;
pub mod cli;
mod decoder;
mod encoder;
mod error;
pub mod export;
pub mod frame_server;
mod gpu;
pub mod jvi;
pub mod keyframe_cache;
pub mod media_service;
pub mod monitor;

#[cfg(feature = "napi")]
mod napi;

pub use animation::{
    AnimatableValue, AnimationState, AnimationTimeline, Easing, EasingType, EvaluatedProperties,
    InterpolationMode, Keyframe, KeyframeTrack,
};
pub use audio::{
    AudioCodec, AudioDecoder, AudioEncoder, AudioEncoderConfig, AudioInfo, DecodedAudioFrame,
    EncodedAudioPacket, FfmpegAudioDecoder, FfmpegAudioEncoder, SampleFormat,
};
pub use decoder::{
    Decoder, DecodedFrame, FrameData, GpuTextureHandle, HwAccelType,
    MediaInfo, Nv12GpuTexture, PixelFormat, ZeroCopyConfig, ZeroCopyDecoder,
    detect_hw_accel, get_best_hw_accel,
};
pub use encoder::{
    AsyncExportPipeline, CompositedFrame, ContainerFormat, EncodedPacket, Encoder, EncoderConfig,
    EncoderPreset, FfmpegMuxer, HwAccelEncoder, HwEncoderType, Muxer, PipelineConfig,
    PipelineFrame, PipelineProgress, VideoCodec,
};
pub use encoder::hwaccel::{detect_hw_encoders, get_best_hw_encoder};
pub use error::{Error, Result};
pub use frame_server::{FrameServer, FrameServerConfig, FrameServerHandle};
pub use gpu::{
    ColorSpace, EffectParams, GpuContext, GpuEncoderBridge, GpuEncoderFrame,
    GpuHwEncoder, GpuLayer, GpuLayerBuilder, GpuProcessor, ImportedNv12Texture, Nv12FrameData,
    Nv12OutputBuffers, Nv12RenderCache, Nv12Renderer, Nv12TextureImporter, Nv12Uniforms,
    RgbaToNv12Converter, RgbaToNv12Uniforms, TextureCompositeResult, TextureCompositor,
    NV12_TO_RGB_SHADER, RGBA_TO_NV12_SHADER,
};
pub use jvi::JviLoader;
pub use keyframe_cache::{
    keyframe_cache_routes, CacheKey, CacheRequest, CacheStatus, CachedKeyframe, IdrScanner,
    KeyframeCacheConfig, KeyframeCacheService, KeyframeInfo, KeyframeLruCache, SourceCacheStatus,
    VideoCodecType,
};
pub use media_service::{
    ExtractedSubtitleTrack,
    MediaInfo as ProbeMediaInfo, SubtitleCue, SubtitleStream as ProbeSubtitleStream,
    extract_subtitles, probe_media_info,
};
pub use monitor::{ResourceSnapshot, SystemMonitor};

// Re-export N-API bindings when feature is enabled
#[cfg(feature = "napi")]
pub use napi::*;
