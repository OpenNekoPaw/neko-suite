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
mod video;

pub mod impls;

pub use audio::IAudioService;
pub use export::IExportService;
pub use image::IImageService;
pub use node::{GpuInfo, INodeService};
pub use task::ITaskService;
pub use timeline::{ITimelineService, SeekDirection};
pub use video::IVideoService;

// Re-export implementations
pub use impls::{
    AudioService, ExportService, ImageService, NodeService, ServiceContainer, TaskService,
    TimelineService, VideoService,
};
