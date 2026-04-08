//! Service traits for dependency injection
//!
//! This module defines the service interfaces (traits) that abstract business logic.
//! Implementations can be swapped for testing or different backends.

mod audio;
pub mod audio_mixdown;
pub mod camera;
mod effects;
mod export;
pub mod gamepad;
mod image;
pub mod midi;
mod node;
mod playback;
mod puppet;
mod scene;
mod task;
mod timeline;
mod video;

// NOTE: ml service trait and impl moved to neko-runtime-ml

pub mod impls;

pub use audio::IAudioService;
pub use camera::ICameraService;
pub use effects::IEffectsService;
pub use export::IExportService;
pub use gamepad::IGamepadService;
pub use image::IImageService;
pub use midi::IMidiService;
pub use node::{GpuInfo, INodeService};
pub use playback::IStreamPlayback;
pub use puppet::IPuppetService;
pub use scene::ISceneService;
pub use task::ITaskService;
pub use timeline::{ITimelineService, StreamStats, TimelineStreamResult};
pub use video::IVideoService;

// Re-export implementations
// NOTE: CameraService, MidiService, GamepadService moved to neko-runtime-device
// NOTE: MlService moved to neko-runtime-ml
pub use impls::{
    AudioService, EffectsService, ExportService, ImageService, NodeService, PuppetService,
    SceneService, ServiceContainer, TaskService, TimelineService, VideoService,
};

// NOTE: MlService and IMlService moved to neko-runtime-ml
