//! Service traits for dependency injection
//!
//! This module defines the service interfaces (traits) that abstract business logic.
//! Implementations can be swapped for testing or different backends.

mod audio;
mod export;
mod image;
mod node;
mod task;
mod timeline;
mod media;
mod video;

pub mod impls;

pub use audio::IAudioService;
pub use export::IExportService;
pub use image::IImageService;
pub use media::IMediaStreamService;
pub use node::{GpuInfo, INodeService};
pub use task::ITaskService;
pub use timeline::ITimelineService;
pub use video::IVideoService;

// Re-export implementations
pub use impls::{
    AudioService, ExportService, ImageService, MediaStreamService, NodeService, ServiceContainer,
    TaskService, TimelineService, VideoService,
};
