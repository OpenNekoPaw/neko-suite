//! runtime-ml — ML inference runtime for Neko Engine
//!
//! Provides ONNX model registry, lazy loading with LRU eviction,
//! and domain-specific inference pipelines:
//! - Image upscaling (Real-ESRGAN/SwinIR)
//! - Image denoising
//! - CLIP score (image-text similarity)
//! - Whisper STT (speech-to-text)
//!
//! Service traits, DTOs, and errors are owned here so the runtime can be
//! compiled and tested without engine-kernel orchestration.

pub mod error;
pub mod ml;
mod service;
mod service_trait;

#[cfg(test)]
mod architecture_tests;

pub use error::{Error, MlError, MlResult, Result};
pub use ml::onnx_runtime::DeviceSelection;
pub use ml::{ModelInfo, ModelRegistry};
pub use service::MlService;
pub use service_trait::IMlService;
