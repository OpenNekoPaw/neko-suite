//! Neko Native NAPI - Node.js N-API bindings for neko-native-core

mod bridge;
mod engine;
mod media_processor;
mod types;

// New unified API (Phase 4)
pub use engine::NativeEngine;

// Bridge functions (Phase A - stateless migration)
pub use bridge::{
    bridge_audio_info, bridge_extract_frame, bridge_extract_subtitles, bridge_generate_waveform,
    bridge_get_keyframes, bridge_gpu_info, bridge_probe_media,
};

// Legacy API (to be deprecated in Phase 5)
pub use media_processor::{
    AudioDecoderSession, AudioEncoderSession, FrameServerSession, FrameServerWithExportSession,
    JsFrameServerConfig, JsFrameServerStats, MediaProcessor, MuxerSession, VideoEncoderSession,
    // Media service functions
    extract_all_subtitles, probe_media, encode_jpeg,
    // Frame extraction functions
    extract_frame, composite_frame, JsExtractCompositeLayer, JsCompositeFrameRequest,
    JsExtractedFrameWithData,
};
pub use types::{
    JsAudioCodec, JsAudioEncoderConfig, JsAudioFrame, JsAudioInfo, JsContainerFormat,
    JsDecoderConfig, JsEffectParams, JsEncodedAudioPacket, JsEncodedPacket, JsEncoderConfig,
    JsEncoderPreset, JsFrameData, JsGpuInfo, JsHwAccelInfo, JsMuxerConfig, JsMuxerPacket,
    JsSampleFormat, JsStreamInfo, JsTextureFormat, JsTextureHandle, JsVideoCodec,
    // Media service types
    JsExtractedSubtitleTrack, JsProbeMediaInfo, JsProbeSubtitleStream,
    JsSubtitleCue,
};
