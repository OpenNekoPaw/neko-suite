//! Encoder session classes - VideoEncoderSession and AudioEncoderSession

use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::sync::Mutex;

use crate::types::{JsAudioEncoderConfig, JsEncodedAudioPacket, JsEncodedPacket, JsFrameData};
use neko_native_core::audio::{AudioEncoder, FfmpegAudioEncoder};
use neko_native_core::encoder::{Encoder, HwAccelEncoder};

/// Stateful video encoder session (GPU only)
#[deprecated(note = "Use NativeEngine.dispatch() instead")]
#[napi]
pub struct VideoEncoderSession {
    pub(crate) encoder: Mutex<HwAccelEncoder>,
    /// Whether hardware encoding is active
    pub(crate) hw_active: bool,
}

#[napi]
impl VideoEncoderSession {
    /// Check if hardware encoding is active
    #[napi]
    pub fn is_hw_active(&self) -> bool {
        self.hw_active
    }

    /// Encode a frame
    #[napi]
    pub fn encode_frame(&self, frame: JsFrameData, pts: i64) -> Result<Vec<JsEncodedPacket>> {
        let mut encoder = self
            .encoder
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock encoder"))?;

        let packets = encoder
            .encode_frame(&frame.data, pts)
            .map_err(|e| Error::from_reason(format!("Failed to encode frame: {}", e)))?;

        Ok(packets.iter().map(JsEncodedPacket::from).collect())
    }

    /// Flush encoder and get remaining packets
    #[napi]
    pub fn flush(&self) -> Result<Vec<JsEncodedPacket>> {
        let mut encoder = self
            .encoder
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock encoder"))?;

        let packets = encoder
            .flush()
            .map_err(|e| Error::from_reason(format!("Failed to flush encoder: {}", e)))?;

        Ok(packets.iter().map(JsEncodedPacket::from).collect())
    }

    /// Close the encoder
    #[napi]
    pub fn close(&self) -> Result<()> {
        let mut encoder = self
            .encoder
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock encoder"))?;

        encoder.close();
        Ok(())
    }
}

/// Stateful audio encoder session
#[deprecated(note = "Use NativeEngine.dispatch() instead")]
#[napi]
pub struct AudioEncoderSession {
    pub(crate) encoder: Mutex<FfmpegAudioEncoder>,
}

#[napi]
impl AudioEncoderSession {
    /// Encode audio samples
    #[napi]
    pub fn encode_frame(&self, data: Buffer, samples: u32) -> Result<Vec<JsEncodedAudioPacket>> {
        let mut encoder = self
            .encoder
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock encoder"))?;

        let packets = encoder
            .encode_frame(&data, samples as usize)
            .map_err(|e| Error::from_reason(format!("Failed to encode audio: {}", e)))?;

        Ok(packets.iter().map(JsEncodedAudioPacket::from).collect())
    }

    /// Flush encoder and get remaining packets
    #[napi]
    pub fn flush(&self) -> Result<Vec<JsEncodedAudioPacket>> {
        let mut encoder = self
            .encoder
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock encoder"))?;

        let packets = encoder
            .flush()
            .map_err(|e| Error::from_reason(format!("Failed to flush encoder: {}", e)))?;

        Ok(packets.iter().map(JsEncodedAudioPacket::from).collect())
    }

    /// Close the encoder
    #[napi]
    pub fn close(&self) -> Result<()> {
        let mut encoder = self
            .encoder
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock encoder"))?;

        encoder.close();
        Ok(())
    }
}
