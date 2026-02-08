//! Decoder session classes - AudioDecoderSession

use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::sync::Mutex;

use crate::types::{JsAudioFrame, JsAudioInfo};
use neko_native_core::audio::{AudioDecoder, FfmpegAudioDecoder};

/// Stateful audio decoder session
#[deprecated(note = "Use NativeEngine.dispatch() instead")]
#[napi]
pub struct AudioDecoderSession {
    pub(crate) decoder: Mutex<FfmpegAudioDecoder>,
    pub(crate) info: JsAudioInfo,
}

#[napi]
impl AudioDecoderSession {
    /// Get audio info
    #[napi]
    pub fn get_info(&self) -> JsAudioInfo {
        self.info.clone()
    }

    /// Seek to time position
    #[napi]
    pub fn seek(&self, time_seconds: f64) -> Result<()> {
        let mut decoder = self
            .decoder
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock decoder"))?;

        decoder
            .seek(time_seconds)
            .map_err(|e| Error::from_reason(format!("Failed to seek: {}", e)))
    }

    /// Decode next frame
    #[napi]
    pub fn decode_next(&self) -> Result<Option<JsAudioFrame>> {
        let mut decoder = self
            .decoder
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock decoder"))?;

        match decoder.decode_next() {
            Ok(Some(frame)) => Ok(Some(JsAudioFrame::from(&frame))),
            Ok(None) => Ok(None),
            Err(e) => Err(Error::from_reason(format!("Failed to decode: {}", e))),
        }
    }

    /// Get current position
    #[napi]
    pub fn position(&self) -> Result<f64> {
        let decoder = self
            .decoder
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock decoder"))?;

        Ok(decoder.position())
    }

    /// Close the decoder
    #[napi]
    pub fn close(&self) -> Result<()> {
        let mut decoder = self
            .decoder
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock decoder"))?;

        decoder.close();
        Ok(())
    }
}
