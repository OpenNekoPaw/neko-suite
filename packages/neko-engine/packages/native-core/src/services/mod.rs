//! Service traits for dependency injection
//!
//! This module defines the service interfaces (traits) that abstract business logic.
//! Implementations can be swapped for testing or different backends.

mod audio;
mod effects;
mod export;
mod image;
mod node;
mod playback;
mod scene;
mod task;
mod timeline;
mod video;

pub mod impls;

pub use audio::IAudioService;
pub use effects::IEffectsService;
pub use export::IExportService;
pub use image::IImageService;
pub use node::{GpuInfo, INodeService};
pub use playback::IStreamPlayback;
pub use scene::ISceneService;
pub use task::ITaskService;
pub use timeline::{ITimelineService, StreamStats, TimelineStreamResult};
pub use video::IVideoService;

// Re-export implementations
pub use impls::{
    AudioService, EffectsService, ExportService, ImageService, NodeService, SceneService,
    ServiceContainer, TaskService, TimelineService, VideoService,
};
