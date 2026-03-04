//! Neko Native Core - High-performance media processing with GPU acceleration
//!
//! # Architecture (MVC)
//! - `domain/` — Domain models with behavior (Timeline, Transform, TaskHandle, etc.)
//! - `services/` — Service traits and implementations
//! - Infrastructure: `gpu/`, `decoder/`, `encoder/`, `audio/`, `export/`, etc.
//!
//! # Usage
//! ```rust
//! use neko_native_core::prelude::*;
//! // or import from specific modules:
//! use neko_native_core::gpu::GpuContext;
//! use neko_native_core::services::VideoService;
//! ```

#![deny(clippy::all)]

pub mod animation;
pub mod audio;
pub mod decoder;
pub mod domain;
pub mod encoder;
pub mod error;
pub mod export;
pub mod frame_server;
pub mod gpu;
pub mod jvi;
pub mod media_service;
pub mod monitor;
pub mod preview;
pub mod services;
pub mod telemetry;

/// Prelude — commonly used types for convenience
pub mod prelude {
    pub use crate::error::{Error, Result};
    pub use crate::services::{
        IAudioService, IExportService, IImageService, INodeService,
        IStreamPlayback, ITaskService, ITimelineService, IVideoService,
        AudioService, ExportService as CoreExportService, ImageService,
        NodeService, ServiceContainer, TaskService, TimelineService, VideoService,
    };
    pub use crate::domain::{FrameData, StreamConfig, Timeline};
    pub use crate::gpu::GpuContext;
}
