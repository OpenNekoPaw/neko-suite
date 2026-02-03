//! Neko Native NAPI - Node.js N-API bindings for neko-native-core

mod media_processor;
mod types;

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
