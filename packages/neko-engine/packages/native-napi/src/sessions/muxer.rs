//! Muxer session class - MuxerSession

use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::sync::Mutex;

use crate::types::{JsAudioEncoderConfig, JsEncoderConfig, JsMuxerConfig, JsMuxerPacket, JsStreamInfo};
use neko_native_core::encoder::{FfmpegMuxer, Muxer};

/// Stateful muxer session for container output
#[deprecated(note = "Use NativeEngine.dispatch() instead")]
#[napi]
pub struct MuxerSession {
    muxer: Mutex<FfmpegMuxer>,
    video_stream_index: Mutex<Option<usize>>,
    audio_stream_index: Mutex<Option<usize>>,
}

#[napi]
impl MuxerSession {
    /// Create a new muxer session
    #[napi(factory)]
    pub fn create(config: JsMuxerConfig) -> Result<Self> {
        let mut muxer = FfmpegMuxer::new();

        muxer
            .open(&config.output_path, config.container_format())
            .map_err(|e| Error::from_reason(format!("Failed to open muxer: {}", e)))?;

        Ok(Self {
            muxer: Mutex::new(muxer),
            video_stream_index: Mutex::new(None),
            audio_stream_index: Mutex::new(None),
        })
    }

    /// Add a video stream to the output
    #[napi]
    pub fn add_video_stream(&self, config: JsEncoderConfig) -> Result<JsStreamInfo> {
        let mut muxer = self
            .muxer
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock muxer"))?;

        let encoder_config = config.to_encoder_config();
        let stream_info = muxer
            .add_video_stream(&encoder_config)
            .map_err(|e| Error::from_reason(format!("Failed to add video stream: {}", e)))?;

        // Store stream index
        if let Ok(mut idx) = self.video_stream_index.lock() {
            *idx = Some(stream_info.index);
        }

        Ok(JsStreamInfo::from(&stream_info))
    }

    /// Add an audio stream to the output
    #[napi]
    pub fn add_audio_stream(&self, config: JsAudioEncoderConfig) -> Result<JsStreamInfo> {
        let mut muxer = self
            .muxer
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock muxer"))?;

        let encoder_config = config.to_audio_encoder_config();
        let stream_info = muxer
            .add_audio_stream(&encoder_config)
            .map_err(|e| Error::from_reason(format!("Failed to add audio stream: {}", e)))?;

        // Store stream index
        if let Ok(mut idx) = self.audio_stream_index.lock() {
            *idx = Some(stream_info.index);
        }

        Ok(JsStreamInfo::from(&stream_info))
    }

    /// Write the container header (must be called after adding all streams)
    #[napi]
    pub fn write_header(&self) -> Result<()> {
        let mut muxer = self
            .muxer
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock muxer"))?;

        muxer
            .write_header()
            .map_err(|e| Error::from_reason(format!("Failed to write header: {}", e)))
    }

    /// Write a video packet
    #[napi]
    pub fn write_video_packet(&self, packet: JsMuxerPacket) -> Result<()> {
        let mut muxer = self
            .muxer
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock muxer"))?;

        let stream_index = self
            .video_stream_index
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock stream index"))?
            .ok_or_else(|| Error::from_reason("No video stream added"))?;

        let encoded_packet = packet.to_encoded_packet(stream_index);
        muxer
            .write_video_packet(&encoded_packet)
            .map_err(|e| Error::from_reason(format!("Failed to write video packet: {}", e)))
    }

    /// Write an audio packet
    #[napi]
    pub fn write_audio_packet(&self, packet: JsMuxerPacket) -> Result<()> {
        let mut muxer = self
            .muxer
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock muxer"))?;

        let stream_index = self
            .audio_stream_index
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock stream index"))?
            .ok_or_else(|| Error::from_reason("No audio stream added"))?;

        let encoded_packet = packet.to_encoded_packet(stream_index);
        muxer
            .write_audio_packet(&encoded_packet)
            .map_err(|e| Error::from_reason(format!("Failed to write audio packet: {}", e)))
    }

    /// Finish muxing and close the file
    #[napi]
    pub fn finish(&self) -> Result<()> {
        let mut muxer = self
            .muxer
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock muxer"))?;

        muxer
            .finish()
            .map_err(|e| Error::from_reason(format!("Failed to finish muxer: {}", e)))
    }

    /// Check if muxer is open
    #[napi]
    pub fn is_open(&self) -> Result<bool> {
        let muxer = self
            .muxer
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock muxer"))?;

        Ok(muxer.is_open())
    }
}
