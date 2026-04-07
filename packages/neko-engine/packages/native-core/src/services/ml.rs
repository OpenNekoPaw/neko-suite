//! ML service trait — interface for ONNX model inference operations.

use crate::error::Result;

#[cfg(feature = "onnx")]
use crate::ml;
#[cfg(feature = "onnx")]
use crate::ml::ModelInfo;

/// ML service interface for model management and inference.
///
/// Gated behind `onnx` feature. When disabled, ModelsController
/// returns "not available" for ML actions.
#[allow(async_fn_in_trait)]
pub trait IMlService: Send + Sync {
    /// Register a model (metadata only, lazy load on first use).
    fn register_model(&self, name: &str, path: &str, framework: &str, task: &str) -> Result<()>;

    /// Unregister a model (also unloads if loaded).
    fn unregister_model(&self, name: &str) -> Result<()>;

    /// List all registered models.
    fn list_models(&self) -> Vec<serde_json::Value>;

    /// Upscale an image using the specified model.
    fn upscale(&self, model: &str, input: &str, output: &str, scale: u32) -> Result<()>;

    /// Denoise an image using the specified model.
    fn denoise(&self, model: &str, input: &str, output: &str, strength: f32) -> Result<()>;

    /// Compute CLIP similarity score between an image and text.
    fn clip_score(&self, model: &str, image: &str, text: &str) -> Result<f32>;

    /// Transcribe audio to text with timestamps using Whisper model.
    fn transcribe(&self, model: &str, audio: &str) -> Result<ml::whisper::TranscribeResult>;
}
