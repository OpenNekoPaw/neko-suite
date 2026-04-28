//! Service implementations
//!
//! This module contains concrete implementations of the service traits,
//! wrapping the infrastructure layer (gpu, decoder, encoder, etc.).

mod audio;
pub(crate) mod common;
mod effects;
mod export;
mod image;
mod node;
mod puppet;
mod scene;
mod scene_command_queue;
pub(crate) mod stream_loop;
mod task;
mod timeline;
mod video;

// NOTE: ml impl moved to neko-runtime-ml
// NOTE: ServiceContainer removed — EngineApi (host-api) handles service assembly

pub use audio::AudioService;
pub use effects::EffectsService;
pub use export::ExportService;
pub use image::ImageService;
pub use node::NodeService;
pub use puppet::PuppetService;
pub use scene::SceneService;
pub use task::TaskService;
pub use timeline::TimelineService;
pub use video::VideoService;

// NOTE: MlService moved to neko-runtime-ml
