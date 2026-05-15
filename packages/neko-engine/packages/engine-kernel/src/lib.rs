//! Neko Native Core - High-performance media processing with GPU acceleration
//!
//! # Architecture (MVC)
//! - `domain/` — Domain models with behavior (Timeline, Transform, TaskHandle, etc.)
//! - `services/` — Service traits and implementations
//! - Infrastructure: `gpu/`, `decoder/`, `encoder/`, `audio/`, `export/`, etc.
//!
//! # Usage
//! ```rust
//! use neko_engine_kernel::prelude::*;
//! // or import from specific modules:
//! use neko_engine_kernel::gpu::GpuContext;
//! use neko_engine_kernel::services::VideoService;
//! ```

#![deny(clippy::all)]
#![allow(unexpected_cfgs)]

pub mod animation;
pub mod audio;
pub mod decoder;
pub mod domain;
pub mod encoder;
pub mod error;
pub mod export;
pub mod generators;
pub mod gpu;
pub mod jvi;
pub mod media_service;
pub mod monitor;
pub mod preview;
pub mod services;
pub mod telemetry;

#[cfg(test)]
mod architecture_tests;

// NOTE: ml module moved to neko-runtime-ml

// Re-export puppet world types so higher-level crates (host-api, host-http)
// can access them without depending directly on neko-runtime-puppet
pub use neko_runtime_puppet::world::PuppetDelta;

/// Prelude — commonly used types for convenience
pub mod prelude {
    pub use crate::domain::{FrameData, StreamConfig, Timeline};
    pub use crate::error::{Error, Result};
    pub use crate::gpu::GpuContext;
    pub use crate::services::{
        AudioService, ExportService as CoreExportService, IAudioService, IDeviceBindingService,
        IExportService, IImageService, INodeService, IStreamPlayback, ITaskService,
        ITimelineService, IVideoService, ImageService, NodeService, TaskService, TimelineService,
        VideoService,
    };
}
