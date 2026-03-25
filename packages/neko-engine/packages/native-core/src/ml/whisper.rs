//! Whisper STT inference — audio file → text transcription.
//!
//! TODO(P1): Implement full pipeline (mel spectrogram + encoder + decoder)
//! when ort 2.0 stable is released.

use crate::error::{Error, Result};

/// Transcription result from Whisper STT.
#[derive(Debug, serde::Serialize)]
pub struct TranscribeResult {
    pub text: String,
    pub language: Option<String>,
    pub duration_secs: Option<f64>,
}

/// Transcribe audio file to text using Whisper ONNX model.
pub fn transcribe(
    _session: &mut ort::session::Session,
    audio_path: &str,
    language: Option<&str>,
) -> Result<TranscribeResult> {
    if !std::path::Path::new(audio_path).exists() {
        return Err(Error::FileNotFound(audio_path.to_string()));
    }

    Err(Error::Other(format!(
        "Whisper transcription not yet implemented (ort 2.0 RC). \
         Audio: {}, Language: {}",
        audio_path,
        language.unwrap_or("auto")
    )))
}
