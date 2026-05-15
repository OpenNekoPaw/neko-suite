//! Neko Native Core - high-performance media processing with GPU acceleration.
//!
//! # Public Surface
//! - Stable host entry points: `facade`, `contracts`, `error`, `telemetry`.
//! - Implementation modules are crate-private; host code should use `facade`
//!   for construction and `contracts` for DTOs, traits, and helper APIs.
//!
//! # Usage
//! ```rust
//! use neko_engine_kernel::prelude::*;
//! use neko_engine_kernel::facade::EngineKernelFacade;
//! ```

#![deny(clippy::all)]
#![allow(unexpected_cfgs)]

// Implementation modules are crate-private after the P3 facade narrowing. Many
// keep migration-only APIs or compatibility re-exports that are surfaced through
// `contracts`/`facade`, so suppress private-item lint noise at the module edge.
#[allow(dead_code, unused_imports)]
pub(crate) mod animation;
#[allow(dead_code, unused_imports)]
pub(crate) mod audio;
pub mod contracts;
#[allow(dead_code, unused_imports)]
pub(crate) mod decoder;
#[allow(dead_code, unused_imports)]
pub(crate) mod domain;
#[allow(dead_code, unused_imports)]
pub(crate) mod encoder;
pub mod error;
#[allow(dead_code, unused_imports)]
pub(crate) mod export;
pub mod facade;
#[allow(dead_code, unused_imports)]
pub(crate) mod generators;
#[allow(dead_code, unused_imports)]
pub(crate) mod gpu;
#[allow(dead_code, unused_imports)]
pub(crate) mod jvi;
#[allow(dead_code, unused_imports)]
pub(crate) mod media_service;
#[allow(dead_code, unused_imports)]
pub(crate) mod monitor;
#[allow(dead_code, unused_imports)]
pub(crate) mod preview;
#[allow(dead_code, unused_imports)]
pub(crate) mod services;
pub mod telemetry;

#[cfg(test)]
mod architecture_tests;

// NOTE: ml module moved to neko-runtime-ml

/// Prelude — commonly used types for convenience
pub mod prelude {
    pub use crate::contracts::domain::{FrameData, StreamConfig, Timeline};
    pub use crate::contracts::gpu::GpuContext;
    pub use crate::contracts::services::{
        AudioService, ExportService as CoreExportService, IAudioService, IDeviceBindingService,
        IExportService, IImageService, INodeService, IStreamPlayback, ITaskService,
        ITimelineService, IVideoService, ImageService, NodeService, TaskService, TimelineService,
        VideoService,
    };
    pub use crate::error::{Error, Result};
    pub use crate::facade::{EngineKernelFacade, KernelServices, ServiceFactory};
}
