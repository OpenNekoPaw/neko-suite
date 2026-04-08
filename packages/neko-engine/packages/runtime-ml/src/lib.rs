//! runtime-ml — ML inference runtime for Neko Engine
//!
//! Provides ONNX model registry, lazy loading with LRU eviction,
//! and domain-specific inference pipelines:
//! - Image upscaling (Real-ESRGAN/SwinIR)
//! - Image denoising
//! - CLIP score (image-text similarity)
//! - Whisper STT (speech-to-text)
//!
//! Service trait (`IMlService`) is defined in engine-kernel;
//! this crate provides the concrete `MlService` implementation.

pub mod ml;
mod service;
mod service_trait;

pub use ml::onnx_runtime::DeviceSelection;
pub use ml::{ModelInfo, ModelRegistry};
pub use service::MlService;
pub use service_trait::IMlService;
